#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Image Gallery Application in Local Development Mode...\n');

// Set environment variables for local development
process.env.NODE_ENV = 'development';
process.env.DB_CLIENT = 'sqlite';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.MINIO_ENDPOINT = 'localhost';
process.env.MINIO_PORT = '9000';
process.env.MINIO_ACCESS_KEY = 'minioadmin';
process.env.MINIO_SECRET_KEY = 'minioadmin';
process.env.MINIO_BUCKET = 'images';
process.env.MINIO_USE_SSL = 'false';

console.log('📝 Local Development Configuration:');
console.log('   Database: SQLite (no external dependencies)');
console.log('   Redis: Optional (will show warnings if not available)');
console.log('   MinIO: Optional (will show warnings if not available)');
console.log('   Backend: http://localhost:3001');
console.log('   Frontend: http://localhost:3000\n');

// Start backend
console.log('🔧 Starting Backend Server...');
const backend = spawn('node', ['src/server.js'], {
  cwd: path.join(__dirname, 'backendUploader'),
  stdio: 'inherit',
  env: { ...process.env }
});

backend.on('error', (err) => {
  console.error('❌ Backend failed to start:', err.message);
  process.exit(1);
});

// Start frontend after a short delay
setTimeout(() => {
  console.log('🎨 Starting Frontend...');
  const frontend = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, 'frontend'),
    stdio: 'inherit',
    shell: true
  });

  frontend.on('error', (err) => {
    console.error('❌ Frontend failed to start:', err.message);
    process.exit(1);
  });
}, 2000);

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down services...');
  backend.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down services...');
  backend.kill();
  process.exit(0);
});
