const express = require('express')
const multer = require('multer')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { body, validationResult } = require('express-validator')
const winston = require('winston')
const path = require('path')
const fs = require('fs-extra')
const fsp = require('fs').promises
const { v4: uuidv4 } = require('uuid')
const sharp = require('sharp')
const Minio = require('minio')
const Queue = require('bull')
const Redis = require('redis')
const Database = require('./database')
const ConnectionManager = require('./connectionManager')

// Load environment variables
require('dotenv').config()

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
})

// Initialize Database
const database = new Database()

// Initialize Connection Manager
const connectionManager = new ConnectionManager()

// Initialize Redis and Queue (use no-op queue in test to avoid open handles)
let redis, minioClient

let imageProcessingQueue


// Initialize Express app
const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))

// Rate limiting
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many upload requests from this IP, please try again later.'
})

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
})

app.use('/api/images', uploadLimiter)
app.use('/api', apiLimiter)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Ensure upload directories exist
const uploadDir = '/app/uploads'
const tempDir = path.join(uploadDir, 'temp')
fs.ensureDirSync(uploadDir)
fs.ensureDirSync(tempDir)
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'images'



// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`
    cb(null, uniqueName)
  }
})

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    // Soft-decline invalid files to avoid request stream aborts
    req.fileValidationError = `Invalid file type: ${file.mimetype}`
    cb(null, false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files: parseInt(process.env.MAX_FILES_PER_REQUEST) || 10
  }
})

// Validation middleware
const validateBulkOperation = [
  body('imageIds').isArray().withMessage('imageIds must be an array'),
  body('imageIds.*').isUUID().withMessage('Each imageId must be a valid UUID'),
  body('operation').isIn(['update', 'delete', 'move']).withMessage('Invalid operation'),
  body('data').optional().isObject().withMessage('data must be an object')
]

// Magic number validation (basic header checks)
const validateMagicNumber = async (filePath) => {
  const fh = await fsp.open(filePath, 'r')
  try {
    const header = Buffer.alloc(12)
    await fh.read(header, 0, 12, 0)
    // JPEG FF D8 FF
    if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) return true
    // PNG 89 50 4E 47 0D 0A 1A 0A
    if (header.slice(0,8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]))) return true
    // WEBP 'RIFF' .... 'WEBP'
    if (header.slice(0,4).toString('ascii') === 'RIFF' && header.slice(8,12).toString('ascii') === 'WEBP') return true
    // AVIF 'ftyp' ... 'avif' brand within first 12 bytes typically after size
    if (header.slice(4,8).toString('ascii') === 'ftyp' && header.slice(8,12).toString('ascii').includes('av')) return true
    throw new Error('Invalid file header (magic number)')
  } finally {
    await fh.close()
  }
}

// File validation helper (metadata & dimensions)
const validateFile = async (filePath) => {
  try {
    // Quick header verification before expensive image parsing
    await validateMagicNumber(filePath)
    const metadata = await sharp(filePath).metadata()
    
    // Check if it's actually an image
    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image file')
    }
    
    // Check dimensions
    if (metadata.width > 10000 || metadata.height > 10000) {
      throw new Error('Image dimensions too large')
    }
    
    return metadata
  } catch (error) {
    throw new Error(`File validation failed: ${error.message}`)
  }
}

// Database will be initialized on startup

// Routes

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {}
    }
    
    // Check Redis connection
    try {
      if (redis) {
        await redis.ping()
        health.services.redis = { status: 'healthy' }
      } else {
        health.services.redis = { status: 'unhealthy', error: 'Redis not initialized' }
        health.status = 'degraded'
      }
    } catch (error) {
      health.services.redis = { status: 'unhealthy', error: error.message }
      health.status = 'degraded'
    }
    
    // Check MinIO connection
    try {
      if (minioClient) {
        await minioClient.bucketExists(MINIO_BUCKET)
        health.services.minio = { status: 'healthy' }
      } else {
        health.services.minio = { status: 'unhealthy', error: 'MinIO not initialized' }
        health.status = 'degraded'
      }
    } catch (error) {
      health.services.minio = { status: 'unhealthy', error: error.message }
      health.status = 'degraded'
    }
    
    // Check queue status
    if (process.env.NODE_ENV !== 'test' && imageProcessingQueue) {
      try {
        const waiting = await imageProcessingQueue.getWaiting()
        const active = await imageProcessingQueue.getActive()
        const completed = await imageProcessingQueue.getCompleted()
        const failed = await imageProcessingQueue.getFailed()
        
        health.services.queue = {
          status: 'healthy',
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length
        }
      } catch (error) {
        health.services.queue = { status: 'unhealthy', error: error.message }
        health.status = 'degraded'
      }
    } else if (process.env.NODE_ENV !== 'test') {
      health.services.queue = {
        status: 'disabled',
        message: 'Queue not available (Redis connection failed)'
      }
    }
    
    // Check database
    try {
      await database.getImages({ limit: 1 })
      health.services.database = { status: 'healthy' }
    } catch (error) {
      health.services.database = { status: 'unhealthy', error: error.message }
      health.status = 'unhealthy'
    }
    
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503
    res.status(statusCode).json(health)
    
  } catch (error) {
    logger.error('Health check failed:', error)
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    })
  }
})

// Get all images
app.get('/api/images', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, album, tags, sortBy = 'uploaded_at', sortOrder = 'desc' } = req.query
    
    const filters = {
      search,
      album,
      status: req.query.status
    }
    
    const offset = (page - 1) * limit
    const imageList = await database.getImages({
      ...filters,
      limit: parseInt(limit),
      offset,
      sortBy,
      sortOrder
    })
    
    res.json(imageList)
  } catch (error) {
    logger.error('Error fetching images:', error)
    res.status(500).json({ error: 'Failed to fetch images' })
  }
})

// Get single image
app.get('/api/images/:id', async (req, res) => {
  try {
    const { id } = req.params
    const image = await database.getImage(id)
    
    if (!image) {
      return res.status(404).json({ error: 'Image not found' })
    }
    
    res.json(image)
  } catch (error) {
    logger.error('Error fetching image:', error)
    res.status(500).json({ error: 'Failed to fetch image' })
  }
})

// Upload images
app.post('/api/images', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' })
    }
    
    const results = []
    
    for (const file of req.files) {
      try {
        // Validate file
        const metadata = await validateFile(file.path)
        
        // Generate unique ID
        const imageId = uuidv4()
        
        // Create image record
        const imageData = {
          id: imageId,
          filename: file.originalname,
          originalName: file.originalname,
          url: `/api/images/${imageId}/url`,
          thumbnailUrl: `/api/images/${imageId}/url?variant=thumbnail`,
          size: file.size,
          width: metadata.width,
          height: metadata.height,
          uploadedAt: new Date().toISOString(),
          status: 'processing',
          tempPath: file.path,
          metadata: {
            format: metadata.format,
            channels: metadata.channels,
            density: metadata.density
          }
        }
        
        // Store image data in database
        await database.insertImage(imageData)
        await database.updateImageStatus(imageId, 'processing', 0)

        // If using Postgres, store the blob directly and mark completed
        if (database.client === 'postgres') {
          const buffer = await fsp.readFile(file.path)
          const contentType = file.mimetype || 'application/octet-stream'
          await database.insertImageBlob(imageId, buffer, contentType)
          await database.updateImageStatus(imageId, 'completed', 100)
          // Remove temp file
          try { await fs.remove(file.path) } catch {}
        } else if (imageProcessingQueue) {
          // Read the file and pass image data directly to worker
          const imageBuffer = await fsp.readFile(file.path)
          
          // Queue for processing if non-Postgres flow is enabled
          await imageProcessingQueue.add('processImage', {
            imageId,
            imageData: imageBuffer.toString('base64'),
            originalName: file.originalname,
            mimeType: file.mimetype
          }, {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000
            }
          })
          
          // Clean up temp file immediately
          try {
            await fs.remove(file.path)
          } catch (cleanupError) {
            logger.error('Error cleaning up temp file:', cleanupError)
          }
        }
        
        results.push({
          success: true,
          imageId,
          filename: file.originalname
        })
        
        logger.info(`Image queued for processing: ${imageId}`)
        
      } catch (error) {
        logger.error(`Error processing file ${file.originalname}:`, error)
        
        // Clean up temp file
        try {
          await fs.remove(file.path)
        } catch (cleanupError) {
          logger.error('Error cleaning up temp file:', cleanupError)
        }
        
        results.push({
          success: false,
          error: error.message,
          filename: file.originalname
        })
      }
    }
    
    res.json(results)
    
  } catch (error) {
    logger.error('Upload error:', error)
    res.status(500).json({ error: 'Upload failed' })
  }
})

// Get image status
app.get('/api/images/:id/status', async (req, res) => {
  try {
    const { id } = req.params
    const status = await database.getImageStatus(id)
    
    if (!status) {
      return res.status(404).json({ error: 'Image not found' })
    }
    
    res.json(status)
  } catch (error) {
    logger.error('Error fetching image status:', error)
    res.status(500).json({ error: 'Failed to fetch image status' })
  }
})

// Get queue status
app.get('/api/queue/status', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'test') {
      return res.json({ error: 'Queue not available in test mode' })
    }
    
    if (!imageProcessingQueue) {
      return res.json({ 
        error: 'Queue not available',
        message: 'Redis connection failed, queue processing disabled'
      })
    }
    
    const waiting = await imageProcessingQueue.getWaiting()
    const active = await imageProcessingQueue.getActive()
    const completed = await imageProcessingQueue.getCompleted()
    const failed = await imageProcessingQueue.getFailed()
    
    res.json({
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    })
  } catch (error) {
    logger.error('Error fetching queue status:', error)
    res.status(500).json({ error: 'Failed to fetch queue status' })
  }
})

// Get signed URL from MinIO
app.get('/api/images/:id/url', async (req, res) => {
  try {
    const { id } = req.params
    const { variant = 'original' } = req.query
    const image = await database.getImage(id)
    
    if (!image) {
      return res.status(404).json({ error: 'Image not found' })
    }
    
    if (image.status !== 'completed') {
      return res.status(202).json({ 
        error: 'Image still processing',
        status: image.status 
      })
    }
    
    let objectKey
    if (variant === 'thumbnail') {
      objectKey = image.thumbnail_path
    } else if (variant === 'original') {
      objectKey = image.minio_path
    } else if (image.responsive_paths && image.responsive_paths[variant]) {
      // For responsive variants, default to JPEG
      objectKey = image.responsive_paths[variant].jpeg
    } else {
      return res.status(400).json({ error: 'Invalid variant' })
    }
    
    if (!objectKey) {
      return res.status(404).json({ error: 'Variant not available' })
    }
    
    // Verify object exists in MinIO before generating signed URL
    try {
      await minioClient.statObject(MINIO_BUCKET, objectKey)
    } catch (minioError) {
      logger.error(`Object not found in MinIO: ${objectKey}`, minioError)
      return res.status(404).json({ error: 'File not found in storage' })
    }
    
    // Generate signed URL from MinIO
    const signedUrl = await minioClient.presignedGetObject(
      MINIO_BUCKET,
      objectKey,
      parseInt(process.env.SIGNED_URL_EXPIRY) || 3600
    )
    
    res.json({ url: signedUrl })
  } catch (error) {
    logger.error('Error generating signed URL:', error)
    if (error.code === 'NoSuchKey') {
      return res.status(404).json({ error: 'File not found in storage' })
    }
    res.status(500).json({ error: 'Failed to generate URL' })
  }
})

// Download image (Postgres blob or MinIO depending on configuration)
app.get('/api/images/:id/download', async (req, res) => {
  try {
    const { id } = req.params
    const { variant = 'original' } = req.query
    const image = await database.getImage(id)

    if (!image) {
      return res.status(404).json({ error: 'Image not found' })
    }
    
    // If Postgres mode, stream from blobs table
    if (database.client === 'postgres') {
      const blob = await database.getImageBlob(id)
      if (!blob) {
        return res.status(404).json({ error: 'File not found in storage' })
      }
      const contentType = blob.content_type || 'image/jpeg'
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'public, max-age=31536000')
      const buffer = blob.data
      if (variant === 'thumbnail') {
        const pipeline = sharp(buffer).resize(200, 200, { fit: 'cover', position: 'center' }).jpeg({ quality: 85 })
        return pipeline.pipe(res)
      }
      return res.end(buffer)
    }

    // Default MinIO flow
    let objectKey
    if (variant === 'thumbnail') {
      objectKey = image.thumbnail_path
    } else if (variant === 'original') {
      objectKey = image.minio_path
    } else if (image.responsive_paths && image.responsive_paths[variant]) {
      objectKey = image.responsive_paths[variant].jpeg
    } else {
      return res.status(400).json({ error: 'Invalid variant' })
    }

    if (!objectKey) {
      return res.status(404).json({ error: 'Variant not available' })
    }

    try {
      const stat = await minioClient.statObject(MINIO_BUCKET, objectKey)
      res.setHeader('Content-Type', stat.metaData?.['content-type'] || 'image/jpeg')
      res.setHeader('Content-Length', stat.size)
      res.setHeader('Cache-Control', 'public, max-age=31536000')
      minioClient.getObject(MINIO_BUCKET, objectKey, (err, objStream) => {
        if (err) {
          logger.error('Error streaming from MinIO:', err)
          if (err.code === 'NoSuchKey') {
            return res.status(404).json({ error: 'File not found in storage' })
          }
          return res.status(500).json({ error: 'Download failed' })
        }
        objStream.pipe(res)
      })
    } catch (minioError) {
      logger.error('MinIO error:', minioError)
      if (image.status === 'processing' && image.temp_path && await fs.pathExists(image.temp_path)) {
        logger.info(`Falling back to temp file for processing image: ${id}`)
        if (variant === 'thumbnail') {
          const stream = fs.createReadStream(image.temp_path)
          res.type('image/jpeg')
          stream.pipe(sharp().resize(200, 200, { fit: 'cover', position: 'center' }).jpeg({ quality: 85 })).pipe(res)
          return
        }
        res.type('image')
        fs.createReadStream(image.temp_path).pipe(res)
        return
      }
      if (minioError.code === 'NoSuchKey') {
        return res.status(404).json({ error: 'File not found in storage' })
      }
      res.status(500).json({ error: 'File not available' })
    }
  } catch (error) {
    logger.error('Error downloading image:', error)
    res.status(500).json({ error: 'Download failed' })
  }
})

// Bulk operations
app.post('/api/images/bulk', validateBulkOperation, async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    
    const { imageIds, operation, data } = req.body
    
    // Validate all image IDs exist
    const invalidIds = []
    for (const id of imageIds) {
      const image = await database.getImage(id)
      if (!image) {
        invalidIds.push(id)
      }
    }
    
    if (invalidIds.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid image IDs', 
        invalidIds 
      })
    }
    
    // Process bulk operation
    switch (operation) {
      case 'update':
        for (const id of imageIds) {
          const image = await database.getImage(id)
          if (image) {
            const updatedMetadata = { ...image.metadata, ...data }
            await database.updateImageMetadata(id, updatedMetadata)
          }
        }
        break
        
      case 'delete':
        for (const id of imageIds) {
          await database.deleteImage(id)
        }
        break
        
      case 'move':
        if (!data.album) {
          return res.status(400).json({ error: 'Album is required for move operation' })
        }
        for (const id of imageIds) {
          const image = await database.getImage(id)
          if (image) {
            const updatedMetadata = { ...image.metadata, album: data.album }
            await database.updateImageMetadata(id, updatedMetadata)
          }
        }
        break
        
      default:
        return res.status(400).json({ error: 'Invalid operation' })
    }
    
    res.json({ 
      success: true, 
      processed: imageIds.length,
      operation 
    })
    
  } catch (error) {
    logger.error('Bulk operation error:', error)
    res.status(500).json({ error: 'Bulk operation failed' })
  }
})

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error)
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' })
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files' })
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Unexpected file field' })
    }
  }
  
  res.status(500).json({ error: 'Internal server error' })
})

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    await database.initialize()
    logger.info('Database initialized successfully')
    
    // Initialize Redis connection
    try {
      redis = await connectionManager.initializeRedis({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      })
      if (redis) {
        logger.info('Redis connection initialized successfully')
      } else {
        logger.warn('Redis not available, queue processing disabled')
      }
    } catch (error) {
      logger.warn('Redis initialization failed:', error.message)
      logger.warn('Redis operations will be disabled. Queue processing will not be available.')
      redis = null
    }
    
    // Initialize MinIO connection
    try {
      minioClient = await connectionManager.initializeMinIO({
        endPoint: process.env.MINIO_ENDPOINT || 'localhost',
        port: process.env.MINIO_PORT || '9000',
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
        bucket: MINIO_BUCKET
      })
      if (minioClient) {
        logger.info('MinIO connection initialized successfully')
      } else {
        logger.warn('MinIO not available, object storage disabled')
      }
    } catch (error) {
      logger.warn('MinIO initialization failed:', error.message)
      logger.warn('MinIO operations will be disabled for local development.')
      minioClient = null
    }
    
    // Initialize queue after Redis is ready
    if (process.env.NODE_ENV !== 'test' && redis && connectionManager.connections.redis.status === 'ready') {
      try {
        // Parse Redis URL to get host and port for Bull Queue
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
        const url = new URL(redisUrl)
        const redisHost = url.hostname
        const redisPort = parseInt(url.port) || 6379
        
        imageProcessingQueue = new Queue('image processing', {
          redis: {
            host: redisHost,
            port: redisPort
          },
          settings: {
            stalledInterval: 30 * 1000,
            maxStalledCount: 1
          }
        })
        
        // Add queue error handling
        imageProcessingQueue.on('error', (error) => {
          logger.error('Queue error:', error)
        })

        imageProcessingQueue.on('waiting', (jobId) => {
          logger.info(`Job ${jobId} is waiting`)
        })

        imageProcessingQueue.on('active', (job) => {
          logger.info(`Job ${job.id} is now active`)
        })

        imageProcessingQueue.on('stalled', (job) => {
          logger.warn(`Job ${job.id} stalled`)
        })

        imageProcessingQueue.on('progress', (job, progress) => {
          logger.info(`Job ${job.id} progress: ${progress}%`)
        })
        
        // Queue event handlers for processing completion
        imageProcessingQueue.on('completed', async (job, result) => {
          try {
            logger.info(`Job ${job.id} completed successfully for image: ${result.imageId}`)
            
            // Update database with processing results
            await database.updateImageAfterProcessing(result.imageId, result)
            await database.updateImageStatus(result.imageId, 'completed', 100)
            
            logger.info(`Database updated for image: ${result.imageId}`)
          } catch (error) {
            logger.error('Error updating database after job completion:', error)
          }
        })

        imageProcessingQueue.on('failed', async (job, error) => {
          try {
            logger.error(`Job ${job.id} failed:`, error.message)
            
            // Update database with failure status
            await database.updateImageStatus(job.data.imageId, 'failed', 0, error.message)
            
            logger.info(`Database updated with failure for image: ${job.data.imageId}`)
          } catch (dbError) {
            logger.error('Error updating database after job failure:', dbError)
          }
        })

        imageProcessingQueue.on('progress', async (job, progress) => {
          try {
            await database.updateImageStatus(job.data.imageId, 'processing', progress)
          } catch (error) {
            logger.error('Error updating progress in database:', error)
          }
        })
        
        logger.info('Image processing queue initialized successfully')
      } catch (error) {
        logger.warn('Queue initialization failed:', error.message)
        logger.warn('Queue processing will not be available.')
        imageProcessingQueue = null
      }
    } else {
      if (process.env.NODE_ENV === 'test') {
        logger.info('Queue initialization skipped (test mode)')
      } else if (!redis) {
        logger.info('Queue initialization skipped (Redis not available)')
      } else {
        logger.info('Queue initialization skipped (Redis not ready)')
      }
    }
    
    // Start server (skip binding during tests)
    if (process.env.NODE_ENV !== 'test') {
      app.listen(PORT, () => {
        logger.info(`Backend uploader server running on port ${PORT}`)
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
        logger.info('Server is ready to accept requests')
      })
    }
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully')
  try {
    await database.close()
    await connectionManager.close()
    if (imageProcessingQueue && imageProcessingQueue.close) {
      await imageProcessingQueue.close()
    }
  } catch (error) {
    logger.error('Error during shutdown:', error)
  }
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully')
  try {
    await database.close()
    await connectionManager.close()
    if (imageProcessingQueue && imageProcessingQueue.close) {
      await imageProcessingQueue.close()
    }
  } catch (error) {
    logger.error('Error during shutdown:', error)
  }
  process.exit(0)
})

module.exports = app
