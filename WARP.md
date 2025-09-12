# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

A comprehensive image gallery application with React frontend, Node.js backend services, and automated image processing pipeline. Built as a multi-service architecture with Docker support and local development mode.

## Core Architecture

### Service Architecture
- **Frontend** (`frontend/`): React/Vite app with ShadCN/UI components
- **Backend Uploader** (`backendUploader/`): Express.js API for image uploads and management
- **Processing Worker** (`processing-storage/`): Bull/Redis worker for image processing
- **Infrastructure**: PostgreSQL/SQLite, Redis, MinIO object storage

### Data Flow
1. **Upload Flow**: Frontend → Backend API → Database (SQLite/PostgreSQL) → Processing Queue
2. **Processing Flow**: Redis Queue → Worker → Sharp/EXIF processing → MinIO storage → Database update
3. **Retrieval Flow**: Frontend → Backend API → Database/MinIO → Signed URLs

### Database Design
- **Dual Database Support**: SQLite (local dev) or PostgreSQL (production)
- **Core Tables**: `images` (metadata), `image_status` (processing state), `image_blobs` (PostgreSQL only)
- **JSON Fields**: Responsive paths, EXIF data, metadata stored as JSON/JSONB

## Common Commands

### Local Development (Recommended)
```bash
# Install all dependencies
npm run install:all

# Start local development (SQLite, no external services required)
npm start

# Start individual services locally
npm run start:local:frontend    # Frontend only (http://localhost:3000)
npm run start:local:backend     # Backend only (http://localhost:3001)
npm run start:local:worker      # Processing worker only
```

### Docker Development
```bash
# Start all services with Docker
npm run start:docker

# Start with rebuild
npm run start:docker:dev

# Start only infrastructure services
npm run start:docker:services   # PostgreSQL, Redis, MinIO

# Stop services
npm run stop                    # Stop containers
npm run stop:all               # Stop and remove volumes
```

### Testing
```bash
# Run all tests
npm test

# Service-specific tests
npm run test:backend           # Backend API tests
npm run test:worker           # Processing worker tests
cd frontend && npm run lint   # Frontend linting
```

### Build and Production
```bash
# Build frontend for production
cd frontend && npm run build

# Build Docker images
npm run build

# View Docker logs
npm run logs                  # All services
npm run logs:backend         # Backend only
npm run logs:frontend        # Frontend only
```

## Key Development Patterns

### Image Processing Pipeline
- **ProcessImageJob**: Core Bull job type for image processing
- **Responsive Generation**: Automatic creation of 320/640/1024/2048px variants
- **Format Conversion**: WebP/AVIF with JPEG/PNG fallbacks
- **Storage Structure**: `images/{id}/raw/`, `images/{id}/responsive/`, `images/{id}/thumbnails/`

### Database Abstraction
The `Database` class in `backendUploader/src/database.js` provides unified interface:
- Handles both SQLite and PostgreSQL
- Consistent JSON field handling
- Built-in validation and error handling
- Automatic connection management

### API Pattern
- **Batch Operations**: `/api/images/bulk` for metadata updates and deletions
- **Status Tracking**: Real-time processing status via `/api/images/:id/status`
- **Signed URLs**: MinIO integration for secure file access
- **Pagination**: Built-in pagination for image listing

### Frontend Architecture
- **React Query**: Data fetching and caching with `@tanstack/react-query`
- **ShadCN/UI**: Complete component library with Tailwind CSS
- **Upload UX**: Drag-and-drop with progress tracking and error handling
- **Gallery Views**: Grid/list modes with search and filtering

## Environment Configuration

### Local Development
- Database: SQLite (no setup required)
- Queue: Optional Redis (graceful degradation)
- Storage: Local filesystem with optional MinIO
- Ports: Frontend (3000), Backend (3001), Worker health (3002)

### Docker Production
- Database: PostgreSQL with persistent volumes
- Queue: Redis with persistence
- Storage: MinIO with console access (9001)
- Networking: Internal Docker network with health checks

## File Structure Patterns

### Frontend Components (`frontend/src/`)
- `pages/`: Main application pages (Gallery, Albums, Upload)
- `components/ui/`: ShadCN/UI components
- `lib/api.ts`: API client with type definitions
- Follows React functional components with hooks pattern

### Backend Structure (`backendUploader/src/`)
- `server.js`: Express app with middleware and routes
- `database.js`: Database abstraction layer
- `routes/`: API route handlers
- Follows Express.js REST API patterns

### Worker Structure (`processing-storage/src/`)
- `worker.js`: Bull job processing with Sharp image manipulation
- MinIO client configuration and bucket management
- Health check endpoint for monitoring

## Development Guidelines

### Adding New Image Processing Features
1. Modify `PROCESSING_CONFIG` in `processing-storage/src/worker.js`
2. Update job processor logic in the `processImage` handler
3. Add new storage paths and URL generation
4. Update database schema if metadata changes are needed

### Adding New API Endpoints
1. Add routes in `backendUploader/src/server.js`
2. Update database methods in `Database` class if needed
3. Add frontend API client methods in `frontend/src/lib/api.ts`
4. Implement UI components with proper error handling

### Database Schema Changes
1. Update `createTables()` method in `Database` class
2. Handle both SQLite and PostgreSQL syntax differences
3. Add migration logic if needed for existing data
4. Update TypeScript interfaces for new fields

### Testing New Features
1. Use local development mode for quick iteration
2. Test with Docker for full integration scenarios
3. Verify both SQLite and PostgreSQL compatibility
4. Test image processing pipeline with various image formats
