# Image Gallery Application

A comprehensive image gallery application with robust upload UX, backend processing pipeline, and storage management.

## Architecture

### Frontend
- Multi-file drag-and-drop upload interface
- Upload progress tracking with cancel/retry functionality
- Batch operations UI for bulk metadata editing
- Responsive design with modern UX

### Backend Uploader
- RESTful API for image uploads
- Multipart batch upload support
- File validation and error handling
- Integration with processing pipeline

### Processing & Storage
- Worker-based image processing pipeline
- Responsive image generation (320/640/1024/2048px)
- Thumbnail creation
- Format conversion (WEBP/AVIF with fallbacks)
- EXIF/IPTC metadata extraction
- MinIO storage integration with signed URLs

## Project Structure

```
├── frontend/                 # React/Next.js frontend application
├── backendUploader/         # Upload API and file handling
├── processing-storage/      # Image processing workers and storage
├── shared/                  # Shared types and utilities
└── tests/                   # Integration and unit tests
```

## Features

- **Upload Manager**: Drag-and-drop interface with progress tracking
- **Processing Pipeline**: Automated image optimization and format conversion
- **Storage Management**: Secure file storage with signed URL access
- **Batch Operations**: Bulk metadata editing and file management
- **Error Handling**: Comprehensive upload validation and error recovery
- **Testing**: Full test coverage including integration tests

## Getting Started

See individual folder READMEs for setup instructions for each component.
