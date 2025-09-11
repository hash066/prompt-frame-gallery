# Render Deployment Guide

## Issues Fixed

The original Docker build failures were caused by:

1. **Backend Dockerfile**: Wrong port (10000 vs 3001) and incorrect server.js path
2. **Frontend Dockerfile**: Missing proper package-lock.json handling
3. **Processing Dockerfile**: Using `--only=production` which can cause issues
4. **Missing optimized Dockerfiles for Render deployment**

## Deployment Options

### Option 1: Deploy Frontend Only (Recommended for testing)

1. **In Render Dashboard:**
   - Create a new Web Service
   - Connect your GitHub repository
   - Set the following:
     - **Root Directory**: `frontend`
     - **Dockerfile Path**: `frontend/Dockerfile.render`
     - **Port**: `3000`
     - **Environment**: `Node`

2. **Environment Variables:**
   ```
   NODE_ENV=production
   NEXT_PUBLIC_API_URL=https://your-backend-url.onrender.com
   NEXT_PUBLIC_MAX_FILE_SIZE=10485760
   NEXT_PUBLIC_ALLOWED_TYPES=image/jpeg,image/png,image/webp,image/avif
   ```

### Option 2: Deploy Backend Only

1. **In Render Dashboard:**
   - Create a new Web Service
   - Connect your GitHub repository
   - Set the following:
     - **Root Directory**: `backendUploader`
     - **Dockerfile Path**: `backendUploader/Dockerfile.render`
     - **Port**: `3001`
     - **Environment**: `Node`

2. **Environment Variables:**
   ```
   NODE_ENV=production
   PORT=3001
   DB_CLIENT=sqlite
   CLOUDINARY_CLOUD_NAME=your_cloudinary_name
   CLOUDINARY_API_KEY=your_cloudinary_key
   CLOUDINARY_API_SECRET=your_cloudinary_secret
   MAX_FILE_SIZE=10485760
   MAX_FILES_PER_REQUEST=10
   ```

### Option 3: Deploy Full Stack (Advanced)

1. **Backend Service:**
   - Use `backendUploader/Dockerfile.render`
   - Port: 3001

2. **Frontend Service:**
   - Use `frontend/Dockerfile.render`
   - Port: 3000
   - Set `NEXT_PUBLIC_API_URL` to your backend URL

3. **Database:**
   - Use Render's PostgreSQL addon
   - Update environment variables accordingly

## Key Changes Made

### Backend Dockerfile (`backendUploader/Dockerfile`)
- ✅ Fixed port from 10000 to 3001
- ✅ Fixed server.js path to `src/server.js`
- ✅ Added proper directory creation
- ✅ Added health check
- ✅ Used `npm ci --only=production` for better caching

### Frontend Dockerfile (`frontend/Dockerfile`)
- ✅ Improved package-lock.json handling
- ✅ Added proper environment variables
- ✅ Better error handling

### Processing Dockerfile (`processing-storage/Dockerfile`)
- ✅ Removed `--only=production` flag that was causing issues
- ✅ Used `npm ci` for better dependency management

### New Render-Specific Dockerfiles
- ✅ `Dockerfile.render` - Full stack deployment
- ✅ `frontend/Dockerfile.render` - Frontend only
- ✅ `backendUploader/Dockerfile.render` - Backend only

## Testing Locally

Before deploying to Render, test your Docker builds locally:

```bash
# Test frontend
cd frontend
docker build -f Dockerfile.render -t frontend-test .
docker run -p 3000:3000 frontend-test

# Test backend
cd backendUploader
docker build -f Dockerfile.render -t backend-test .
docker run -p 3001:3001 backend-test
```

## Common Issues and Solutions

1. **Exit Code 127**: Usually means a command wasn't found
   - ✅ Fixed by using proper Node.js base images
   - ✅ Fixed by ensuring all dependencies are installed

2. **Build Failures**: Often due to missing dependencies
   - ✅ Fixed by using `npm ci` instead of `npm install`
   - ✅ Fixed by proper package-lock.json handling

3. **Port Issues**: Wrong port configurations
   - ✅ Fixed by aligning all port configurations

## Next Steps

1. Choose your deployment option
2. Set up your Render services
3. Configure environment variables
4. Deploy and test

The Docker build errors should now be resolved!
