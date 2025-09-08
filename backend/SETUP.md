# Image Gallery Setup Guide

This guide will help you set up and run the complete image gallery application with all its components.

## Architecture Overview

The application consists of three main components:

1. **Frontend** - React/Next.js application with drag-and-drop upload interface
2. **Backend Uploader** - Express.js API for handling file uploads and validation
3. **Processing & Storage** - Worker-based image processing pipeline with MinIO storage

## Prerequisites

- Node.js 18+ 
- Docker and Docker Compose (for containerized setup)
- Redis (for job queue)
- MinIO (for object storage)

## Quick Start with Docker

The easiest way to get started is using Docker Compose:

```bash
# Clone the repository
git clone <repository-url>
cd image-gallery

# Start all services
docker-compose up -d

# Check service status
docker-compose ps
```

This will start:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Worker Health: http://localhost:3002/health
- MinIO Console: http://localhost:9001 (admin: minioadmin/minioadmin)
- Redis: localhost:6379

## Manual Setup

### 1. Start Infrastructure Services

```bash
# Start Redis
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Start MinIO
docker run -d --name minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

### 2. Setup Backend Uploader

```bash
cd backendUploader

# Install dependencies
npm install

# Copy environment file
cp env.example .env

# Start the server
npm run dev
```

### 3. Setup Processing Worker

```bash
cd processing-storage

# Install dependencies
npm install

# Copy environment file
cp env.example .env

# Start the worker
npm run dev
```

### 4. Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

## Environment Configuration

### Backend Uploader (.env)
```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=images
MAX_FILE_SIZE=10485760
MAX_FILES_PER_REQUEST=10
```

### Processing Worker (.env)
```env
REDIS_URL=redis://localhost:6379
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=images
WORKER_CONCURRENCY=5
SIGNED_URL_EXPIRY=3600
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_MAX_FILE_SIZE=10485760
NEXT_PUBLIC_ALLOWED_TYPES=image/jpeg,image/png,image/webp,image/avif
```

## Testing

### Run All Tests
```bash
# Frontend tests
cd frontend && npm test

# Backend tests
cd backendUploader && npm test

# Processing tests
cd processing-storage && npm test

# Integration tests
cd backendUploader && npm run test:integration
```

### Upload Integration Test
The CI pipeline includes a comprehensive upload integration test that:
1. Starts all services
2. Uploads test images
3. Verifies processing pipeline
4. Checks file storage and retrieval

## API Endpoints

### Upload API
- `POST /api/images` - Upload multiple images
- `GET /api/images` - List images with pagination/filtering
- `GET /api/images/:id` - Get image details
- `GET /api/images/:id/status` - Check processing status
- `GET /api/images/:id/url` - Get signed URL for image
- `POST /api/images/bulk` - Bulk operations (update/delete/move)

### Health Checks
- `GET /api/health` - Backend health check
- `GET /health` - Worker health check

## Features

### Upload Manager
- **Multi-file drag & drop** with FilePond integration
- **Real-time progress tracking** with cancel/retry functionality
- **File validation** (size, type, security checks)
- **Batch upload** support (up to 10 files)

### Processing Pipeline
- **Responsive image generation** (320/640/1024/2048px)
- **Thumbnail creation** (200px optimized)
- **Format conversion** (WebP/AVIF with JPEG/PNG fallbacks)
- **EXIF/IPTC metadata extraction**
- **Worker-based processing** with Redis queue

### Storage Management
- **MinIO integration** with signed URLs
- **Organized storage structure** (raw/responsive/thumbnails)
- **Secure access** with time-limited URLs
- **Scalable object storage**

### Batch Operations
- **Bulk metadata editing** (title, description, tags)
- **Album management** (move images between albums)
- **Bulk delete** with confirmation
- **Multi-select interface**

## Error Handling

### Upload Validation
- File size limits (10MB per file)
- MIME type validation
- File header verification
- Malware scanning (extensible)

### Processing Errors
- Automatic retry with exponential backoff
- Error logging and monitoring
- Graceful degradation
- Dead letter queue for failed jobs

### API Error Responses
- Consistent error format
- HTTP status codes
- Detailed error messages
- Rate limiting protection

## Monitoring

### Health Checks
- Service availability monitoring
- Queue status tracking
- Storage connectivity checks
- Processing pipeline health

### Logging
- Structured JSON logging
- Error tracking with stack traces
- Performance metrics
- Audit trails

## Production Deployment

### Docker Deployment
```bash
# Build and deploy with Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables
Ensure all production environment variables are set:
- Database connections
- Redis configuration
- MinIO credentials
- API keys and secrets
- Logging configuration

### Scaling
- **Horizontal scaling**: Multiple worker instances
- **Load balancing**: Multiple backend instances
- **Storage scaling**: MinIO cluster setup
- **Queue scaling**: Redis cluster configuration

## Troubleshooting

### Common Issues

1. **Upload fails**
   - Check file size limits
   - Verify MIME types
   - Check MinIO connectivity

2. **Processing stuck**
   - Check Redis connection
   - Verify worker status
   - Check MinIO permissions

3. **Images not displaying**
   - Verify signed URL generation
   - Check MinIO bucket configuration
   - Verify CORS settings

### Debug Commands
```bash
# Check service logs
docker-compose logs backend
docker-compose logs worker
docker-compose logs frontend

# Check Redis queue
redis-cli -h localhost -p 6379
> LLEN bull:image processing:waiting

# Check MinIO bucket
mc ls local/images/
```

## Development

### Adding New Features
1. Create feature branch
2. Implement changes
3. Add tests
4. Update documentation
5. Submit pull request

### Code Style
- ESLint configuration for frontend
- Prettier formatting
- TypeScript for type safety
- Comprehensive test coverage

## Security Considerations

- File type validation
- Size limits enforcement
- Rate limiting
- CORS configuration
- Secure headers (Helmet.js)
- Input sanitization
- Authentication/authorization (extensible)

## Performance Optimization

- Image compression and optimization
- Responsive image delivery
- CDN integration (extensible)
- Caching strategies
- Database indexing
- Queue optimization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

[Add your license information here]
