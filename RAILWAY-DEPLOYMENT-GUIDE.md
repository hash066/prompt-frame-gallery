# Railway Deployment Guide

This guide will help you deploy the Image Gallery application to Railway with the SQLite3 native binding issues fixed.

## Quick Start

### 1. Prerequisites
- Railway account (sign up at [railway.app](https://railway.app))
- GitHub repository with your code
- Cloudinary account (for image storage)

### 2. Deploy to Railway

#### Option A: Deploy from GitHub (Recommended)
1. Connect your GitHub repository to Railway
2. Railway will automatically detect the `Dockerfile.railway`
3. Add a PostgreSQL database service
4. Set up environment variables (see RAILWAY-ENVIRONMENT-VARIABLES.md)
5. Deploy!

#### Option B: Deploy with Railway CLI
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Add PostgreSQL database
railway add postgresql

# Set environment variables
railway variables set NODE_ENV=production
railway variables set DB_CLIENT=postgres
railway variables set STORAGE_TYPE=cloudinary
railway variables set CLOUDINARY_CLOUD_NAME=your-cloud-name
railway variables set CLOUDINARY_API_KEY=your-api-key
railway variables set CLOUDINARY_API_SECRET=your-api-secret

# Deploy
railway up
```

### 3. Environment Variables Setup

#### Required Variables
```bash
NODE_ENV=production
DB_CLIENT=postgres
STORAGE_TYPE=cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

#### Database
- Railway will automatically set `DATABASE_URL` when you add a PostgreSQL service
- The application will automatically use PostgreSQL in production

### 4. What's Fixed

#### SQLite3 Native Binding Issues
- ✅ Updated Dockerfile.railway to properly rebuild native modules
- ✅ Added PostgreSQL as primary database for production
- ✅ Added automatic fallback from SQLite to PostgreSQL
- ✅ Improved error handling for database initialization

#### Railway-Specific Optimizations
- ✅ Added proper build tools for native module compilation
- ✅ Configured SSL settings for PostgreSQL connections
- ✅ Added health check configuration
- ✅ Optimized Docker layers for faster builds

### 5. Monitoring Your Deployment

1. **Health Check**: Visit `https://your-app.railway.app/api/health`
2. **Logs**: Check Railway dashboard for application logs
3. **Database**: Monitor PostgreSQL service in Railway dashboard

### 6. Troubleshooting

#### Common Issues

**SQLite3 Error**: If you still see SQLite3 errors, ensure:
- `DB_CLIENT=postgres` is set
- PostgreSQL service is running
- `DATABASE_URL` is properly configured

**Build Failures**: If the build fails:
- Check that all environment variables are set
- Verify Cloudinary credentials are correct
- Check Railway logs for specific error messages

**Database Connection Issues**: If database connection fails:
- Verify PostgreSQL service is running
- Check `DATABASE_URL` format
- Ensure SSL settings are correct

### 7. Performance Tips

1. **Use PostgreSQL**: Much more reliable than SQLite for production
2. **Cloudinary**: Better performance than MinIO for image storage
3. **Environment Variables**: Set all required variables before deployment
4. **Health Checks**: Monitor application health regularly

### 8. Next Steps

After successful deployment:
1. Test image upload functionality
2. Verify database operations
3. Check image processing pipeline
4. Monitor performance and logs

## Support

If you encounter issues:
1. Check Railway logs in the dashboard
2. Verify all environment variables are set correctly
3. Ensure PostgreSQL service is running
4. Check Cloudinary configuration

The application now has robust error handling and will automatically fallback to PostgreSQL if SQLite fails, making it much more reliable for Railway deployments.
