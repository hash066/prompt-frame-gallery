const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const fs = require('fs-extra')
const winston = require('winston')
const { Pool } = require('pg')

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
})

class Database {
  constructor() {
    this.db = null
    this.pg = null
    // For Railway deployments, prefer PostgreSQL if available
    this.client = this.determineDatabaseClient()
    this.dbPath = path.join(__dirname, '..', 'data', 'images.db')
  }

  determineDatabaseClient() {
    // Check for Railway PostgreSQL environment variables first
    if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
      return 'postgres'
    }
    // Check for explicit PostgreSQL configuration
    if (process.env.POSTGRES_HOST || process.env.POSTGRES_DB) {
      return 'postgres'
    }
    // Check for explicit client preference
    if (process.env.DB_CLIENT) {
      return process.env.DB_CLIENT.toLowerCase()
    }
    // Default to SQLite for local development
    return 'sqlite'
  }

  async initialize() {
    try {
      if (this.client === 'postgres') {
        // Initialize PostgreSQL connection pool
        let pgConfig = {}
        
        // Handle Railway's DATABASE_URL format
        if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
          const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL
          pgConfig = {
            connectionString: databaseUrl,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
          }
        } else {
          // Fallback to individual environment variables
          pgConfig = {
            host: process.env.POSTGRES_HOST || 'localhost',
            port: parseInt(process.env.POSTGRES_PORT || '5432'),
            user: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD || 'postgres',
            database: process.env.POSTGRES_DB || 'image_gallery',
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
          }
        }

        this.pg = new Pool(pgConfig)

        // Verify connection
        await this.pg.query('SELECT 1')
        logger.info('Connected to PostgreSQL database')
        await this.createTables()
        return
      }

      // Ensure data directory exists for SQLite
      await fs.ensureDir(path.dirname(this.dbPath))
      
      // Create SQLite database connection with error handling
      try {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
          if (err) {
            logger.error('Error opening SQLite database:', err)
            throw err
          }
          logger.info('Connected to SQLite database')
        })

        // Create tables
        await this.createTables()
        
        // Set up error handling
        this.db.on('error', (err) => {
          logger.error('SQLite database error:', err)
        })
      } catch (sqliteError) {
        logger.error('SQLite initialization failed:', sqliteError)
        
        // If SQLite fails and we're in production, try to fallback to PostgreSQL
        if (process.env.NODE_ENV === 'production') {
          logger.warn('Attempting fallback to PostgreSQL due to SQLite failure')
          this.client = 'postgres'
          
          // Try to initialize PostgreSQL
          const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL
          if (databaseUrl) {
            this.pg = new Pool({
              connectionString: databaseUrl,
              ssl: { rejectUnauthorized: false }
            })
            
            await this.pg.query('SELECT 1')
            logger.info('Successfully connected to PostgreSQL as fallback')
            await this.createTables()
            return
          }
        }
        
        // If no fallback available, re-throw the original error
        throw sqliteError
      }

    } catch (error) {
      logger.error('Failed to initialize database:', error)
      throw error
    }
  }

  async createTables() {
    if (this.client === 'postgres') {
      // Postgres schema
      const createImagesTable = `
        CREATE TABLE IF NOT EXISTS images (
          id TEXT PRIMARY KEY,
          filename TEXT NOT NULL,
          original_name TEXT NOT NULL,
          size INTEGER NOT NULL,
          width INTEGER,
          height INTEGER,
          format TEXT,
          channels INTEGER,
          density INTEGER,
          uploaded_at TIMESTAMPTZ DEFAULT NOW(),
          status TEXT DEFAULT 'processing',
          temp_path TEXT,
          minio_path TEXT,
          thumbnail_path TEXT,
          responsive_paths JSONB,
          exif_data JSONB,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      const createImageBlobsTable = `
        CREATE TABLE IF NOT EXISTS image_blobs (
          image_id TEXT PRIMARY KEY REFERENCES images (id) ON DELETE CASCADE,
          content_type TEXT NOT NULL,
          data BYTEA NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      const createImageStatusTable = `
        CREATE TABLE IF NOT EXISTS image_status (
          image_id TEXT PRIMARY KEY REFERENCES images (id) ON DELETE CASCADE,
          status TEXT NOT NULL,
          progress INTEGER DEFAULT 0,
          error_message TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      await this.pg.query(createImagesTable)
      await this.pg.query(createImageBlobsTable)
      await this.pg.query(createImageStatusTable)
      logger.info('PostgreSQL tables created/verified')
      return
    }

    // SQLite schema
    return new Promise((resolve, reject) => {
      const createImagesTable = `
        CREATE TABLE IF NOT EXISTS images (
          id TEXT PRIMARY KEY,
          filename TEXT NOT NULL,
          original_name TEXT NOT NULL,
          size INTEGER NOT NULL,
          width INTEGER,
          height INTEGER,
          format TEXT,
          channels INTEGER,
          density INTEGER,
          uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'processing',
          temp_path TEXT,
          minio_path TEXT,
          thumbnail_path TEXT,
          responsive_paths TEXT,
          exif_data TEXT,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `

      const createImageStatusTable = `
        CREATE TABLE IF NOT EXISTS image_status (
          image_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          progress INTEGER DEFAULT 0,
          error_message TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE CASCADE
        )
      `

      this.db.serialize(() => {
        this.db.run(createImagesTable, (err) => {
          if (err) {
            logger.error('Error creating images table:', err)
            reject(err)
            return
          }
          logger.info('Images table created/verified')
        })

        this.db.run(createImageStatusTable, (err) => {
          if (err) {
            logger.error('Error creating image_status table:', err)
            reject(err)
            return
          }
          logger.info('Image status table created/verified')
          resolve()
        })
      })
    })
  }

  async insertImageBlob(imageId, buffer, contentType) {
    if (this.client !== 'postgres') {
      throw new Error('insertImageBlob is only supported with Postgres client')
    }
    const sql = `
      INSERT INTO image_blobs (image_id, content_type, data)
      VALUES ($1, $2, $3)
      ON CONFLICT (image_id) DO UPDATE SET
        content_type = EXCLUDED.content_type,
        data = EXCLUDED.data,
        created_at = NOW()
    `
    await this.pg.query(sql, [imageId, contentType, buffer])
    return imageId
  }

  async getImageBlob(imageId) {
    if (this.client !== 'postgres') {
      throw new Error('getImageBlob is only supported with Postgres client')
    }
    const sql = 'SELECT content_type, data FROM image_blobs WHERE image_id = $1'
    const { rows } = await this.pg.query(sql, [imageId])
    return rows[0] || null
  }

  async insertImage(imageData) {
    if (this.client === 'postgres') {
      // Postgres insert
      const sql = `
        INSERT INTO images (
          id, filename, original_name, size, width, height, format,
          channels, density, status, temp_path, metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id) DO NOTHING
      `
      const params = [
        imageData.id,
        imageData.filename,
        imageData.originalName,
        imageData.size || 0,
        imageData.width || 0,
        imageData.height || 0,
        imageData.metadata?.format || 'unknown',
        imageData.metadata?.channels || 0,
        imageData.metadata?.density || 0,
        imageData.status || 'processing',
        imageData.tempPath || null,
        imageData.metadata || {}
      ]
      await this.pg.query(sql, params)
      logger.info(`Image inserted with ID: ${imageData.id}`)
      return imageData.id
    }

    return new Promise((resolve, reject) => {
      // Validate required fields
      if (!imageData.id || !imageData.filename || !imageData.originalName) {
        const error = new Error('Missing required fields: id, filename, or originalName')
        logger.error('Validation error:', error)
        reject(error)
        return
      }
      
      const sql = `
        INSERT INTO images (
          id, filename, original_name, size, width, height, format, 
          channels, density, status, temp_path, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      
      const params = [
        imageData.id,
        imageData.filename,
        imageData.originalName,
        imageData.size || 0,
        imageData.width || 0,
        imageData.height || 0,
        imageData.metadata?.format || 'unknown',
        imageData.metadata?.channels || 0,
        imageData.metadata?.density || 0,
        imageData.status || 'processing',
        imageData.tempPath || null,
        JSON.stringify(imageData.metadata || {})
      ]

      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('Error inserting image:', err)
          reject(err)
        } else {
          logger.info(`Image inserted with ID: ${imageData.id}`)
          resolve(this.lastID)
        }
      })
    })
  }

  async updateImageStatus(imageId, status, progress = 0, errorMessage = null) {
    if (this.client === 'postgres') {
      const sql = `
        INSERT INTO image_status (image_id, status, progress, error_message, updated_at)
        VALUES ($1,$2,$3,$4,NOW())
        ON CONFLICT (image_id) DO UPDATE SET
          status = EXCLUDED.status,
          progress = EXCLUDED.progress,
          error_message = EXCLUDED.error_message,
          updated_at = NOW()
      `
      await this.pg.query(sql, [imageId, status, progress, errorMessage])
      return 1
    }

    return new Promise((resolve, reject) => {
      // Validate inputs
      if (!imageId || !status) {
        const error = new Error('Missing required fields: imageId or status')
        logger.error('Validation error:', error)
        reject(error)
        return
      }
      
      // Validate status values
      const validStatuses = ['processing', 'completed', 'failed', 'pending']
      if (!validStatuses.includes(status)) {
        const error = new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`)
        logger.error('Validation error:', error)
        reject(error)
        return
      }
      
      const sql = `
        INSERT OR REPLACE INTO image_status (image_id, status, progress, error_message, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `
      
      this.db.run(sql, [imageId, status, progress, errorMessage], function(err) {
        if (err) {
          logger.error('Error updating image status:', err)
          reject(err)
        } else {
          logger.info(`Image status updated: ${imageId} -> ${status} (${progress}%)`)
          resolve(this.changes)
        }
      })
    })
  }

  async updateImageAfterProcessing(imageId, processingResult) {
    if (this.client === 'postgres') {
      const sql = `
        UPDATE images SET
          status = 'completed',
          minio_path = $1,
          thumbnail_path = $2,
          responsive_paths = $3,
          exif_data = $4,
          updated_at = NOW()
        WHERE id = $5
      `
      const params = [
        processingResult.paths.raw || null,
        processingResult.paths.thumbnail || null,
        processingResult.paths.responsive || {},
        processingResult.metadata.exif || {},
        imageId
      ]
      const result = await this.pg.query(sql, params)
      if (result.rowCount === 0) {
        throw new Error(`Image not found: ${imageId}`)
      }
      logger.info(`Image ${imageId} updated after processing`)
      return result.rowCount
    }

    return new Promise((resolve, reject) => {
      // Validate inputs
      if (!imageId || !processingResult) {
        const error = new Error('Missing required fields: imageId or processingResult')
        logger.error('Validation error:', error)
        reject(error)
        return
      }
      
      if (!processingResult.paths || !processingResult.metadata) {
        const error = new Error('Invalid processingResult: missing paths or metadata')
        logger.error('Validation error:', error)
        reject(error)
        return
      }
      
      const sql = `
        UPDATE images SET 
          status = 'completed',
          minio_path = ?,
          thumbnail_path = ?,
          responsive_paths = ?,
          exif_data = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      
      const params = [
        processingResult.paths.raw || null,
        processingResult.paths.thumbnail || null,
        JSON.stringify(processingResult.paths.responsive || {}),
        JSON.stringify(processingResult.metadata.exif || {}),
        imageId
      ]

      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('Error updating image after processing:', err)
          reject(err)
        } else {
          if (this.changes === 0) {
            logger.warn(`No image found with ID: ${imageId}`)
            reject(new Error(`Image not found: ${imageId}`))
          } else {
            logger.info(`Image ${imageId} updated after processing`)
            resolve(this.changes)
          }
        }
      })
    })
  }

  async getImage(imageId) {
    if (this.client === 'postgres') {
      const sql = 'SELECT * FROM images WHERE id = $1'
      const result = await this.pg.query(sql, [imageId])
      const row = result.rows[0]
      return row || null
    }
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM images WHERE id = ?'
      
      this.db.get(sql, [imageId], (err, row) => {
        if (err) {
          logger.error('Error getting image:', err)
          reject(err)
        } else {
          if (row) {
            // Parse JSON fields
            row.metadata = row.metadata ? JSON.parse(row.metadata) : {}
            row.exif_data = row.exif_data ? JSON.parse(row.exif_data) : null
            row.responsive_paths = row.responsive_paths ? JSON.parse(row.responsive_paths) : {}
          }
          resolve(row)
        }
      })
    })
  }

  async getImages(filters = {}) {
    if (this.client === 'postgres') {
      const clauses = ['1=1']
      const params = []
      let idx = 1

      if (filters.search) {
        clauses.push('(filename ILIKE $' + idx + ' OR original_name ILIKE $' + (idx + 1) + ')')
        const term = `%${filters.search}%`
        params.push(term, term)
        idx += 2
      }
      if (filters.album) {
        clauses.push("metadata::text ILIKE $" + idx)
        params.push(`%"album":"${filters.album}"%`)
        idx += 1
      }
      if (filters.status) {
        clauses.push('status = $' + idx)
        params.push(filters.status)
        idx += 1
      }

      const sortBy = filters.sortBy || 'uploaded_at'
      const sortOrder = (filters.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
      let sql = `SELECT * FROM images WHERE ${clauses.join(' AND ')} ORDER BY ${sortBy} ${sortOrder}`
      if (filters.limit) {
        sql += ` LIMIT $${idx}`
        params.push(filters.limit)
        idx += 1
        if (filters.offset) {
          sql += ` OFFSET $${idx}`
          params.push(filters.offset)
          idx += 1
        }
      }
      const result = await this.pg.query(sql, params)
      return result.rows
    }

    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM images WHERE 1=1'
      const params = []

      // Apply filters
      if (filters.search) {
        sql += ' AND (filename LIKE ? OR original_name LIKE ?)'
        const searchTerm = `%${filters.search}%`
        params.push(searchTerm, searchTerm)
      }

      if (filters.album) {
        sql += ' AND metadata LIKE ?'
        params.push(`%"album":"${filters.album}"%`)
      }

      if (filters.status) {
        sql += ' AND status = ?'
        params.push(filters.status)
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'uploaded_at'
      const sortOrder = filters.sortOrder || 'DESC'
      sql += ` ORDER BY ${sortBy} ${sortOrder}`

      // Apply pagination
      if (filters.limit) {
        sql += ' LIMIT ?'
        params.push(filters.limit)
        
        if (filters.offset) {
          sql += ' OFFSET ?'
          params.push(filters.offset)
        }
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('Error getting images:', err)
          reject(err)
        } else {
          // Parse JSON fields for each row
          const processedRows = rows.map(row => {
            row.metadata = row.metadata ? JSON.parse(row.metadata) : {}
            row.exif_data = row.exif_data ? JSON.parse(row.exif_data) : null
            row.responsive_paths = row.responsive_paths ? JSON.parse(row.responsive_paths) : {}
            return row
          })
          resolve(processedRows)
        }
      })
    })
  }

  async getImageStatus(imageId) {
    if (this.client === 'postgres') {
      const sql = 'SELECT * FROM image_status WHERE image_id = $1'
      const result = await this.pg.query(sql, [imageId])
      return result.rows[0] || null
    }
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM image_status WHERE image_id = ?'
      
      this.db.get(sql, [imageId], (err, row) => {
        if (err) {
          logger.error('Error getting image status:', err)
          reject(err)
        } else {
          resolve(row)
        }
      })
    })
  }

  async deleteImage(imageId) {
    if (this.client === 'postgres') {
      const sql = 'DELETE FROM images WHERE id = $1'
      const result = await this.pg.query(sql, [imageId])
      return result.rowCount
    }
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM images WHERE id = ?'
      
      this.db.run(sql, [imageId], function(err) {
        if (err) {
          logger.error('Error deleting image:', err)
          reject(err)
        } else {
          logger.info(`Image ${imageId} deleted`)
          resolve(this.changes)
        }
      })
    })
  }

  async updateImageMetadata(imageId, metadata) {
    if (this.client === 'postgres') {
      const sql = `
        UPDATE images SET
          metadata = $1,
          updated_at = NOW()
        WHERE id = $2
      `
      const result = await this.pg.query(sql, [metadata || {}, imageId])
      return result.rowCount
    }
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE images SET 
          metadata = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      
      this.db.run(sql, [JSON.stringify(metadata), imageId], function(err) {
        if (err) {
          logger.error('Error updating image metadata:', err)
          reject(err)
        } else {
          resolve(this.changes)
        }
      })
    })
  }

  async close() {
    if (this.client === 'postgres') {
      if (this.pg) {
        await this.pg.end()
        logger.info('PostgreSQL pool closed')
      }
      return
    }
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            logger.error('Error closing database:', err)
            reject(err)
          } else {
            logger.info('Database connection closed')
            resolve()
          }
        })
      } else {
        resolve()
      }
    })
  }
}

module.exports = Database
