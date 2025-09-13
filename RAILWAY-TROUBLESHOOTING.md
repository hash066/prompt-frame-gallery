# Railway Deployment Troubleshooting Guide

## Common Issues and Solutions

### 1. CNI Setup Error During Build

**Problem:**
```
ERROR: failed to build: failed to solve: process "/bin/sh -c if [ -f package-lock.json ]; then npm ci --omit=dev || npm install --omit=dev; else npm install --omit=dev; fi" did not complete successfully: CNI setup error: plugin type="loopback" failed (add): interrupted system call
```

**Solution:**
This error occurs due to issues with the conditional npm install commands in the Dockerfile. We've fixed this by:

1. Simplifying the npm install commands in the Dockerfile.railway
2. Removing conditional logic that was causing the CNI setup error
3. Using direct `npm install` commands instead of conditional npm ci/install

### 2. Blank Page After Deployment

**Problem:**
After deployment, you see a blank page or the UI is not loading properly.

**Solution:**

1. **Check Health Status**: Visit `/health-check` to see the system status
2. **Verify Environment Variables**: Make sure you've set all required environment variables in Railway
3. **Check Frontend Build**: Ensure the frontend is building correctly
4. **Check Logs**: Review Railway logs for any errors

### 3. Required Environment Variables

Make sure you have set these environment variables in Railway:

```
NODE_ENV=production
DB_CLIENT=postgres
MAX_FILE_SIZE=10485760
MAX_FILES_PER_REQUEST=10
LOG_LEVEL=info
```

If using PostgreSQL (recommended):
```
DATABASE_URL=postgresql://username:password@host:port/database
```

If using Redis for queue processing:
```
REDIS_URL=redis://username:password@host:port
```

### 4. Database Connection Issues

**Problem:**
The application fails to connect to the database.

**Solution:**

1. Make sure you've added a PostgreSQL service in Railway
2. Verify the `DATABASE_URL` is correctly set
3. Set `DB_CLIENT=postgres` in your environment variables
4. Check the health endpoint for database status

### 5. Image Processing Not Working

**Problem:**
Uploaded images are not being processed or thumbnails are not generated.

**Solution:**

1. Add a Redis service in Railway for queue processing
2. Make sure `REDIS_URL` is set correctly
3. Check the worker logs for any errors
4. Visit the health check page to verify queue status

## Debugging Steps

### 1. Check System Health

Visit `/health-check` to see the status of all services. This page will show:

- Overall system status
- Database connection status
- Redis connection status
- Queue processing status
- System information

### 2. Review Railway Logs

1. Go to your Railway dashboard
2. Select your service
3. Click on the "Logs" tab
4. Look for any error messages

### 3. Verify Frontend Build

Check if the frontend is building correctly:

1. Look for any build errors in the logs
2. Verify that the `dist` directory is being created
3. Check if static files are being served correctly

### 4. Test API Endpoints

Test the API endpoints directly:

```
curl https://your-app-name.up.railway.app/api/health
```

### 5. Restart the Service

Sometimes a simple restart can fix issues:

1. Go to your Railway dashboard
2. Select your service
3. Click on the "Settings" tab
4. Click "Restart Service"

## Still Having Issues?

If you're still experiencing problems after trying these solutions:

1. Check the application logs for more detailed error messages
2. Make sure all required services (PostgreSQL, Redis) are running
3. Verify that all environment variables are set correctly
4. Try deploying with the minimal configuration first, then add more features

## Contact Support

If you need further assistance, please contact support with:

1. Your Railway project name
2. Specific error messages from the logs
3. Steps you've already taken to troubleshoot
4. Screenshots of your environment variables (with sensitive information redacted)