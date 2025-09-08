# Processing & Storage - Image Processing Pipeline

Worker-based image processing system with MinIO storage integration for the image gallery application.

## Features

- **Worker Jobs**: ProcessImageJob for automated image processing
- **Responsive Images**: Generate multiple sizes (320/640/1024/2048px)
- **Format Conversion**: WebP/AVIF with JPEG/PNG fallbacks
- **Thumbnail Generation**: Optimized thumbnails for gallery views
- **Metadata Extraction**: EXIF/IPTC data processing and storage
- **Storage Management**: MinIO integration with signed URLs

## Processing Pipeline

### ProcessImageJob
1. **Raw Storage**: Save original file to MinIO
2. **Size Generation**: Create responsive versions (320/640/1024/2048px)
3. **Thumbnail Creation**: Generate optimized thumbnails
4. **Format Conversion**: Convert to WebP/AVIF with fallbacks
5. **Metadata Extraction**: Extract and store EXIF/IPTC data
6. **Database Update**: Update processing status and file URLs

### Storage Structure
```
images/
├── raw/           # Original uploaded files
├── responsive/    # Responsive size variants
├── thumbnails/    # Gallery thumbnails
└── metadata/      # EXIF/IPTC data
```

## Worker Configuration

- **Concurrency**: Configurable worker concurrency
- **Retry Logic**: Automatic retry with exponential backoff
- **Error Handling**: Comprehensive error logging and recovery
- **Progress Tracking**: Real-time processing status updates

## Setup

```bash
cd processing-storage
npm install
npm run dev
```

## Environment Variables

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

## Testing

```bash
npm test              # Unit tests
npm run test:worker   # Worker-specific tests
```

## Monitoring

- Worker health checks
- Processing queue metrics
- Storage usage monitoring
- Error rate tracking
