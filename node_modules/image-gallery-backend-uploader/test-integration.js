const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const path = require('path')

// Test configuration
const BASE_URL = process.env.API_URL || 'http://localhost:3001'
const TEST_IMAGE_PATH = path.join(__dirname, 'test-image.jpg')

// Create a test image if it doesn't exist
function createTestImage() {
  if (!fs.existsSync(TEST_IMAGE_PATH)) {
    // Create a simple 1x1 pixel JPEG
    const jpegData = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
      0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
      0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF, 0xC4,
      0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
      0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0x00, 0xFF, 0xD9
    ])
    fs.writeFileSync(TEST_IMAGE_PATH, jpegData)
    console.log('Created test image:', TEST_IMAGE_PATH)
  }
}

// Test functions
async function testHealthCheck() {
  console.log('\n🔍 Testing health check...')
  try {
    const response = await axios.get(`${BASE_URL}/api/health`)
    console.log('✅ Health check passed:', response.data)
    return response.data
  } catch (error) {
    console.error('❌ Health check failed:', error.message)
    throw error
  }
}

async function testQueueStatus() {
  console.log('\n🔍 Testing queue status...')
  try {
    const response = await axios.get(`${BASE_URL}/api/queue/status`)
    console.log('✅ Queue status:', response.data)
    return response.data
  } catch (error) {
    console.error('❌ Queue status failed:', error.message)
    throw error
  }
}

async function testImageUpload() {
  console.log('\n🔍 Testing image upload...')
  try {
    const formData = new FormData()
    formData.append('images', fs.createReadStream(TEST_IMAGE_PATH))
    
    const response = await axios.post(`${BASE_URL}/api/images`, formData, {
      headers: {
        ...formData.getHeaders()
      }
    })
    
    console.log('✅ Image upload successful:', response.data)
    return response.data[0].imageId
  } catch (error) {
    console.error('❌ Image upload failed:', error.message)
    throw error
  }
}

async function testImageStatus(imageId) {
  console.log('\n🔍 Testing image status...')
  try {
    const response = await axios.get(`${BASE_URL}/api/images/${imageId}/status`)
    console.log('✅ Image status:', response.data)
    return response.data
  } catch (error) {
    console.error('❌ Image status failed:', error.message)
    throw error
  }
}

async function testImageList() {
  console.log('\n🔍 Testing image list...')
  try {
    const response = await axios.get(`${BASE_URL}/api/images`)
    console.log('✅ Image list:', response.data)
    return response.data
  } catch (error) {
    console.error('❌ Image list failed:', error.message)
    throw error
  }
}

async function testImageDownload(imageId) {
  console.log('\n🔍 Testing image download...')
  try {
    const response = await axios.get(`${BASE_URL}/api/images/${imageId}/download`, {
      responseType: 'stream'
    })
    console.log('✅ Image download successful, content-type:', response.headers['content-type'])
    return true
  } catch (error) {
    console.error('❌ Image download failed:', error.message)
    throw error
  }
}

async function testImageUrl(imageId) {
  console.log('\n🔍 Testing image URL generation...')
  try {
    const response = await axios.get(`${BASE_URL}/api/images/${imageId}/url`)
    console.log('✅ Image URL generated:', response.data)
    return response.data
  } catch (error) {
    console.error('❌ Image URL generation failed:', error.message)
    throw error
  }
}

async function waitForProcessing(imageId, maxWaitTime = 30000) {
  console.log('\n⏳ Waiting for image processing to complete...')
  const startTime = Date.now()
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const status = await testImageStatus(imageId)
      if (status.status === 'completed') {
        console.log('✅ Image processing completed!')
        return true
      } else if (status.status === 'failed') {
        console.error('❌ Image processing failed:', status.error_message)
        return false
      }
      console.log(`⏳ Processing... ${status.progress}%`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (error) {
      console.error('❌ Error checking status:', error.message)
      return false
    }
  }
  
  console.error('❌ Processing timeout')
  return false
}

// Main test function
async function runIntegrationTest() {
  console.log('🚀 Starting integration test...')
  
  try {
    // Create test image
    createTestImage()
    
    // Test health check
    const health = await testHealthCheck()
    
    // Test queue status
    await testQueueStatus()
    
    // Test image upload
    const imageId = await testImageUpload()
    
    // Test image status
    await testImageStatus(imageId)
    
    // Test image list
    await testImageList()
    
    // Wait for processing to complete
    const processingComplete = await waitForProcessing(imageId)
    
    if (processingComplete) {
      // Test image download
      await testImageDownload(imageId)
      
      // Test image URL generation
      await testImageUrl(imageId)
    }
    
    console.log('\n🎉 Integration test completed successfully!')
    
  } catch (error) {
    console.error('\n💥 Integration test failed:', error.message)
    process.exit(1)
  }
}

// Run the test
if (require.main === module) {
  runIntegrationTest()
}

module.exports = {
  runIntegrationTest,
  testHealthCheck,
  testQueueStatus,
  testImageUpload,
  testImageStatus,
  testImageList,
  testImageDownload,
  testImageUrl,
  waitForProcessing
}
