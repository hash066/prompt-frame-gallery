# Backend Uploader - Image Upload API

Express.js backend service handling image uploads, validation, and processing pipeline integration.

## Features

- **Multipart Batch Upload**: Handle multiple files in single request
- **File Validation**: Size limits, MIME type checking, security validation
- **Processing Integration**: Queue jobs for image processing pipeline
- **Error Handling**: Comprehensive error responses and recovery
- **Rate Limiting**: Upload rate limiting and abuse prevention

## API Endpoints

### Upload
- `POST /api/images` - Batch image upload with multipart support
- `GET /api/images/:id/status` - Check upload/processing status

### Bulk Operations
- `POST /api/images/bulk` - Bulk metadata editing and operations
- `DELETE /api/images/bulk` - Bulk delete operations

### Management
- `GET /api/images` - List uploaded images with pagination
- `GET /api/images/:id` - Get image details and metadata

## File Validation

- **Size Limits**: Configurable per-file and total request limits
- **MIME Types**: Strict image type validation (JPEG, PNG, WebP, AVIF)
- **Security**: File header validation and malware scanning
- **Metadata**: EXIF data extraction and validation

## Processing Pipeline Integration

Uploads are queued for processing with:
- Raw file storage
- Responsive size generation (320/640/1024/2048px)
- Thumbnail creation
- Format conversion (WebP/AVIF with fallbacks)
- EXIF/IPTC metadata extraction

## Setup

```bash
cd backendUploader
npm install
npm run dev
```

## Environment Variables

```env
PORT=3001
REDIS_URL=redis://localhost:6379
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=images
MAX_FILE_SIZE=10485760
MAX_FILES_PER_REQUEST=10
```

## Testing

```bash
npm test              # Unit tests
npm run test:integration  # Integration tests with file uploads
```
