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
const cloudinary = require('cloudinary').v2
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
const PORT = process.env.PORT || 10000

// Configure Cloudinary (optional; only used if creds provided)
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  })
}

// Middleware
app.use(helmet({
  // Allow other origins (e.g., frontend on a different port) to load image responses
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // Avoid COEP/COOP issues for simple asset/API usage
  crossOriginEmbedderPolicy: false
}))
app.use(cors({
  // Reflect request origin in dev to allow Vite/Next ports
  origin: (origin, callback) => callback(null, true),
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
const uploadDir = path.join(__dirname, '..', 'uploads')
const tempDir = path.join(uploadDir, 'temp')
fs.ensureDirSync(uploadDir)
fs.ensureDirSync(tempDir)
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'images'



// Normalize a temp file path that might be an absolute Windows path from host
const resolveTempPath = async (rawPath) => {
  if (!rawPath) return null
  try {
    // If path exists as-is inside container, use it
    if (await fs.pathExists(rawPath)) return rawPath
  } catch {}
  try {
    // Translate known host prefix to container path
    // Example host path: D:\\RVCE\\prompt-frame-gallery\\backendUploader\\uploads\\temp\\...
    const normalized = rawPath
      .replace(/\\/g, '/')
      .replace(/.*backendUploader\/(uploads\/temp\/.*)$/i, '/app/$1')
    if (normalized && normalized.startsWith('/app/uploads')) {
      if (await fs.pathExists(normalized)) return normalized
    }
  } catch {}
  return null
}

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

// Simple auth endpoints
// WARNING: This is a minimal demo auth with plaintext password storage for local/demo use only.
// Do NOT use in production without hashing (bcrypt), sessions/JWTs, and proper validation.

// Seed admin account from env or defaults (username & password = 'nexel')
app.post('/api/auth/seed-admin', async (req, res) => {
  try {
    const username = process.env.ADMIN_USERNAME || 'nexel'
    const password = process.env.ADMIN_PASSWORD || 'nexel'
    const existing = await database.getUserByUsername(username)
    if (!existing) {
      await database.createUser({ id: uuidv4(), username, password, role: 'admin' })
    }
    res.json({ success: true })
  } catch (err) {
    logger.error('Seed admin failed:', err)
    res.status(500).json({ error: 'Failed to seed admin' })
  }
})

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'username and password required' })
    const existing = await database.getUserByUsername(username)
    if (existing) return res.status(409).json({ error: 'username already exists' })
    await database.createUser({ id: uuidv4(), username, password, role: 'creator' })
    res.json({ success: true })
  } catch (err) {
    logger.error('Register failed:', err)
    res.status(500).json({ error: 'registration failed' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'username and password required' })
    const user = await database.getUserByUsername(username)
    if (!user || user.password !== password) return res.status(401).json({ error: 'invalid credentials' })
    res.json({ success: true, role: user.role })
  } catch (err) {
    logger.error('Login failed:', err)
    res.status(500).json({ error: 'login failed' })
  }
})

app.get('/api/admin/users', async (req, res) => {
  try {
    const { username, password } = req.query
    // Basic guard: require admin creds for this endpoint via query for demo simplicity
    const adminUser = await database.getUserByUsername(username)
    if (!adminUser || adminUser.password !== password || adminUser.role !== 'admin') {
      return res.status(401).json({ error: 'unauthorized' })
    }
    const users = await database.listUsers()
    res.json(users)
  } catch (err) {
    logger.error('List users failed:', err)
    res.status(500).json({ error: 'failed to list users' })
  }
})

app.delete('/api/admin/users/:username', async (req, res) => {
  try {
    const { adminUser, adminPass } = req.query
    const admin = await database.getUserByUsername(adminUser)
    if (!admin || admin.password !== adminPass || admin.role !== 'admin') {
      return res.status(401).json({ error: 'unauthorized' })
    }
    const count = await database.deleteUserByUsername(req.params.username)
    res.json({ success: true, deleted: count })
  } catch (err) {
    logger.error('Delete user failed:', err)
    res.status(500).json({ error: 'failed to delete user' })
  }
})

// Get all images
app.get('/api/images', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, album, tags, sortBy = 'uploaded_at', sortOrder = 'desc', owner } = req.query
    
    const filters = {
      search,
      album,
      status: req.query.status,
      owner
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
            density: metadata.density,
            owner: (req.headers['x-user'] || '').toString() || null
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
        } else {
          // Fallback: For SQLite without queue, process directly
          logger.info(`Processing image directly (no queue available): ${imageId}`)
          
          try {
            // Create thumbnails directory
            const thumbnailsDir = path.join(uploadDir, 'thumbnails')
            const originalsDir = path.join(uploadDir, 'originals')
            await fs.ensureDir(thumbnailsDir)
            await fs.ensureDir(originalsDir)
            
            // Create thumbnail
            const thumbnailPath = path.join(thumbnailsDir, `${imageId}.jpg`)
            await sharp(file.path)
              .resize(200, 200, { fit: 'cover', position: 'center' })
              .jpeg({ quality: 85 })
              .toFile(thumbnailPath)
            
            // Copy original to originals folder
            const originalPath = path.join(originalsDir, `${imageId}.${metadata.format}`)
            await fs.copy(file.path, originalPath)
            
            // Update the image record with proper paths
            await database.updateImageAfterProcessing(imageId, {
              imageId,
              originalName: file.originalname,
              mimeType: file.mimetype,
              width: metadata.width,
              height: metadata.height,
              format: metadata.format,
              minio_path: `originals/${imageId}.${metadata.format}`,
              thumbnail_path: `thumbnails/${imageId}.jpg`
            })
            await database.updateImageStatus(imageId, 'completed', 100)
            
            // Clean up temp file
            try {
              await fs.remove(file.path)
            } catch (cleanupError) {
              logger.error('Error cleaning up temp file:', cleanupError)
            }
          } catch (error) {
            logger.error(`Error processing image ${imageId}:`, error)
            await database.updateImageStatus(imageId, 'failed', 0, error.message)
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

// Cloudinary single-file upload endpoint (bypasses queue/minio)
app.post('/api/upload-cloudinary', upload.single('file'), async (req, res) => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(400).json({ error: 'Cloudinary not configured' })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }
    const result = await cloudinary.uploader.upload(req.file.path)
    try { await fs.remove(req.file.path) } catch {}
    res.json({ url: result.secure_url, public_id: result.public_id })
  } catch (error) {
    logger.error('Cloudinary upload failed:', error)
    res.status(500).json({ error: 'Cloudinary upload failed' })
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
      // As a last resort, serve a placeholder thumbnail while processing
      if (variant === 'thumbnail') {
        try {
          res.setHeader('Cache-Control', 'no-cache')
          res.type('image/png')
          return sharp({
            create: {
              width: 200,
              height: 200,
              channels: 3,
              background: '#e5e7eb'
            }
          })
          .png()
          .toBuffer()
          .then(buf => res.end(buf))
        } catch (phErr) {
          logger.warn('Placeholder generation failed:', phErr)
        }
      }
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

    // If the variant file is not yet available but the image is still processing,
    // stream from the temp file as a fallback (and generate a thumbnail on the fly).
    if (!objectKey) {
      if (image.status === 'processing' && image.temp_path && await fs.pathExists(image.temp_path)) {
        try {
          if (variant === 'thumbnail') {
            const stream = fs.createReadStream(image.temp_path)
            res.type('image/jpeg')
            stream
              .pipe(sharp().resize(200, 200, { fit: 'cover', position: 'center' }).jpeg({ quality: 85 }))
              .pipe(res)
            return
          } else if (variant === 'original') {
            res.type(`image/${image.format || 'jpeg'}`)
            fs.createReadStream(image.temp_path).pipe(res)
            return
          }
        } catch (fallbackError) {
          logger.error('Error streaming temp file fallback:', fallbackError)
        }
      }
      // Try to resolve Windows host path into container path and stream
      if (image.status === 'processing' && image.temp_path) {
        const resolved = await resolveTempPath(image.temp_path)
        const candidates = []
        if (resolved) candidates.push(resolved)
        try {
          const base = path.basename(image.temp_path)
          candidates.push(path.join('/app/uploads/temp', base))
          candidates.push(path.join('/app/src/uploads/temp', base))
        } catch {}
        let existingPath = null
        for (const p of candidates) {
          try {
            if (p && await fs.pathExists(p)) { existingPath = p; break }
          } catch {}
        }
        // If not found, try to find a file that ends with the original filename
        if (!existingPath && image.original_name) {
          const searchDirs = ['/app/uploads/temp', '/app/src/uploads/temp']
          const suffix = image.original_name
          for (const dir of searchDirs) {
            try {
              const entries = await fs.readdir(dir)
              const match = entries.find(name => name.endsWith(suffix))
              if (match) { existingPath = path.join(dir, match); break }
            } catch {}
          }
        }
        if (existingPath) {
          if (variant === 'thumbnail') {
            res.type('image/jpeg')
            return fs.createReadStream(existingPath).pipe(
              sharp().resize(200, 200, { fit: 'cover', position: 'center' }).jpeg({ quality: 85 })
            ).pipe(res)
          }
          res.type(`image/${image.format || 'jpeg'}`)
          return fs.createReadStream(existingPath).pipe(res)
        }
      }

      // Heuristic fallback: try conventional MinIO paths even if DB not updated yet
      try {
        if (minioClient) {
          if (variant === 'thumbnail') {
            const inferredThumb = `images/${id}/thumbnails/thumbnail.jpg`
            try {
              await minioClient.statObject(MINIO_BUCKET, inferredThumb)
              res.setHeader('Cache-Control', 'public, max-age=600')
              return minioClient.getObject(MINIO_BUCKET, inferredThumb, (err, stream) => {
                if (err) return res.status(404).json({ error: 'Variant not available' })
                res.type('image/jpeg')
                stream.pipe(res)
              })
            } catch {}
          } else if (variant === 'original') {
            // Find any raw object under images/<id>/raw/
            const prefix = `images/${id}/raw/`
            const objects = []
            const stream = minioClient.listObjectsV2(MINIO_BUCKET, prefix, true)
            await new Promise((resolve) => {
              stream.on('data', obj => { if (obj && obj.name) objects.push(obj.name) })
              stream.on('end', resolve)
              stream.on('error', resolve)
            })
            if (objects.length > 0) {
              const key = objects[0]
              res.setHeader('Cache-Control', 'public, max-age=600')
              return minioClient.getObject(MINIO_BUCKET, key, (err, stream) => {
                if (err) return res.status(404).json({ error: 'Variant not available' })
                res.type('image')
                stream.pipe(res)
              })
            }
          }
        }
      } catch (fallbackErr) {
        logger.warn('Heuristic storage fallback failed:', fallbackErr)
      }

      return res.status(404).json({ error: 'Variant not available' })
    }

    try {
      if (minioClient) {
        // Try streaming directly from MinIO. If it fails, fall back to local filesystem when possible.
        minioClient.getObject(MINIO_BUCKET, objectKey, async (err, objStream) => {
          if (err) {
            logger.error('Error streaming from MinIO:', err)
            // Fallback to local file if available
            try {
              const filePath = path.join(uploadDir, objectKey)
              if (await fs.pathExists(filePath)) {
                res.setHeader('Cache-Control', 'public, max-age=31536000')
                if (variant === 'thumbnail') {
                  res.type('image/jpeg')
                } else {
                  res.type(`image/${image.format || 'jpeg'}`)
                }
                return fs.createReadStream(filePath).pipe(res)
              }
            } catch {}
            if (err.code === 'NoSuchKey') {
              return res.status(404).json({ error: 'File not found in storage' })
            }
            return res.status(500).json({ error: 'Download failed' })
          }
          // Successful MinIO stream
          res.setHeader('Cache-Control', 'public, max-age=31536000')
          objStream.pipe(res)
        })
      } else {
        // Fallback to local file system
        const filePath = path.join(uploadDir, objectKey)
        if (await fs.pathExists(filePath)) {
          const stat = await fs.stat(filePath)
          res.setHeader('Content-Type', variant === 'thumbnail' ? 'image/jpeg' : `image/${image.format}`)
          res.setHeader('Content-Length', stat.size)
          res.setHeader('Cache-Control', 'public, max-age=31536000')
          fs.createReadStream(filePath).pipe(res)
        } else {
          return res.status(404).json({ error: 'File not found in storage' })
        }
      }
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
