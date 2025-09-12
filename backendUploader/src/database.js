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
    this.client = (process.env.DB_CLIENT || 'sqlite').toLowerCase()
    this.dbPath = path.join(__dirname, '..', 'data', 'images.db')
  }

  async initialize() {
    try {
      if (this.client === 'postgres') {
        // Initialize PostgreSQL connection pool
        this.pg = new Pool({
          host: process.env.POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.POSTGRES_PORT || '5432'),
          user: process.env.POSTGRES_USER || 'postgres',
          password: process.env.POSTGRES_PASSWORD || 'postgres',
          database: process.env.POSTGRES_DB || 'image_gallery'
        })

        // Verify connection
        await this.pg.query('SELECT 1')
        logger.info('Connected to PostgreSQL database')
        await this.createTables()
        return
      }

      // Ensure data directory exists for SQLite
      await fs.ensureDir(path.dirname(this.dbPath))
      
      // Create SQLite database connection
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Error opening database:', err)
          throw err
        }
        logger.info('Connected to SQLite database')
      })

      // Create tables
      await this.createTables()
      
      // Set up error handling
      this.db.on('error', (err) => {
        logger.error('Database error:', err)
      })

    } catch (error) {
      logger.error('Failed to initialize database:', error)
      throw error
    }
  }

  async createTables() {
    if (this.client === 'postgres') {
      // Postgres schema
      const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role_id TEXT NOT NULL DEFAULT 'visitor',
          display_name TEXT,
          avatar_url TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      const createRolesTable = `
        CREATE TABLE IF NOT EXISTS roles (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          permissions JSONB DEFAULT '[]',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      const createUserSessionsTable = `
        CREATE TABLE IF NOT EXISTS user_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
          token TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      const createCommentsTable = `
        CREATE TABLE IF NOT EXISTS comments (
          id TEXT PRIMARY KEY,
          image_id TEXT NOT NULL REFERENCES images (id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          is_approved BOOLEAN DEFAULT false,
          parent_id TEXT REFERENCES comments (id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      const createThemesTable = `
        CREATE TABLE IF NOT EXISTS themes (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          palette JSONB NOT NULL,
          user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
          is_public BOOLEAN DEFAULT false,
          is_default BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      const createUserThemePreferencesTable = `
        CREATE TABLE IF NOT EXISTS user_theme_preferences (
          user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
          theme_id TEXT NOT NULL REFERENCES themes (id) ON DELETE CASCADE,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      const createAlbumThemeOverridesTable = `
        CREATE TABLE IF NOT EXISTS album_theme_overrides (
          album_id TEXT PRIMARY KEY,
          theme_id TEXT NOT NULL REFERENCES themes (id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
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
          user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
          is_published BOOLEAN DEFAULT false,
          title TEXT,
          caption TEXT,
          tags JSONB DEFAULT '[]',
          album_id TEXT,
          license TEXT,
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
      await this.pg.query(createUsersTable)
      await this.pg.query(createRolesTable)
      await this.pg.query(createUserSessionsTable)
      await this.pg.query(createCommentsTable)
      await this.pg.query(createThemesTable)
      await this.pg.query(createUserThemePreferencesTable)
      await this.pg.query(createAlbumThemeOverridesTable)
      await this.pg.query(createImagesTable)
      await this.pg.query(createImageBlobsTable)
      await this.pg.query(createImageStatusTable)
      
      // Insert default roles and themes
      await this.insertDefaultRoles()
      await this.insertDefaultThemes()
      
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

      // Enhanced search - across title, caption, tags, and metadata
      if (filters.search) {
        clauses.push(`(
          filename ILIKE $${idx} OR 
          original_name ILIKE $${idx + 1} OR
          title ILIKE $${idx + 2} OR
          caption ILIKE $${idx + 3} OR
          tags::text ILIKE $${idx + 4} OR
          metadata::text ILIKE $${idx + 5}
        )`)
        const term = `%${filters.search}%`
        params.push(term, term, term, term, term, term)
        idx += 6
      }
      
      // Album filter
      if (filters.album) {
        clauses.push('album_id = $' + idx)
        params.push(filters.album)
        idx += 1
      }
      
      // Status filter
      if (filters.status) {
        clauses.push('status = $' + idx)
        params.push(filters.status)
        idx += 1
      }
      
      // Published filter
      if (filters.published !== undefined) {
        clauses.push('is_published = $' + idx)
        params.push(filters.published)
        idx += 1
      }
      
      // User filter (for user's own images)
      if (filters.userId) {
        clauses.push('user_id = $' + idx)
        params.push(filters.userId)
        idx += 1
      }
      
      // Date range filter
      if (filters.dateFrom) {
        clauses.push('uploaded_at >= $' + idx)
        params.push(filters.dateFrom)
        idx += 1
      }
      if (filters.dateTo) {
        clauses.push('uploaded_at <= $' + idx)
        params.push(filters.dateTo)
        idx += 1
      }
      
      // License filter
      if (filters.license) {
        clauses.push('license = $' + idx)
        params.push(filters.license)
        idx += 1
      }
      
      // Camera metadata filters
      if (filters.camera) {
        clauses.push(`exif_data->>'Make' ILIKE $${idx}`)
        params.push(`%${filters.camera}%`)
        idx += 1
      }
      if (filters.lens) {
        clauses.push(`exif_data->>'LensModel' ILIKE $${idx}`)
        params.push(`%${filters.lens}%`)
        idx += 1
      }
      if (filters.focalLength) {
        clauses.push(`exif_data->>'FocalLength' = $${idx}`)
        params.push(filters.focalLength)
        idx += 1
      }
      
      // Tags filter (array contains)
      if (filters.tags && filters.tags.length > 0) {
        clauses.push(`tags ?| $${idx}`)
        params.push(filters.tags)
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

  async insertDefaultRoles() {
    if (this.client !== 'postgres') return;
    
    const defaultRoles = [
      {
        id: 'admin',
        name: 'Admin',
        description: 'Full system access',
        permissions: ['upload', 'edit', 'delete', 'publish', 'moderate_comments', 'manage_users']
      },
      {
        id: 'editor',
        name: 'Editor',
        description: 'Can upload, edit and publish content',
        permissions: ['upload', 'edit', 'publish', 'moderate_comments']
      },
      {
        id: 'visitor',
        name: 'Visitor',
        description: 'Read-only access',
        permissions: []
      }
    ];
    
    for (const role of defaultRoles) {
      const sql = `
        INSERT INTO roles (id, name, description, permissions)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING
      `;
      await this.pg.query(sql, [role.id, role.name, role.description, role.permissions]);
    }
    
    logger.info('Default roles inserted');
  }

  async insertDefaultThemes() {
    if (this.client !== 'postgres') return;
    
    const defaultThemes = [
      {
        id: 'default-dark',
        name: 'Default Dark',
        description: 'Modern dark theme with blue accents',
        palette: {
          primary: { main: '#3b82f6', light: '#60a5fa', dark: '#1d4ed8' },
          secondary: { main: '#6b7280', light: '#9ca3af', dark: '#374151' },
          background: { main: '#0f172a', light: '#1e293b', dark: '#020617' },
          surface: { main: '#1e293b', light: '#334155', dark: '#0f172a' },
          text: { primary: '#f8fafc', secondary: '#cbd5e1', disabled: '#64748b' },
          accent: { main: '#8b5cf6', light: '#a78bfa', dark: '#7c3aed' },
          success: { main: '#10b981', light: '#34d399', dark: '#059669' },
          warning: { main: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
          error: { main: '#ef4444', light: '#f87171', dark: '#dc2626' },
          border: { main: '#334155', light: '#475569', dark: '#1e293b' },
          card: { main: '#1e293b', light: '#334155', dark: '#0f172a' },
          button: {
            primary: { bg: '#3b82f6', text: '#ffffff', hover: '#2563eb' },
            secondary: { bg: '#6b7280', text: '#ffffff', hover: '#5b6674' },
            ghost: { bg: 'transparent', text: '#cbd5e1', hover: '#334155' }
          }
        },
        is_public: true,
        is_default: true
      },
      {
        id: 'default-light',
        name: 'Default Light',
        description: 'Clean light theme with blue accents',
        palette: {
          primary: { main: '#3b82f6', light: '#60a5fa', dark: '#1d4ed8' },
          secondary: { main: '#6b7280', light: '#9ca3af', dark: '#374151' },
          background: { main: '#ffffff', light: '#f8fafc', dark: '#f1f5f9' },
          surface: { main: '#ffffff', light: '#f8fafc', dark: '#f1f5f9' },
          text: { primary: '#0f172a', secondary: '#475569', disabled: '#94a3b8' },
          accent: { main: '#8b5cf6', light: '#a78bfa', dark: '#7c3aed' },
          success: { main: '#10b981', light: '#34d399', dark: '#059669' },
          warning: { main: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
          error: { main: '#ef4444', light: '#f87171', dark: '#dc2626' },
          border: { main: '#e2e8f0', light: '#f1f5f9', dark: '#cbd5e1' },
          card: { main: '#ffffff', light: '#f8fafc', dark: '#f1f5f9' },
          button: {
            primary: { bg: '#3b82f6', text: '#ffffff', hover: '#2563eb' },
            secondary: { bg: '#6b7280', text: '#ffffff', hover: '#5b6674' },
            ghost: { bg: 'transparent', text: '#475569', hover: '#f1f5f9' }
          }
        },
        is_public: true,
        is_default: false
      }
    ];
    
    for (const theme of defaultThemes) {
      const sql = `
        INSERT INTO themes (id, name, description, palette, is_public, is_default)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
      `;
      await this.pg.query(sql, [
        theme.id,
        theme.name,
        theme.description,
        theme.palette,
        theme.is_public,
        theme.is_default
      ]);
    }
    
    logger.info('Default themes inserted');
  }

  async createTheme(themeData) {
    if (this.client !== 'postgres') return null;
    
    const sql = `
      INSERT INTO themes (id, name, description, palette, user_id, is_public)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await this.pg.query(sql, [
      themeData.id,
      themeData.name,
      themeData.description,
      themeData.palette,
      themeData.userId,
      themeData.isPublic || false
    ]);
    
    return result.rows[0];
  }

  async getThemes(userId = null, includePublic = true) {
    if (this.client !== 'postgres') return [];
    
    let sql = 'SELECT * FROM themes WHERE 1=1';
    const params = [];
    let idx = 1;
    
    if (includePublic) {
      sql += ' AND (is_public = true';
      if (userId) {
        sql += ` OR user_id = $${idx}`;
        params.push(userId);
        idx++;
      }
      sql += ')';
    } else if (userId) {
      sql += ` AND user_id = $${idx}`;
      params.push(userId);
      idx++;
    }
    
    sql += ' ORDER BY is_default DESC, name ASC';
    
    const result = await this.pg.query(sql, params);
    return result.rows;
  }

  async getThemeById(themeId) {
    if (this.client !== 'postgres') return null;
    
    const sql = 'SELECT * FROM themes WHERE id = $1';
    const result = await this.pg.query(sql, [themeId]);
    return result.rows[0] || null;
  }

  async updateTheme(themeId, themeData) {
    if (this.client !== 'postgres') return 0;
    
    const sql = `
      UPDATE themes 
      SET name = $1, description = $2, palette = $3, is_public = $4, updated_at = NOW()
      WHERE id = $5 AND (user_id = $6 OR $6 IS NULL)
    `;
    
    const result = await this.pg.query(sql, [
      themeData.name,
      themeData.description,
      themeData.palette,
      themeData.isPublic,
      themeId,
      themeData.userId
    ]);
    
    return result.rowCount;
  }

  async deleteTheme(themeId, userId = null) {
    if (this.client !== 'postgres') return 0;
    
    let sql = 'DELETE FROM themes WHERE id = $1';
    const params = [themeId];
    
    if (userId) {
      sql += ' AND user_id = $2';
      params.push(userId);
    }
    
    const result = await this.pg.query(sql, params);
    return result.rowCount;
  }

  async setUserThemePreference(userId, themeId) {
    if (this.client !== 'postgres') return null;
    
    const sql = `
      INSERT INTO user_theme_preferences (user_id, theme_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET
        theme_id = EXCLUDED.theme_id,
        updated_at = NOW()
      RETURNING *
    `;
    
    const result = await this.pg.query(sql, [userId, themeId]);
    return result.rows[0];
  }

  async getUserThemePreference(userId) {
    if (this.client !== 'postgres') return null;
    
    const sql = `
      SELECT t.* FROM user_theme_preferences utp
      JOIN themes t ON utp.theme_id = t.id
      WHERE utp.user_id = $1
    `;
    
    const result = await this.pg.query(sql, [userId]);
    return result.rows[0] || null;
  }

  async setAlbumThemeOverride(albumId, themeId) {
    if (this.client !== 'postgres') return null;
    
    const sql = `
      INSERT INTO album_theme_overrides (album_id, theme_id)
      VALUES ($1, $2)
      ON CONFLICT (album_id) DO UPDATE SET
        theme_id = EXCLUDED.theme_id
      RETURNING *
    `;
    
    const result = await this.pg.query(sql, [albumId, themeId]);
    return result.rows[0];
  }

  async getAlbumThemeOverride(albumId) {
    if (this.client !== 'postgres') return null;
    
    const sql = `
      SELECT t.* FROM album_theme_overrides ato
      JOIN themes t ON ato.theme_id = t.id
      WHERE ato.album_id = $1
    `;
    
    const result = await this.pg.query(sql, [albumId]);
    return result.rows[0] || null;
  }

  async createUser(userData) {
    if (this.client !== 'postgres') {
      throw new Error('User management only supported with PostgreSQL');
    }
    
    const sql = `
      INSERT INTO users (id, username, email, password_hash, role_id, display_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await this.pg.query(sql, [
      userData.id,
      userData.username,
      userData.email,
      userData.passwordHash,
      userData.roleId || 'visitor',
      userData.displayName
    ]);
    
    return result.rows[0];
  }

  async getUserByUsername(username) {
    if (this.client !== 'postgres') return null;
    
    const sql = `
      SELECT u.*, r.name as role_name, r.permissions
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.username = $1 AND u.is_active = true
    `;
    
    const result = await this.pg.query(sql, [username]);
    return result.rows[0] || null;
  }

  async getUserById(userId) {
    if (this.client !== 'postgres') return null;
    
    const sql = `
      SELECT u.*, r.name as role_name, r.permissions
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1 AND u.is_active = true
    `;
    
    const result = await this.pg.query(sql, [userId]);
    return result.rows[0] || null;
  }

  async createUserSession(sessionData) {
    if (this.client !== 'postgres') return null;
    
    const sql = `
      INSERT INTO user_sessions (id, user_id, token, expires_at)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await this.pg.query(sql, [
      sessionData.id,
      sessionData.userId,
      sessionData.token,
      sessionData.expiresAt
    ]);
    
    return result.rows[0];
  }

  async getUserByToken(token) {
    if (this.client !== 'postgres') return null;
    
    const sql = `
      SELECT u.*, r.name as role_name, r.permissions, s.expires_at
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE s.token = $1 AND s.expires_at > NOW() AND u.is_active = true
    `;
    
    const result = await this.pg.query(sql, [token]);
    return result.rows[0] || null;
  }

  async addComment(commentData) {
    if (this.client !== 'postgres') return null;
    
    const sql = `
      INSERT INTO comments (id, image_id, user_id, content, parent_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await this.pg.query(sql, [
      commentData.id,
      commentData.imageId,
      commentData.userId,
      commentData.content,
      commentData.parentId || null
    ]);
    
    return result.rows[0];
  }

  async getComments(imageId, includeUnapproved = false) {
    if (this.client !== 'postgres') return [];
    
    let sql = `
      SELECT c.*, u.username, u.display_name, u.avatar_url
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.image_id = $1
    `;
    
    if (!includeUnapproved) {
      sql += ' AND c.is_approved = true';
    }
    
    sql += ' ORDER BY c.created_at ASC';
    
    const result = await this.pg.query(sql, [imageId]);
    return result.rows;
  }

  async moderateComment(commentId, isApproved) {
    if (this.client !== 'postgres') return 0;
    
    const sql = `
      UPDATE comments 
      SET is_approved = $1, updated_at = NOW()
      WHERE id = $2
    `;
    
    const result = await this.pg.query(sql, [isApproved, commentId]);
    return result.rowCount;
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
