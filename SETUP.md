# Image Gallery Setup Guide

## Quick Start (Local Development - Recommended)

This is the easiest way to get started without Docker:

```bash
# 1. Install dependencies
npm run install:all

# 2. Start the application
npm start
```

The application will run with:
- **Backend**: http://localhost:3001
- **Frontend**: http://localhost:3000
- **Database**: SQLite (no external dependencies)
- **Queue**: Disabled (Redis not required)
- **Storage**: Local file system

## Docker Setup (Full Production Environment)

### Prerequisites
1. **Install Docker Desktop**: Download from https://www.docker.com/products/docker-desktop/
2. **Start Docker Desktop**: Make sure it's running before proceeding

### Start with Docker
```bash
# Start all services with Docker
npm run start:docker

# Or start with rebuild
npm run start:docker:dev
```

### Docker Services
- **PostgreSQL**: Database (port 5432)
- **Redis**: Queue processing (port 6379)
- **MinIO**: Object storage (ports 9000, 9001)
- **Backend**: API server (port 3001)
- **Worker**: Image processing (port 3002)
- **Frontend**: React app (port 3000)

## Troubleshooting

### Docker Connection Errors
If you see errors like:
```
error during connect: Get "http://%2F%2F_%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/containers/...
```

**Solution**: Start Docker Desktop
1. Open Docker Desktop application
2. Wait for it to fully start (green status)
3. Run `npm run start:docker`

### Redis Connection Errors
If you see Redis connection errors in local mode:
- These are expected and harmless
- The app works without Redis in local mode
- Queue processing is disabled automatically

### Port Already in Use
If you get port conflicts:
```bash
# Kill processes on specific ports
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

## Available Commands

### Local Development
- `npm start` - Start local development mode
- `npm run start:local` - Same as above
- `npm run start:local:frontend` - Start only frontend
- `npm run start:local:backend` - Start only backend

### Docker Development
- `npm run start:docker` - Start with Docker Compose
- `npm run start:docker:dev` - Start with rebuild
- `npm run start:docker:services` - Start only infrastructure (DB, Redis, MinIO)
- `npm run stop` - Stop Docker services
- `npm run stop:all` - Stop and remove Docker volumes

### Utilities
- `npm run build` - Build frontend for production
- `npm run logs` - View Docker logs
- `npm run logs:backend` - View backend logs
- `npm run logs:frontend` - View frontend logs

## Environment Variables

### Local Development
The app uses sensible defaults for local development:
- Database: SQLite (no setup required)
- Redis: Optional (disabled if not available)
- MinIO: Optional (disabled if not available)

### Docker Production
All services are configured via Docker Compose with proper networking.

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/images` - List images
- `POST /api/images` - Upload images
- `GET /api/images/:id` - Get image details
- `GET /api/queue/status` - Queue status (Docker only)

## Support

If you encounter issues:
1. Try local development mode first: `npm start`
2. Check Docker Desktop is running for Docker mode
3. Check port availability (3000, 3001, 5432, 6379, 9000, 9001)
4. Review logs for specific error messages