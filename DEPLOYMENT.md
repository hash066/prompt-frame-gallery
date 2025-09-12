# Image Gallery - Production Deployment Guide

This guide will walk you through deploying the Image Gallery application in production.

## 📋 Prerequisites

Before deploying, ensure you have:

- **Docker & Docker Compose** installed on your production server
- **Domain name** pointing to your server
- **SSL certificates** (recommended: Let's Encrypt)
- **Redis server** or Redis cloud service
- **MinIO server** or S3-compatible storage
- **Server with adequate resources**: 
  - Minimum: 2 CPU cores, 4GB RAM, 20GB storage
  - Recommended: 4 CPU cores, 8GB RAM, 50GB storage

## 🚀 Quick Deployment Steps

### 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/hash066/prompt-frame-gallery
cd prompt-frame-gallery

# Copy environment template
cp .env.production .env

# Edit environment variables
nano .env  # or use your preferred editor
```

### 2. Configure Environment Variables

Edit `.env` file with your production values. **Critical variables to change:**

```bash
# Security - CHANGE ALL DEFAULT PASSWORDS
REDIS_PASSWORD=your_secure_redis_password_here
MINIO_ACCESS_KEY=your_minio_access_key_here
MINIO_SECRET_KEY=your_minio_secret_key_here
GRAFANA_PASSWORD=your_secure_grafana_password

# Domains - Replace with your actual domain
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
FRONTEND_URL=https://yourdomain.com

# Storage - Configure your MinIO/S3 endpoint
MINIO_ENDPOINT=your-minio-server.com
MINIO_USE_SSL=true
```

### 3. SSL Setup (Highly Recommended)

```bash
# Create SSL directory
mkdir -p ssl

# Option A: Let's Encrypt (Recommended)
# Install certbot and get certificates
sudo apt install certbot
sudo certbot certonly --standalone -d yourdomain.com

# Copy certificates to ssl directory
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/key.pem

# Option B: Upload your own certificates
# Copy your SSL certificate to ssl/cert.pem
# Copy your SSL private key to ssl/key.pem
```

### 4. Configure Nginx for HTTPS

Edit `nginx.conf` to enable HTTPS:

```bash
# Uncomment the HTTPS server block (lines 92-103)
# Update server_name with your actual domain
sed -i 's/server_name localhost;/server_name yourdomain.com;/g' nginx.conf
```

### 5. Deploy with Docker

```bash
# Start production deployment
docker-compose -f docker-compose.prod.yml up -d

# Check all services are running
docker-compose -f docker-compose.prod.yml ps

# View logs if needed
docker-compose -f docker-compose.prod.yml logs -f
```

### 6. Verify Deployment

```bash
# Check application health
curl -k https://yourdomain.com/api/health

# Check all services
curl -k https://yourdomain.com/health  # Worker health
```

## 🔧 Deployment Options

### Option 1: Full Docker Deployment (Recommended)

Uses `docker-compose.prod.yml` with all services including PostgreSQL, Redis, MinIO, and monitoring.

```bash
docker-compose -f docker-compose.prod.yml up -d
```

**Services included:**
- Frontend (Next.js)
- Backend API
- Image Processing Worker
- PostgreSQL Database
- Redis Queue
- MinIO Object Storage  
- Nginx Reverse Proxy
- Prometheus Monitoring
- Grafana Dashboard

### Option 2: External Services Deployment

Use external Redis, database, and storage services for better scalability.

```bash
# Configure .env with external service URLs
REDIS_URL=redis://:password@your-redis-service.com:6379
DB_CLIENT=postgres
POSTGRES_HOST=your-postgres-server.com
MINIO_ENDPOINT=your-s3-compatible-storage.com

# Deploy only application services
docker-compose -f docker-compose.yml up -d frontend backend worker nginx
```

### Option 3: Cloud Platform Deployment

#### AWS/Azure/GCP with Container Services

1. **Push images to container registry:**
```bash
# Build and tag images
docker build -t your-registry/image-gallery-frontend:latest ./frontend
docker build -t your-registry/image-gallery-backend:latest ./backendUploader
docker build -t your-registry/image-gallery-worker:latest ./processing-storage

# Push to registry
docker push your-registry/image-gallery-frontend:latest
docker push your-registry/image-gallery-backend:latest
docker push your-registry/image-gallery-worker:latest
```

2. **Use managed services:**
   - **Database**: AWS RDS, Azure Database, Google Cloud SQL
   - **Redis**: AWS ElastiCache, Azure Redis, Google Memorystore
   - **Storage**: AWS S3, Azure Blob Storage, Google Cloud Storage
   - **Container**: AWS ECS, Azure Container Instances, Google Cloud Run

## 🔒 Security Configuration

### Firewall Setup

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Allow SSH (be careful!)
sudo ufw allow 22

# Enable firewall
sudo ufw enable
```

### Environment Security

```bash
# Secure the .env file
chmod 600 .env
sudo chown root:root .env
```

### SSL Certificate Auto-Renewal

```bash
# Add to crontab for Let's Encrypt renewal
sudo crontab -e
# Add this line:
0 12 * * * /usr/bin/certbot renew --quiet --post-hook "docker-compose -f /path/to/your/project/docker-compose.prod.yml restart nginx"
```

## 📊 Monitoring Setup

Access monitoring dashboards:
- **Prometheus**: https://yourdomain.com:9090
- **Grafana**: https://yourdomain.com:3003 (admin/your_grafana_password)

### Basic Alerts Setup

Configure Grafana alerts for:
- High CPU usage (>80%)
- High memory usage (>90%)
- Queue processing failures
- Storage capacity warnings

## 🔄 Backup Strategy

### Database Backup (if using PostgreSQL)

```bash
# Create backup script
cat > backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/db"
mkdir -p $BACKUP_DIR
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U image_user image_gallery > "$BACKUP_DIR/backup-$(date +%Y%m%d_%H%M%S).sql"
# Keep only last 7 days
find $BACKUP_DIR -name "backup-*.sql" -mtime +7 -delete
EOF

chmod +x backup-db.sh

# Add to crontab (daily at 2 AM)
sudo crontab -e
0 2 * * * /path/to/your/backup-db.sh
```

### MinIO/Storage Backup

```bash
# Configure MinIO backup to secondary storage
# Or use cloud provider backup services
```

## 🚨 Troubleshooting

### Common Issues

1. **Services won't start:**
   ```bash
   # Check logs
   docker-compose -f docker-compose.prod.yml logs -f service_name
   
   # Check resource usage
   docker stats
   ```

2. **SSL certificate issues:**
   ```bash
   # Test certificate
   openssl x509 -in ssl/cert.pem -text -noout
   
   # Check nginx configuration
   docker-compose -f docker-compose.prod.yml exec nginx nginx -t
   ```

3. **Database connection issues:**
   ```bash
   # Test database connection
   docker-compose -f docker-compose.prod.yml exec backend node -e "console.log('DB test')"
   ```

4. **MinIO connection issues:**
   ```bash
   # Check MinIO connectivity
   curl -k https://your-minio-endpoint.com/minio/health/live
   ```

### Health Check Endpoints

- **Application Health**: `https://yourdomain.com/api/health`
- **Worker Health**: `https://yourdomain.com/health`
- **Queue Status**: `https://yourdomain.com/api/queue/status`

## 📝 Maintenance Tasks

### Regular Updates

```bash
# Update application
git pull origin main
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# Update Docker images
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

### Log Management

```bash
# Rotate logs
docker system prune -f
docker-compose -f docker-compose.prod.yml logs --tail=1000 > logs/app-$(date +%Y%m%d).log
```

## 📞 Support

If you encounter issues during deployment:

1. Check the logs: `docker-compose -f docker-compose.prod.yml logs -f`
2. Verify environment variables are correctly set
3. Ensure all external services (Redis, MinIO) are accessible
4. Check firewall and network configuration
5. Verify SSL certificates are valid and properly configured

## 🎯 Performance Optimization

### Production Optimizations

```bash
# In .env file, optimize for production:
WORKER_CONCURRENCY=8  # Adjust based on CPU cores
LOG_LEVEL=warn  # Reduce log verbosity
NODE_ENV=production  # Enable production optimizations
```

### Resource Limits

Configure Docker resource limits in `docker-compose.prod.yml` based on your server capacity.

### CDN Setup

Consider using a CDN (CloudFlare, AWS CloudFront) for serving processed images and static assets.
