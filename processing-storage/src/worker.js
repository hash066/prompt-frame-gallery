const Queue = require('bull')
const Redis = require('redis')
const sharp = require('sharp')
const exifr = require('exifr')
const fs = require('fs-extra')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const winston = require('winston')
const Minio = require('minio')

// Load environment variables
require('dotenv').config()

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/worker-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/worker-combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
})

// Initialize Redis and Queue
const redis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      logger.error('Redis connection refused, retrying...')
      return new Error('Redis connection refused')
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      logger.error('Redis retry time exhausted')
      return new Error('Retry time exhausted')
    }
    if (options.attempt > 10) {
      logger.error('Redis max retry attempts reached')
      return undefined
    }
    return Math.min(options.attempt * 100, 3000)
  }
})

// Add comprehensive Redis error handling
redis.on('error', (err) => {
  logger.error('Redis connection error:', err)
  if (err.code === 'ECONNREFUSED') {
    logger.error('Redis server is not running. Please start Redis server.')
  }
})

redis.on('connect', () => {
  logger.info('Connected to Redis')
})

redis.on('ready', () => {
  logger.info('Redis client ready')
})

redis.on('reconnecting', () => {
  logger.info('Redis client reconnecting...')
})

redis.on('end', () => {
  logger.warn('Redis connection ended')
})

// Parse Redis URL to get host and port for Bull Queue
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const url = new URL(redisUrl)
const redisHost = url.hostname
const redisPort = parseInt(url.port) || 6379

const imageProcessingQueue = new Queue('image processing', {
  redis: {
    host: redisHost,
    port: redisPort
  },
  settings: {
    stalledInterval: 30 * 1000,
    maxStalledCount: 1
  }
})

// Initialize MinIO client
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
})

const BUCKET_NAME = process.env.MINIO_BUCKET || 'images'

// Ensure bucket exists with retry logic
const ensureBucket = async (retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info(`Ensuring bucket exists (attempt ${attempt}/${retries})`)
      
      const exists = await minioClient.bucketExists(BUCKET_NAME)
      if (!exists) {
        await minioClient.makeBucket(BUCKET_NAME, 'us-east-1')
        logger.info(`Created bucket: ${BUCKET_NAME}`)
      } else {
        logger.info(`Bucket ${BUCKET_NAME} already exists`)
      }
      
      // Test bucket access with a small test object
      const testKey = `test-bucket-access-${Date.now()}.txt`
      const testData = Buffer.from('test bucket access')
      
      await minioClient.putObject(BUCKET_NAME, testKey, testData, {
        'Content-Type': 'text/plain'
      })
      
      // Clean up test object
      await minioClient.removeObject(BUCKET_NAME, testKey)
      
      logger.info('Bucket access verified successfully')
      return true
      
    } catch (error) {
      logger.error(`Error ensuring bucket exists (attempt ${attempt}/${retries}):`, error)
      
      if (attempt === retries) {
        logger.error('Failed to ensure bucket exists after all retries')
        throw error
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
    }
  }
}

// Initialize bucket
ensureBucket().catch(error => {
  logger.error('Failed to initialize bucket:', error)
  process.exit(1)
})

// Processing configuration
const PROCESSING_CONFIG = {
  responsiveSizes: [320, 640, 1024, 2048],
  thumbnailSize: 200,
  quality: {
    jpeg: 85,
    webp: 80,
    avif: 70
  },
  formats: ['jpeg', 'webp', 'avif']
}

// Image processing job
const workerConcurrency = parseInt(process.env.WORKER_CONCURRENCY || '5')

// Bull v4 API: process(name, concurrency, processor)
imageProcessingQueue.process('processImage', Number.isFinite(workerConcurrency) ? workerConcurrency : 1, async (job) => {
  const { imageId, imageData, originalName, mimeType } = job.data
  
  logger.info(`Starting image processing for: ${imageId}`)
  
  try {
    // Update job progress
    await job.progress(10)
    
    // Convert base64 image data back to buffer
    const imageBuffer = Buffer.from(imageData, 'base64')
    const metadata = await sharp(imageBuffer).metadata()
    
    logger.info(`Image metadata: ${JSON.stringify(metadata)}`)
    
    // Extract EXIF data from buffer
    const exifData = await exifr.parse(imageBuffer)
    logger.info(`EXIF data extracted: ${exifData ? 'Yes' : 'No'}`)
    
    // Update progress
    await job.progress(20)
    
    // Create storage paths
    const basePath = `images/${imageId}`
    const rawPath = `${basePath}/raw/${originalName}`
    const thumbnailPath = `${basePath}/thumbnails/thumbnail.jpg`
    const responsivePaths = {}
    
    // Upload raw file with error handling
    try {
      await minioClient.putObject(BUCKET_NAME, rawPath, imageBuffer, {
        'Content-Type': metadata.format === 'jpeg' ? 'image/jpeg' : `image/${metadata.format}`
      })
      logger.info(`Raw file uploaded: ${rawPath}`)
    } catch (error) {
      logger.error(`Failed to upload raw file: ${rawPath}`, error)
      throw new Error(`Failed to upload raw file: ${error.message}`)
    }
    
    await job.progress(30)
    
    // Generate thumbnail
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(PROCESSING_CONFIG.thumbnailSize, PROCESSING_CONFIG.thumbnailSize, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: PROCESSING_CONFIG.quality.jpeg })
      .toBuffer()
    
    // Upload thumbnail with error handling
    try {
      await minioClient.putObject(BUCKET_NAME, thumbnailPath, thumbnailBuffer, {
        'Content-Type': 'image/jpeg'
      })
      logger.info(`Thumbnail generated: ${thumbnailPath}`)
    } catch (error) {
      logger.error(`Failed to upload thumbnail: ${thumbnailPath}`, error)
      throw new Error(`Failed to upload thumbnail: ${error.message}`)
    }
    
    await job.progress(50)
    
    // Generate responsive sizes
    let progressStep = 50
    const progressIncrement = 40 / PROCESSING_CONFIG.responsiveSizes.length
    
    for (const size of PROCESSING_CONFIG.responsiveSizes) {
      const responsivePath = `${basePath}/responsive/${size}w`
      
      try {
        // Generate JPEG version
        const jpegBuffer = await sharp(imageBuffer)
          .resize(size, null, {
            withoutEnlargement: true,
            fit: 'inside'
          })
          .jpeg({ quality: PROCESSING_CONFIG.quality.jpeg })
          .toBuffer()
        
        await minioClient.putObject(BUCKET_NAME, `${responsivePath}.jpg`, jpegBuffer, {
          'Content-Type': 'image/jpeg'
        })
        
        // Generate WebP version
        const webpBuffer = await sharp(imageBuffer)
          .resize(size, null, {
            withoutEnlargement: true,
            fit: 'inside'
          })
          .webp({ quality: PROCESSING_CONFIG.quality.webp })
          .toBuffer()
        
        await minioClient.putObject(BUCKET_NAME, `${responsivePath}.webp`, webpBuffer, {
          'Content-Type': 'image/webp'
        })
        
        // Generate AVIF version
        const avifBuffer = await sharp(imageBuffer)
          .resize(size, null, {
            withoutEnlargement: true,
            fit: 'inside'
          })
          .avif({ quality: PROCESSING_CONFIG.quality.avif })
          .toBuffer()
        
        await minioClient.putObject(BUCKET_NAME, `${responsivePath}.avif`, avifBuffer, {
          'Content-Type': 'image/avif'
        })
        
        responsivePaths[size] = {
          jpeg: `${responsivePath}.jpg`,
          webp: `${responsivePath}.webp`,
          avif: `${responsivePath}.avif`
        }
        
        logger.info(`Responsive size ${size}w generated`)
        
      } catch (error) {
        logger.error(`Failed to generate responsive size ${size}w:`, error)
        throw new Error(`Failed to generate responsive size ${size}w: ${error.message}`)
      }
      
      progressStep += progressIncrement
      await job.progress(Math.round(progressStep))
    }
    
    // Generate signed URLs
    const signedUrls = {
      original: await minioClient.presignedGetObject(
        BUCKET_NAME, 
        rawPath, 
        parseInt(process.env.SIGNED_URL_EXPIRY) || 3600
      ),
      thumbnail: await minioClient.presignedGetObject(
        BUCKET_NAME, 
        thumbnailPath, 
        parseInt(process.env.SIGNED_URL_EXPIRY) || 3600
      ),
      responsive: {}
    }
    
    // Generate signed URLs for responsive images
    for (const [size, paths] of Object.entries(responsivePaths)) {
      signedUrls.responsive[size] = {
        jpeg: await minioClient.presignedGetObject(
          BUCKET_NAME, 
          paths.jpeg, 
          parseInt(process.env.SIGNED_URL_EXPIRY) || 3600
        ),
        webp: await minioClient.presignedGetObject(
          BUCKET_NAME, 
          paths.webp, 
          parseInt(process.env.SIGNED_URL_EXPIRY) || 3600
        ),
        avif: await minioClient.presignedGetObject(
          BUCKET_NAME, 
          paths.avif, 
          parseInt(process.env.SIGNED_URL_EXPIRY) || 3600
        )
      }
    }
    
    await job.progress(95)
    
    // Update progress to complete
    await job.progress(100)
    
    // Return processing results
    const result = {
      success: true,
      imageId,
      paths: {
        raw: rawPath,
        thumbnail: thumbnailPath,
        responsive: responsivePaths
      },
      urls: signedUrls,
      metadata: {
        ...metadata,
        exif: exifData
      }
    }
    
    logger.info(`Image processing completed successfully: ${imageId}`)
    return result
    
  } catch (error) {
    logger.error(`Image processing failed for ${imageId}:`, error)
    throw error
  }
})

// Queue event handlers
imageProcessingQueue.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed successfully`)
  logger.info(`Processed image: ${result.imageId}`)
})

imageProcessingQueue.on('failed', (job, error) => {
  logger.error(`Job ${job.id} failed:`, error.message)
})

imageProcessingQueue.on('stalled', (job) => {
  logger.warn(`Job ${job.id} stalled`)
})

imageProcessingQueue.on('progress', (job, progress) => {
  logger.info(`Job ${job.id} progress: ${progress}%`)
})

// Health check endpoint
const express = require('express')
const healthApp = express()
const healthPort = process.env.HEALTH_PORT || 3002

healthApp.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    queue: {
      waiting: imageProcessingQueue.getWaiting().length,
      active: imageProcessingQueue.getActive().length,
      completed: imageProcessingQueue.getCompleted().length,
      failed: imageProcessingQueue.getFailed().length
    }
  })
})

healthApp.listen(healthPort, () => {
  logger.info(`Health check server running on port ${healthPort}`)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully')
  await imageProcessingQueue.close()
  await redis.quit()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully')
  await imageProcessingQueue.close()
  await redis.quit()
  process.exit(0)
})

logger.info('Image processing worker started')
logger.info(`Worker concurrency: ${process.env.WORKER_CONCURRENCY || 5}`)
logger.info(`MinIO endpoint: ${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || 9000}`)
