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
  url: process.env.REDIS_URL || 'redis://localhost:6379'
})

const imageProcessingQueue = new Queue('image processing', {
  redis: process.env.REDIS_URL
    ? { url: process.env.REDIS_URL }
    : { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 }
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

// Ensure bucket exists
const ensureBucket = async () => {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME)
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME, 'us-east-1')
      logger.info(`Created bucket: ${BUCKET_NAME}`)
    }
  } catch (error) {
    logger.error('Error ensuring bucket exists:', error)
    throw error
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
  const { imageId, tempPath, originalName } = job.data
  
  logger.info(`Starting image processing for: ${imageId}`)
  
  try {
    // Update job progress
    await job.progress(10)
    
    // Read and validate the image
    const imageBuffer = await fs.readFile(tempPath)
    const metadata = await sharp(imageBuffer).metadata()
    
    logger.info(`Image metadata: ${JSON.stringify(metadata)}`)
    
    // Extract EXIF data
    const exifData = await exifr.parse(tempPath)
    logger.info(`EXIF data extracted: ${exifData ? 'Yes' : 'No'}`)
    
    // Update progress
    await job.progress(20)
    
    // Create storage paths
    const basePath = `images/${imageId}`
    const rawPath = `${basePath}/raw/${originalName}`
    const thumbnailPath = `${basePath}/thumbnails/thumbnail.jpg`
    const responsivePaths = {}
    
    // Upload raw file
    await minioClient.putObject(BUCKET_NAME, rawPath, imageBuffer, {
      'Content-Type': metadata.format === 'jpeg' ? 'image/jpeg' : `image/${metadata.format}`
    })
    
    logger.info(`Raw file uploaded: ${rawPath}`)
    await job.progress(30)
    
    // Generate thumbnail
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(PROCESSING_CONFIG.thumbnailSize, PROCESSING_CONFIG.thumbnailSize, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: PROCESSING_CONFIG.quality.jpeg })
      .toBuffer()
    
    await minioClient.putObject(BUCKET_NAME, thumbnailPath, thumbnailBuffer, {
      'Content-Type': 'image/jpeg'
    })
    
    logger.info(`Thumbnail generated: ${thumbnailPath}`)
    await job.progress(50)
    
    // Generate responsive sizes
    let progressStep = 50
    const progressIncrement = 40 / PROCESSING_CONFIG.responsiveSizes.length
    
    for (const size of PROCESSING_CONFIG.responsiveSizes) {
      const responsivePath = `${basePath}/responsive/${size}w`
      
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
      
      progressStep += progressIncrement
      await job.progress(Math.round(progressStep))
      
      logger.info(`Responsive size ${size}w generated`)
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
    
    // Clean up temp file
    await fs.remove(tempPath)
    
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
    
    // Clean up temp file on error
    try {
      await fs.remove(tempPath)
    } catch (cleanupError) {
      logger.error('Error cleaning up temp file:', cleanupError)
    }
    
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
