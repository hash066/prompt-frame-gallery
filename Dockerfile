# Simplified single-stage build for Railway
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    vips-dev \
    python3 \
    make \
    g++ \
    sqlite \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

WORKDIR /app

# Copy all package.json files first
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backendUploader/package*.json ./backendUploader/
COPY processing-storage/package*.json ./processing-storage/

# Install root dependencies
RUN npm install --omit=dev

# Install and build frontend
WORKDIR /app/frontend
RUN npm install
COPY frontend/ .
RUN npm run build

# Install backend dependencies
WORKDIR /app/backendUploader
RUN npm install --omit=dev
COPY backendUploader/ .

# Install worker dependencies
WORKDIR /app/processing-storage
RUN npm install --omit=dev
COPY processing-storage/ .

# Back to root and copy remaining files
WORKDIR /app
COPY start-production.js ./

# Create necessary directories
RUN mkdir -p logs uploads data backendUploader/data && chown -R nodejs:nodejs /app

# Copy frontend build to expected location
RUN mkdir -p frontend/dist && cp -r frontend/dist/* frontend/dist/ 2>/dev/null || true

USER nodejs

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "start-production.js"]
