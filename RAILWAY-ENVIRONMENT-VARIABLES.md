# Railway Environment Variables

This document outlines the environment variables needed for deploying the Image Gallery application on Railway.

## Required Environment Variables

### Database Configuration
- `DATABASE_URL` - PostgreSQL connection string (Railway will provide this automatically when you add a PostgreSQL service)
- `DB_CLIENT` - Set to `postgres` to use PostgreSQL (recommended for Railway)

### Application Configuration
- `NODE_ENV` - Set to `production` for Railway deployments
- `PORT` - Railway will set this automatically (usually 3000)

### Storage Configuration (Choose one)

#### Option 1: Cloudinary (Recommended for Railway)
- `CLOUDINARY_CLOUD_NAME` - Your Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Your Cloudinary API key
- `CLOUDINARY_API_SECRET` - Your Cloudinary API secret
- `STORAGE_TYPE` - Set to `cloudinary`

#### Option 2: MinIO (If you want to use MinIO)
- `MINIO_ENDPOINT` - MinIO server endpoint
- `MINIO_PORT` - MinIO server port
- `MINIO_ACCESS_KEY` - MinIO access key
- `MINIO_SECRET_KEY` - MinIO secret key
- `MINIO_BUCKET_NAME` - MinIO bucket name
- `STORAGE_TYPE` - Set to `minio`

### Redis Configuration (Optional - for background processing)
- `REDIS_URL` - Redis connection string (Railway will provide this if you add a Redis service)

## Setting Up Environment Variables in Railway

1. Go to your Railway project dashboard
2. Select your service
3. Go to the "Variables" tab
4. Add the required environment variables listed above

## Database Setup

### Option 1: Use Railway's PostgreSQL (Recommended)
1. In your Railway project, click "New Service"
2. Select "Database" → "PostgreSQL"
3. Railway will automatically set the `DATABASE_URL` environment variable
4. Set `DB_CLIENT=postgres` in your main service

### Option 2: Use SQLite (Not recommended for production)
- Set `DB_CLIENT=sqlite`
- Note: This may cause issues with native bindings in Railway's environment

## Storage Setup

### Cloudinary Setup (Recommended)
1. Sign up at [Cloudinary](https://cloudinary.com)
2. Get your cloud name, API key, and API secret from the dashboard
3. Set the Cloudinary environment variables in Railway

### MinIO Setup (Alternative)
1. Deploy MinIO as a separate service in Railway
2. Set the MinIO environment variables

## Example Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database
DB_CLIENT=postgres

# Application
NODE_ENV=production
PORT=3000

# Storage (Cloudinary)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
STORAGE_TYPE=cloudinary

# Optional: Redis
REDIS_URL=redis://user:password@host:port
```

## Troubleshooting

### SQLite Native Binding Errors
If you see errors like "invalid ELF header" with SQLite, this is because the native bindings were compiled for a different architecture. The application now automatically falls back to PostgreSQL in production environments.

### Database Connection Issues
1. Ensure `DATABASE_URL` is properly set
2. Check that the PostgreSQL service is running
3. Verify SSL settings are correct for Railway's environment

### Storage Issues
1. Verify your Cloudinary credentials are correct
2. Check that the storage type is set correctly
3. Ensure your Cloudinary account has sufficient quota
