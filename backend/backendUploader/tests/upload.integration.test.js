const request = require('supertest')
const fs = require('fs-extra')
const path = require('path')
const sharp = require('sharp')
const app = require('../src/server')

describe('Upload Integration Tests', () => {
  let testImagePath
  let testImageBuffer

  beforeAll(async () => {
    // Create a test image
    testImageBuffer = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .jpeg({ quality: 90 })
    .toBuffer()

    testImagePath = path.join(__dirname, 'test-image.jpg')
    await fs.writeFile(testImagePath, testImageBuffer)
  })

  afterAll(async () => {
    // Clean up test image
    if (testImagePath && await fs.pathExists(testImagePath)) {
      await fs.remove(testImagePath)
    }
  })

  describe('POST /api/images', () => {
    it('should upload a single image successfully', async () => {
      const response = await request(app)
        .post('/api/images')
        .attach('images', testImagePath)
        .expect(200)

      expect(response.body).toBeInstanceOf(Array)
      expect(response.body).toHaveLength(1)
      
      const result = response.body[0]
      expect(result.success).toBe(true)
      expect(result.imageId).toBeDefined()
      expect(result.filename).toBe('test-image.jpg')
    })

    it('should return a signed URL placeholder for uploaded image', async () => {
      const uploadResponse = await request(app)
        .post('/api/images')
        .attach('images', testImagePath)
        .expect(200)

      const imageId = uploadResponse.body[0].imageId

      const urlResponse = await request(app)
        .get(`/api/images/${imageId}/url`)
        .expect(200)

      expect(urlResponse.body.url).toContain(`/api/images/${imageId}/download`)
    })

    it('should detect invalid magic number even if extension suggests image', async () => {
      // Create a fake jpg extension with incorrect header
      const invalidJpgPath = path.join(__dirname, 'fake.jpg')
      await fs.writeFile(invalidJpgPath, Buffer.from('not a real image'))

      try {
        const response = await request(app)
          .post('/api/images')
          .attach('images', invalidJpgPath)
          .expect(200)

        expect(Array.isArray(response.body)).toBe(true)
        expect(response.body[0].success).toBe(false)
        expect(response.body[0].error).toMatch(/Invalid file header|File validation failed/i)
      } finally {
        await fs.remove(invalidJpgPath)
      }
    })
    it('should upload multiple images successfully', async () => {
      // Create second test image
      const secondImageBuffer = await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 3,
          background: { r: 0, g: 255, b: 0 }
        }
      })
      .png()
      .toBuffer()

      const secondImagePath = path.join(__dirname, 'test-image-2.png')
      await fs.writeFile(secondImagePath, secondImageBuffer)

      try {
        const response = await request(app)
          .post('/api/images')
          .attach('images', testImagePath)
          .attach('images', secondImagePath)
          .expect(200)

        expect(response.body).toBeInstanceOf(Array)
        expect(response.body).toHaveLength(2)
        
        response.body.forEach(result => {
          expect(result.success).toBe(true)
          expect(result.imageId).toBeDefined()
        })
      } finally {
        // Clean up second test image
        await fs.remove(secondImagePath)
      }
    })

    it('should reject files that are too large', async () => {
      // Create a large test image (simulate by creating a buffer)
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024) // 11MB
      const largeImagePath = path.join(__dirname, 'large-test-image.jpg')
      await fs.writeFile(largeImagePath, largeBuffer)

      try {
        const response = await request(app)
          .post('/api/images')
          .attach('images', largeImagePath)
          .expect(400)

        expect(response.body.error).toContain('File too large')
      } finally {
        await fs.remove(largeImagePath)
      }
    })

    it('should reject invalid file types', async () => {
      // Create a text file
      const textFilePath = path.join(__dirname, 'test.txt')
      await fs.writeFile(textFilePath, 'This is not an image')

      try {
        const response = await request(app)
          .post('/api/images')
          .attach('images', textFilePath)
          .expect(400)

        expect(response.body.error).toBeDefined()
      } finally {
        await fs.remove(textFilePath)
      }
    })

    it('should reject requests with too many files', async () => {
      const files = []
      
      // Create 11 test files (limit is 10)
      for (let i = 0; i < 11; i++) {
        const buffer = await sharp({
          create: {
            width: 100,
            height: 100,
            channels: 3,
            background: { r: i * 25, g: 0, b: 0 }
          }
        })
        .jpeg()
        .toBuffer()

        const filePath = path.join(__dirname, `test-${i}.jpg`)
        await fs.writeFile(filePath, buffer)
        files.push(filePath)
      }

      try {
        const requestBuilder = request(app).post('/api/images')
        files.forEach(filePath => {
          requestBuilder.attach('images', filePath)
        })

        const response = await requestBuilder.expect(400)
        expect(response.body.error).toContain('Too many files')
      } finally {
        // Clean up test files
        for (const filePath of files) {
          await fs.remove(filePath)
        }
      }
    })

    it('should handle empty requests', async () => {
      const response = await request(app)
        .post('/api/images')
        .expect(400)

      expect(response.body.error).toBe('No files uploaded')
    })
  })

  describe('GET /api/images', () => {
    it('should return uploaded images', async () => {
      const response = await request(app)
        .get('/api/images')
        .expect(200)

      expect(response.body).toBeInstanceOf(Array)
    })

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/images?page=1&limit=5')
        .expect(200)

      expect(response.body).toBeInstanceOf(Array)
      expect(response.body.length).toBeLessThanOrEqual(5)
    })

    it('should support search', async () => {
      const response = await request(app)
        .get('/api/images?search=test')
        .expect(200)

      expect(response.body).toBeInstanceOf(Array)
    })
  })

  describe('GET /api/images/:id', () => {
    it('should return image details for valid ID', async () => {
      // First upload an image
      const uploadResponse = await request(app)
        .post('/api/images')
        .attach('images', testImagePath)
        .expect(200)

      const imageId = uploadResponse.body[0].imageId

      const response = await request(app)
        .get(`/api/images/${imageId}`)
        .expect(200)

      expect(response.body.id).toBe(imageId)
      expect(response.body.filename).toBe('test-image.jpg')
    })

    it('should return 404 for invalid ID', async () => {
      const response = await request(app)
        .get('/api/images/invalid-id')
        .expect(404)

      expect(response.body.error).toBe('Image not found')
    })
  })

  describe('GET /api/images/:id/status', () => {
    it('should return processing status', async () => {
      // First upload an image
      const uploadResponse = await request(app)
        .post('/api/images')
        .attach('images', testImagePath)
        .expect(200)

      const imageId = uploadResponse.body[0].imageId

      const response = await request(app)
        .get(`/api/images/${imageId}/status`)
        .expect(200)

      expect(response.body.status).toBeDefined()
    })
  })

  describe('POST /api/images/bulk', () => {
    it('should perform bulk update operation', async () => {
      // First upload some images
      const uploadResponse = await request(app)
        .post('/api/images')
        .attach('images', testImagePath)
        .expect(200)

      const imageId = uploadResponse.body[0].imageId

      const response = await request(app)
        .post('/api/images/bulk')
        .send({
          imageIds: [imageId],
          operation: 'update',
          data: {
            title: 'Test Title',
            description: 'Test Description'
          }
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.processed).toBe(1)
    })

    it('should perform bulk delete operation', async () => {
      // First upload an image
      const uploadResponse = await request(app)
        .post('/api/images')
        .attach('images', testImagePath)
        .expect(200)

      const imageId = uploadResponse.body[0].imageId

      const response = await request(app)
        .post('/api/images/bulk')
        .send({
          imageIds: [imageId],
          operation: 'delete'
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.processed).toBe(1)

      // Verify image is deleted
      await request(app)
        .get(`/api/images/${imageId}`)
        .expect(404)
    })

    it('should validate bulk operation request', async () => {
      const response = await request(app)
        .post('/api/images/bulk')
        .send({
          imageIds: ['invalid-id'],
          operation: 'invalid-operation'
        })
        .expect(400)

      expect(response.body.errors).toBeDefined()
    })
  })

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200)

      expect(response.body.status).toBe('healthy')
      expect(response.body.timestamp).toBeDefined()
    })
  })
})
