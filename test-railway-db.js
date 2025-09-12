#!/usr/bin/env node

/**
 * Test script to verify database configuration for Railway deployment
 * This script tests both PostgreSQL and SQLite configurations
 */

const Database = require('./backendUploader/src/database')

async function testDatabase() {
  console.log('🧪 Testing database configuration for Railway deployment...\n')
  
  const db = new Database()
  
  try {
    console.log(`📊 Database client: ${db.client}`)
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
    
    if (db.client === 'postgres') {
      console.log('🐘 Testing PostgreSQL connection...')
      if (process.env.DATABASE_URL) {
        console.log('✅ DATABASE_URL is set')
      } else if (process.env.POSTGRES_URL) {
        console.log('✅ POSTGRES_URL is set')
      } else {
        console.log('⚠️  No PostgreSQL URL found, using individual variables')
      }
    } else {
      console.log('🗃️  Testing SQLite connection...')
      console.log(`📁 Database path: ${db.dbPath}`)
    }
    
    // Initialize database
    await db.initialize()
    console.log('✅ Database initialized successfully')
    
    // Test basic operations
    console.log('🔍 Testing basic database operations...')
    
    // Test insert
    const testImage = {
      id: 'test-' + Date.now(),
      filename: 'test-image.jpg',
      originalName: 'test-image.jpg',
      size: 1024,
      width: 100,
      height: 100,
      metadata: { format: 'jpeg' },
      status: 'completed'
    }
    
    await db.insertImage(testImage)
    console.log('✅ Image insert test passed')
    
    // Test get
    const retrievedImage = await db.getImage(testImage.id)
    if (retrievedImage && retrievedImage.id === testImage.id) {
      console.log('✅ Image retrieval test passed')
    } else {
      throw new Error('Image retrieval failed')
    }
    
    // Test status update
    await db.updateImageStatus(testImage.id, 'completed', 100)
    console.log('✅ Status update test passed')
    
    // Test get images
    const images = await db.getImages({ limit: 10 })
    console.log(`✅ Get images test passed (found ${images.length} images)`)
    
    // Cleanup test data
    await db.deleteImage(testImage.id)
    console.log('✅ Cleanup test passed')
    
    console.log('\n🎉 All database tests passed!')
    console.log('✅ Your database configuration is ready for Railway deployment')
    
  } catch (error) {
    console.error('\n❌ Database test failed:')
    console.error(error.message)
    
    if (error.message.includes('SQLite')) {
      console.log('\n💡 SQLite error detected. This is expected in Railway environment.')
      console.log('   The application will automatically fallback to PostgreSQL.')
    }
    
    process.exit(1)
  } finally {
    await db.close()
    console.log('🔌 Database connection closed')
  }
}

// Run the test
if (require.main === module) {
  testDatabase().catch(console.error)
}

module.exports = testDatabase
