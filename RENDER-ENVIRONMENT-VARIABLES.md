# Render Environment Variables Guide

## 🚀 Complete Environment Variables for Render Deployment

### **For Backend Service (Required)**

#### **Core Server Configuration**
```
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-frontend-app.onrender.com
```

#### **Database Configuration (Choose ONE)**

**Option A: SQLite (Simplest - No external database needed)**
```
DB_CLIENT=sqlite
```

**Option B: PostgreSQL (Recommended for production)**
```
DB_CLIENT=postgres
POSTGRES_HOST=your-postgres-host.onrender.com
POSTGRES_PORT=5432
POSTGRES_USER=your-postgres-user
POSTGRES_PASSWORD=your-postgres-password
POSTGRES_DB=image_gallery
```

#### **File Upload Configuration**
```
MAX_FILE_SIZE=10485760
MAX_FILES_PER_REQUEST=10
```

#### **Cloudinary Configuration (Optional but Recommended)**
```
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

#### **Redis Configuration (Optional - for queue processing)**
```
REDIS_URL=redis://your-redis-host:6379
```

#### **MinIO Configuration (Optional - for object storage)**
```
MINIO_ENDPOINT=your-minio-host
MINIO_PORT=9000
MINIO_ACCESS_KEY=your-minio-access-key
MINIO_SECRET_KEY=your-minio-secret-key
MINIO_BUCKET=images
MINIO_USE_SSL=true
```

#### **Logging Configuration**
```
LOG_LEVEL=info
```

---

### **For Frontend Service (Required)**

```
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://your-backend-app.onrender.com
NEXT_PUBLIC_MAX_FILE_SIZE=10485760
NEXT_PUBLIC_ALLOWED_TYPES=image/jpeg,image/png,image/webp,image/avif
```

---

## 🔧 How to Get These Values

### **1. Cloudinary Setup (Recommended for Image Storage)**

1. Go to [cloudinary.com](https://cloudinary.com)
2. Sign up for a free account
3. Go to Dashboard → Account Details
4. Copy these values:
   - **Cloud Name**: Found in "Account Details"
   - **API Key**: Found in "Account Details" 
   - **API Secret**: Found in "Account Details"

**Example Cloudinary Values:**
```
CLOUDINARY_CLOUD_NAME=my-gallery-app
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcdefghijklmnopqrstuvwxyz123456
```

### **2. PostgreSQL Database (Optional)**

If you want to use PostgreSQL instead of SQLite:

1. In Render Dashboard → Create → PostgreSQL
2. Copy the connection details:
   - **Host**: `dpg-xxxxx-a.oregon-postgres.render.com`
   - **Port**: `5432`
   - **User**: `your_username`
   - **Password**: `your_password`
   - **Database**: `your_database_name`

### **3. Redis (Optional - for background processing)**

1. In Render Dashboard → Create → Redis
2. Copy the Redis URL: `redis://red-xxxxx:6379`

---

## 🎯 **MINIMAL SETUP (Recommended for Testing)**

### **Backend Environment Variables (Minimum Required)**
```
NODE_ENV=production
PORT=3001
DB_CLIENT=sqlite
MAX_FILE_SIZE=10485760
MAX_FILES_PER_REQUEST=10
LOG_LEVEL=info
```

### **Frontend Environment Variables (Minimum Required)**
```
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://your-backend-app.onrender.com
NEXT_PUBLIC_MAX_FILE_SIZE=10485760
NEXT_PUBLIC_ALLOWED_TYPES=image/jpeg,image/png,image/webp,image/avif
```

---

## 🚀 **RECOMMENDED SETUP (For Production)**

### **Backend Environment Variables (Recommended)**
```
NODE_ENV=production
PORT=3001
DB_CLIENT=postgres
POSTGRES_HOST=your-postgres-host.onrender.com
POSTGRES_PORT=5432
POSTGRES_USER=your-postgres-user
POSTGRES_PASSWORD=your-postgres-password
POSTGRES_DB=image_gallery
MAX_FILE_SIZE=10485760
MAX_FILES_PER_REQUEST=10
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
LOG_LEVEL=info
```

### **Frontend Environment Variables (Recommended)**
```
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://your-backend-app.onrender.com
NEXT_PUBLIC_MAX_FILE_SIZE=10485760
NEXT_PUBLIC_ALLOWED_TYPES=image/jpeg,image/png,image/webp,image/avif
```

---

## 📝 **Step-by-Step Setup Instructions**

### **Step 1: Create Backend Service**
1. Go to Render Dashboard
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Set:
   - **Name**: `your-app-backend`
   - **Root Directory**: `backendUploader`
   - **Dockerfile Path**: `backendUploader/Dockerfile.render`
   - **Port**: `3001`
5. Add environment variables (use MINIMAL SETUP above)
6. Deploy

### **Step 2: Create Frontend Service**
1. Go to Render Dashboard
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Set:
   - **Name**: `your-app-frontend`
   - **Root Directory**: `frontend`
   - **Dockerfile Path**: `frontend/Dockerfile.render`
   - **Port**: `3000`
5. Add environment variables (use MINIMAL SETUP above)
6. Update `NEXT_PUBLIC_API_URL` with your backend URL
7. Deploy

### **Step 3: Test Your Deployment**
1. Visit your frontend URL
2. Try uploading an image
3. Check backend logs for any errors

---

## ⚠️ **Important Notes**

1. **Replace URLs**: Update `your-backend-app.onrender.com` and `your-frontend-app.onrender.com` with your actual Render URLs
2. **Cloudinary is Optional**: The app works without Cloudinary, but it's recommended for production
3. **Database**: SQLite works fine for testing, PostgreSQL is better for production
4. **Redis**: Only needed if you want background image processing
5. **MinIO**: Only needed if you want object storage (Cloudinary is easier)

---

## 🔍 **Troubleshooting**

If you get errors:
1. Check Render logs for specific error messages
2. Ensure all environment variables are set correctly
3. Make sure your backend URL is accessible
4. Verify Cloudinary credentials if using image upload

Your app should now deploy successfully on Render! 🎉


