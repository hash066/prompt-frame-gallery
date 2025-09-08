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

// Initialize Redis and Queue (use no-op queue in test to avoid open handles)
const redis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
})

const imageProcessingQueue = process.env.NODE_ENV === 'test'
  ? { add: async () => Promise.resolve() }
  : new Queue('image processing', {
      redis: process.env.REDIS_URL
        ? { url: process.env.REDIS_URL }
        : {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379
          }
    })

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
const uploadDir = path.join(__dirname, 'uploads')
const tempDir = path.join(uploadDir, 'temp')
fs.ensureDirSync(uploadDir)
fs.ensureDirSync(tempDir)
// MinIO client (used to serve processed files once available)
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
})
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

// In-memory storage for demo (replace with database in production)
const images = new Map()
const imageStatus = new Map()

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

// Get all images
app.get('/api/images', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, album, tags, sortBy = 'uploadedAt', sortOrder = 'desc' } = req.query
    
    let imageList = Array.from(images.values())
    
    // Apply filters
    if (search) {
      imageList = imageList.filter(img => 
        img.filename.toLowerCase().includes(search.toLowerCase()) ||
        (img.metadata?.title && img.metadata.title.toLowerCase().includes(search.toLowerCase()))
      )
    }
    
    if (album) {
      imageList = imageList.filter(img => img.metadata?.album === album)
    }
    
    if (tags && tags.length > 0) {
      imageList = imageList.filter(img => 
        img.metadata?.tags && tags.some(tag => img.metadata.tags.includes(tag))
      )
    }
    
    // Apply sorting
    imageList.sort((a, b) => {
      let aVal = a[sortBy]
      let bVal = b[sortBy]
      
      if (sortBy === 'uploadedAt') {
        aVal = new Date(aVal).getTime()
        bVal = new Date(bVal).getTime()
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })
    
    // Apply pagination
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + parseInt(limit)
    const paginatedImages = imageList.slice(startIndex, endIndex)
    
    res.json(paginatedImages)
  } catch (error) {
    logger.error('Error fetching images:', error)
    res.status(500).json({ error: 'Failed to fetch images' })
  }
})

// Get single image
app.get('/api/images/:id', (req, res) => {
  try {
    const { id } = req.params
    const image = images.get(id)
    
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
        
        // Store image data
        images.set(imageId, imageData)
        imageStatus.set(imageId, { status: 'processing', progress: 0 })
        
        // Queue for processing
        await imageProcessingQueue.add('processImage', {
          imageId,
          tempPath: file.path,
          originalName: file.originalname
        }, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        })
        
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
app.get('/api/images/:id/status', (req, res) => {
  try {
    const { id } = req.params
    const status = imageStatus.get(id)
    
    if (!status) {
      return res.status(404).json({ error: 'Image not found' })
    }
    
    res.json(status)
  } catch (error) {
    logger.error('Error fetching image status:', error)
    res.status(500).json({ error: 'Failed to fetch image status' })
  }
})

// Get signed URL (placeholder - implement with MinIO)
app.get('/api/images/:id/url', (req, res) => {
  try {
    const { id } = req.params
    const { variant = 'original' } = req.query
    const image = images.get(id)
    
    if (!image) {
      return res.status(404).json({ error: 'Image not found' })
    }
    
    // For demo purposes, return a placeholder URL
    // In production, this would generate a signed URL from MinIO
    const url = `${req.protocol}://${req.get('host')}/api/images/${id}/download?variant=${variant}`
    
    res.json({ url })
  } catch (error) {
    logger.error('Error generating signed URL:', error)
    res.status(500).json({ error: 'Failed to generate URL' })
  }
})

// Download image (placeholder)
app.get('/api/images/:id/download', async (req, res) => {
  try {
    const { id } = req.params
    const { variant = 'original' } = req.query
    const image = images.get(id)

    if (!image) {
      return res.status(404).json({ error: 'Image not found' })
    }

    // Try MinIO first (processed assets)
    const basePath = `images/${id}`
    let key
    if (variant === 'thumbnail') key = `${basePath}/thumbnails/thumbnail.jpg`
    else if (variant && variant !== 'original') key = `${basePath}/responsive/${variant}`
    else key = `${basePath}/raw/${image.filename || image.originalName || image.filename}`

    try {
      const stat = await minioClient.statObject(MINIO_BUCKET, key)
      res.setHeader('Content-Type', stat.metaData?.['content-type'] || 'image/jpeg')
      minioClient.getObject(MINIO_BUCKET, key, (err, objStream) => {
        if (err) throw err
        objStream.pipe(res)
      })
      return
    } catch (e) {
      // Fallback to temp streaming while processing
      const sourcePath = image.tempPath
      if (!sourcePath || !(await fs.pathExists(sourcePath))) {
        return res.status(404).json({ error: 'Source file not available yet' })
      }
      if (variant === 'thumbnail') {
        const stream = fs.createReadStream(sourcePath)
        res.type('image/jpeg')
        stream.pipe(sharp().resize(200, 200, { fit: 'cover', position: 'center' }).jpeg({ quality: 85 })).pipe(res)
        return
      }
      res.type('image')
      fs.createReadStream(sourcePath).pipe(res)
    }
  } catch (error) {
    logger.error('Error downloading image:', error)
    res.status(500).json({ error: 'Download failed' })
  }
})

// Bulk operations
app.post('/api/images/bulk', validateBulkOperation, (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    
    const { imageIds, operation, data } = req.body
    
    // Validate all image IDs exist
    const invalidIds = imageIds.filter(id => !images.has(id))
    if (invalidIds.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid image IDs', 
        invalidIds 
      })
    }
    
    // Process bulk operation
    switch (operation) {
      case 'update':
        imageIds.forEach(id => {
          const image = images.get(id)
          if (image) {
            image.metadata = { ...image.metadata, ...data }
            images.set(id, image)
          }
        })
        break
        
      case 'delete':
        imageIds.forEach(id => {
          images.delete(id)
          imageStatus.delete(id)
        })
        break
        
      case 'move':
        if (!data.album) {
          return res.status(400).json({ error: 'Album is required for move operation' })
        }
        imageIds.forEach(id => {
          const image = images.get(id)
          if (image) {
            image.metadata = { ...image.metadata, album: data.album }
            images.set(id, image)
          }
        })
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

// Start server (skip binding during tests)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`Backend uploader server running on port ${PORT}`)
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
  })
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully')
  process.exit(0)
})

module.exports = app
