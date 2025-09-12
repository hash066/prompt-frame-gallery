#!/usr/bin/env node

const express = require('express');
const path = require('path');
const { spawn } = require('child_process');

console.log('🚀 Starting Image Gallery Application on Railway...\n');

// Set environment variables for production
process.env.NODE_ENV = 'production';
process.env.DB_CLIENT = process.env.DB_CLIENT || 'sqlite';

// Use Railway's PORT environment variable
const PORT = process.env.PORT || 3000;

// PostgreSQL configuration (if using PostgreSQL)
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  process.env.POSTGRES_HOST = url.hostname;
  process.env.POSTGRES_PORT = url.port || '5432';
  process.env.POSTGRES_USER = url.username;
  process.env.POSTGRES_PASSWORD = url.password;
  process.env.POSTGRES_DB = url.pathname.slice(1);
  process.env.DB_CLIENT = 'postgres';
}

// Redis configuration (if using Redis)
if (process.env.REDIS_URL) {
  console.log('✅ Redis URL detected - Queue processing enabled');
} else {
  console.log('⚠️  No Redis URL - Queue processing disabled');
}

// MinIO configuration (if using MinIO)
if (process.env.MINIO_ENDPOINT) {
  console.log('✅ MinIO endpoint detected - Object storage enabled');
} else {
  console.log('ℹ️  No MinIO - Using local file storage');
}

console.log('📝 Production Configuration:');
console.log(`   Database: ${process.env.DB_CLIENT.toUpperCase()}`);
console.log(`   Redis: ${process.env.REDIS_URL ? 'Connected' : 'Disabled'}`);
console.log(`   Storage: ${process.env.MINIO_ENDPOINT ? 'MinIO' : 'Local'}`);
console.log(`   Port: ${PORT}`);
console.log(`   Frontend: Serving static files from built React app\n`);

// Create main Express app to serve frontend and proxy API
const app = express();

// Serve static frontend files
const frontendPath = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(frontendPath));

// Start backend process
console.log('🔧 Starting Backend Server...');
const backendEnv = {
  ...process.env,
  PORT: PORT + 1, // Backend runs on PORT + 1
  FRONTEND_STATIC_PATH: frontendPath
};

const backend = spawn('node', ['backendUploader/src/server.js'], {
  stdio: 'inherit',
  env: backendEnv
});

backend.on('error', (err) => {
  console.error('❌ Backend failed to start:', err.message);
  process.exit(1);
});

// Add http-proxy-middleware dependency check
let proxyMiddleware;
try {
  proxyMiddleware = require('http-proxy-middleware');
} catch (err) {
  console.log('📦 Installing http-proxy-middleware...');
  // For Railway, we'll do a simple proxy instead
  proxyMiddleware = null;
}

// Simple API proxy (if http-proxy-middleware isn't available)
if (!proxyMiddleware) {
  app.use('/api', (req, res) => {
    const http = require('http');
    const options = {
      hostname: 'localhost',
      port: PORT + 1,
      path: req.originalUrl,
      method: req.method,
      headers: req.headers
    };
    
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err);
      res.status(500).json({ error: 'Backend unavailable' });
    });
    
    req.pipe(proxyReq);
  });
} else {
  // Use proper proxy middleware if available
  const { createProxyMiddleware } = proxyMiddleware;
  app.use('/api', createProxyMiddleware({
    target: `http://localhost:${PORT + 1}`,
    changeOrigin: true
  }));
}

// Serve React app for all other routes (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start the main Express server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`✅ API backend running on http://localhost:${PORT + 1}`);
  console.log(`✅ Frontend served from: ${frontendPath}`);
});

// Start processing worker if Redis is available
if (process.env.REDIS_URL) {
  setTimeout(() => {
    console.log('⚙️ Starting Processing Worker...');
    const worker = spawn('node', ['processing-storage/src/worker.js'], {
      stdio: 'inherit',
      env: { ...process.env }
    });

    worker.on('error', (err) => {
      console.error('❌ Worker failed to start:', err.message);
      // Don't exit on worker failure, just log it
    });
  }, 3000);
}

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  server.close(() => {
    console.log('✅ Express server closed');
    
    try {
      backend.kill();
    } catch (err) {
      console.error('Error killing backend process:', err.message);
    }
    
    setTimeout(() => process.exit(0), 5000);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('✨ Image Gallery Application started successfully on Railway!');
