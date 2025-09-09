const winston = require('winston')
const Redis = require('redis')
const Minio = require('minio')

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

class ConnectionManager {
  constructor() {
    this.redis = null
    this.minio = null
    this.connections = {
      redis: { status: 'disconnected', lastError: null, retryCount: 0 },
      minio: { status: 'disconnected', lastError: null, retryCount: 0 }
    }
  }

  async initializeRedis(config) {
    try {
      // Parse Redis URL to get host and port
      const redisUrl = config.url || 'redis://localhost:6379'
      const url = new URL(redisUrl)
      const host = url.hostname
      const port = parseInt(url.port) || 6379
      
      // First, try to test if Redis is available with a simple connection test
      const testConnection = () => {
        return new Promise((resolve, reject) => {
          const net = require('net')
          const socket = new net.Socket()
          
          const timeout = setTimeout(() => {
            socket.destroy()
            reject(new Error('Redis connection timeout'))
          }, 2000)
          
          socket.connect(port, host, () => {
            clearTimeout(timeout)
            socket.destroy()
            resolve(true)
          })
          
          socket.on('error', (err) => {
            clearTimeout(timeout)
            socket.destroy()
            reject(err)
          })
        })
      }
      
      // Test connection first
      await testConnection()
      
      this.redis = Redis.createClient({
        url: config.url || 'redis://localhost:6379',
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.warn('Redis connection refused, disabling retries for local development')
            return new Error('Redis connection refused')
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error('Redis retry time exhausted')
            return new Error('Retry time exhausted')
          }
          if (options.attempt > 3) {
            logger.warn('Redis max retry attempts reached, disabling Redis')
            return undefined
          }
          return Math.min(options.attempt * 100, 1000)
        }
      })

      // Add comprehensive Redis error handling
      this.redis.on('error', (err) => {
        logger.warn('Redis connection error:', err.message)
        this.connections.redis.status = 'error'
        this.connections.redis.lastError = err
        this.connections.redis.retryCount++
        
        if (err.code === 'ECONNREFUSED') {
          logger.warn('Redis server is not running. Queue processing will be disabled.')
        }
      })

      this.redis.on('connect', () => {
        logger.info('Connected to Redis')
        this.connections.redis.status = 'connected'
        this.connections.redis.retryCount = 0
      })

      this.redis.on('ready', () => {
        logger.info('Redis client ready')
        this.connections.redis.status = 'ready'
      })

      this.redis.on('reconnecting', () => {
        logger.info('Redis client reconnecting...')
        this.connections.redis.status = 'reconnecting'
      })

      this.redis.on('end', () => {
        logger.warn('Redis connection ended')
        this.connections.redis.status = 'disconnected'
      })

      // Add connection timeout
      const connectPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Redis connection timeout'))
        }, 5000) // 5 second timeout
        
        this.redis.on('ready', () => {
          clearTimeout(timeout)
          resolve(this.redis)
        })
        
        this.redis.on('error', (err) => {
          clearTimeout(timeout)
          reject(err)
        })
      })
      
      await this.redis.connect()
      await connectPromise
      return this.redis
    } catch (error) {
      logger.warn('Redis not available:', error.message)
      logger.warn('Queue processing will be disabled for local development')
      this.connections.redis.status = 'disabled'
      this.connections.redis.lastError = error
      this.redis = null
      return null
    }
  }

  async initializeMinIO(config) {
    try {
      this.minio = new Minio.Client({
        endPoint: config.endPoint || 'localhost',
        port: parseInt(config.port) || 9000,
        useSSL: config.useSSL === 'true',
        accessKey: config.accessKey || 'minioadmin',
        secretKey: config.secretKey || 'minioadmin'
      })

      // Test MinIO connection
      await this.testMinIOConnection(config.bucket || 'images')
      
      this.connections.minio.status = 'connected'
      return this.minio
    } catch (error) {
      logger.warn('MinIO not available:', error.message)
      logger.warn('Object storage will be disabled for local development')
      this.connections.minio.status = 'disabled'
      this.connections.minio.lastError = error
      this.minio = null
      return null
    }
  }

  async testMinIOConnection(bucketName, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info(`Testing MinIO connection (attempt ${attempt}/${retries})`)
        
        // Test basic connection and create bucket if it doesn't exist
        const bucketExists = await this.minio.bucketExists(bucketName)
        if (!bucketExists) {
          logger.info(`MinIO bucket '${bucketName}' does not exist. Creating it...`)
          await this.minio.makeBucket(bucketName, 'us-east-1')
          logger.info(`MinIO bucket '${bucketName}' created successfully`)
        } else {
          logger.info(`MinIO bucket '${bucketName}' is accessible`)
        }
        
        // Test write permissions with a small test object
        const testKey = `test-connection-${Date.now()}.txt`
        const testData = Buffer.from('test connection')
        
        await this.minio.putObject(bucketName, testKey, testData, {
          'Content-Type': 'text/plain'
        })
        
        // Clean up test object
        await this.minio.removeObject(bucketName, testKey)
        
        logger.info('MinIO connection validated successfully')
        return true
        
      } catch (error) {
        logger.error(`MinIO connection test failed (attempt ${attempt}/${retries}):`, error)
        
        if (attempt === retries) {
          logger.error('MinIO connection test failed after all retries')
          throw error
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
      }
    }
  }

  async testRedisConnection() {
    try {
      if (!this.redis) {
        throw new Error('Redis client not initialized')
      }
      
      await this.redis.ping()
      this.connections.redis.status = 'connected'
      return true
    } catch (error) {
      logger.error('Redis connection test failed:', error)
      this.connections.redis.status = 'error'
      this.connections.redis.lastError = error
      throw error
    }
  }

  getConnectionStatus() {
    return {
      redis: {
        status: this.connections.redis.status,
        lastError: this.connections.redis.lastError?.message,
        retryCount: this.connections.redis.retryCount
      },
      minio: {
        status: this.connections.minio.status,
        lastError: this.connections.minio.lastError?.message,
        retryCount: this.connections.minio.retryCount
      }
    }
  }

  async close() {
    try {
      if (this.redis) {
        await this.redis.quit()
        logger.info('Redis connection closed')
      }
    } catch (error) {
      logger.error('Error closing Redis connection:', error)
    }
  }
}

module.exports = ConnectionManager
