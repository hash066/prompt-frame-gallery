const { Pool } = require('pg');

async function createDatabase() {
  // First connect to default postgres database to create our database
  const adminPool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'ayush8811',
    database: 'postgres' // Connect to default postgres database
  });

  try {
    console.log('🔌 Connecting to PostgreSQL...');
    
    // Test connection
    await adminPool.query('SELECT 1');
    console.log('✅ Connected to PostgreSQL successfully');
    
    // Check if database exists
    const result = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = 'image_gallery'"
    );
    
    if (result.rows.length > 0) {
      console.log('✅ Database "image_gallery" already exists');
    } else {
      // Create database
      await adminPool.query('CREATE DATABASE image_gallery');
      console.log('✅ Database "image_gallery" created successfully');
    }
    
    // Close admin connection
    await adminPool.end();
    
    // Test connection to our new database
    const testPool = new Pool({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'ayush8811',
      database: 'image_gallery'
    });
    
    await testPool.query('SELECT 1');
    console.log('✅ Successfully connected to image_gallery database');
    await testPool.end();
    
    console.log('🎉 Database setup complete! You can now start your backend server.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 PostgreSQL is not running. Please start PostgreSQL first.');
    } else if (error.code === '28P01') {
      console.log('💡 Authentication failed. Please check your PostgreSQL password.');
      console.log('   Try: postgres, password, or your custom password');
    } else if (error.code === '3D000') {
      console.log('💡 Database does not exist and could not be created.');
    }
    
    process.exit(1);
  }
}

createDatabase();
