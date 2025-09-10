#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Create .env file from env.example
const envExamplePath = path.join(__dirname, 'env.example');
const envPath = path.join(__dirname, '.env');

try {
  if (fs.existsSync(envExamplePath)) {
    const envContent = fs.readFileSync(envExamplePath, 'utf8');
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Created .env file from env.example');
    console.log('📝 Please update the database credentials in .env file as needed');
    console.log('🔧 Current PostgreSQL settings:');
    console.log('   - Host: localhost');
    console.log('   - Port: 5432');
    console.log('   - User: postgres');
    console.log('   - Password: postgres');
    console.log('   - Database: image_gallery');
  } else {
    console.error('❌ env.example file not found');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error creating .env file:', error.message);
  process.exit(1);
}
