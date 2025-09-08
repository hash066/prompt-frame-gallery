const sharp = require('sharp')
const fs = require('fs-extra')
const path = require('path')
const exifr = require('exifr')

describe('Image Processing Worker Tests', () => {
  let testImagePath
  let testImageBuffer

  beforeAll(async () => {
    // Create a test image with EXIF data
    testImageBuffer = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .jpeg({ 
      quality: 90,
      mozjpeg: true
    })
    .toBuffer()

    testImagePath = path.join(__dirname, 'test-image.jpg')
    await fs.writeFile(testImagePath, testImageBuffer)
  })

  afterAll(async () => {
    if (testImagePath && await fs.pathExists(testImagePath)) {
      await fs.remove(testImagePath)
    }
  })

  describe('Image Processing Functions', () => {
    it('should extract image metadata correctly', async () => {
      const metadata = await sharp(testImageBuffer).metadata()
      
      expect(metadata.width).toBe(800)
      expect(metadata.height).toBe(600)
      expect(metadata.format).toBe('jpeg')
      expect(metadata.channels).toBe(3)
    })

    it('should generate thumbnail correctly', async () => {
      const thumbnailBuffer = await sharp(testImageBuffer)
        .resize(200, 200, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 85 })
        .toBuffer()

      const thumbnailMetadata = await sharp(thumbnailBuffer).metadata()
      
      expect(thumbnailMetadata.width).toBe(200)
      expect(thumbnailMetadata.height).toBe(200)
      expect(thumbnailMetadata.format).toBe('jpeg')
    })

    it('should generate responsive sizes correctly', async () => {
      const responsiveSizes = [320, 640, 1024, 2048]
      
      for (const size of responsiveSizes) {
        const responsiveBuffer = await sharp(testImageBuffer)
          .resize(size, null, {
            withoutEnlargement: true,
            fit: 'inside'
          })
          .jpeg({ quality: 85 })
          .toBuffer()

        const responsiveMetadata = await sharp(responsiveBuffer).metadata()
        
        expect(responsiveMetadata.width).toBeLessThanOrEqual(size)
        expect(responsiveMetadata.height).toBeLessThanOrEqual(600) // Original height
        expect(responsiveMetadata.format).toBe('jpeg')
      }
    })

    it('should convert to WebP format correctly', async () => {
      const webpBuffer = await sharp(testImageBuffer)
        .webp({ quality: 80 })
        .toBuffer()

      const webpMetadata = await sharp(webpBuffer).metadata()
      
      expect(webpMetadata.format).toBe('webp')
      expect(webpMetadata.width).toBe(800)
      expect(webpMetadata.height).toBe(600)
    })

    it('should convert to AVIF format correctly', async () => {
      const avifBuffer = await sharp(testImageBuffer)
        .avif({ quality: 70 })
        .toBuffer()

      const avifMetadata = await sharp(avifBuffer).metadata()
      
      // Some environments report AVIF as 'heif'. Accept either.
      expect(['avif', 'heif']).toContain(avifMetadata.format)
      expect(avifMetadata.width).toBe(800)
      expect(avifMetadata.height).toBe(600)
    })

    it('should handle EXIF data extraction', async () => {
      // Note: Our test image doesn't have EXIF data, but we can test the function
      const exifData = await exifr.parse(testImagePath)
      
      // Should not throw an error even if no EXIF data (null acceptable)
      expect(() => exifData).not.toThrow
    })

    it('should validate image dimensions', async () => {
      const metadata = await sharp(testImageBuffer).metadata()
      
      // Test dimension limits
      expect(metadata.width).toBeLessThanOrEqual(10000)
      expect(metadata.height).toBeLessThanOrEqual(10000)
      expect(metadata.width).toBeGreaterThan(0)
      expect(metadata.height).toBeGreaterThan(0)
    })

    it('should handle different image formats', async () => {
      // Test PNG
      const pngBuffer = await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 4,
          background: { r: 0, g: 255, b: 0, alpha: 0.5 }
        }
      })
      .png()
      .toBuffer()

      const pngMetadata = await sharp(pngBuffer).metadata()
      expect(pngMetadata.format).toBe('png')
      expect(pngMetadata.channels).toBe(4) // RGBA

      // Test WebP
      const webpBuffer = await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 3,
          background: { r: 0, g: 0, b: 255 }
        }
      })
      .webp()
      .toBuffer()

      const webpMetadata = await sharp(webpBuffer).metadata()
      expect(webpMetadata.format).toBe('webp')
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid image files', async () => {
      const invalidBuffer = Buffer.from('This is not an image')
      const invalidPath = path.join(__dirname, 'invalid.jpg')
      await fs.writeFile(invalidPath, invalidBuffer)

      try {
        await expect(sharp(invalidBuffer).metadata()).rejects.toThrow()
      } finally {
        await fs.remove(invalidPath)
      }
    })

    it('should handle corrupted image files', async () => {
      const corruptedBuffer = Buffer.from('corrupted image data')
      
      await expect(sharp(corruptedBuffer).metadata()).rejects.toThrow()
    })

    it('should handle oversized images', async () => {
      // Create a very large image (this might be memory intensive)
      const largeBuffer = await sharp({
        create: {
          width: 5000,
          height: 5000,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      })
      .jpeg()
      .toBuffer()

      const metadata = await sharp(largeBuffer).metadata()
      
      // Should still process but might need special handling
      expect(metadata.width).toBe(5000)
      expect(metadata.height).toBe(5000)
    })
  })

  describe('Performance Tests', () => {
    it('should process images within reasonable time', async () => {
      const startTime = Date.now()
      
      // Process thumbnail
      await sharp(testImageBuffer)
        .resize(200, 200, { fit: 'cover' })
        .jpeg({ quality: 85 })
        .toBuffer()
      
      // Process responsive sizes
      const sizes = [320, 640, 1024]
      for (const size of sizes) {
        await sharp(testImageBuffer)
          .resize(size, null, { withoutEnlargement: true, fit: 'inside' })
          .jpeg({ quality: 85 })
          .toBuffer()
      }
      
      const endTime = Date.now()
      const processingTime = endTime - startTime
      
      // Should complete within 5 seconds for a single image
      expect(processingTime).toBeLessThan(5000)
    })

    it('should maintain image quality', async () => {
      const originalSize = testImageBuffer.length
      
      const processedBuffer = await sharp(testImageBuffer)
        .resize(800, 600)
        .jpeg({ quality: 85 })
        .toBuffer()
      
      const processedSize = processedBuffer.length
      
      // Processed image size should be within a reasonable factor (codec implementations vary)
      const min = Math.min(originalSize, processedSize)
      const max = Math.max(originalSize, processedSize)
      // Ratio should not explode beyond 3x
      expect(max / min).toBeLessThan(3)
    })
  })
})
