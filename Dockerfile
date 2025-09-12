# Multi-stage build optimized for Railway
FROM node:18-alpine as base

# Install system dependencies
RUN apk add --no-cache \
    vips-dev \
    python3 \
    make \
    g++ \
    sqlite

WORKDIR /app

# Copy root package files first
COPY package*.json ./
RUN npm ci --only=production

# Build frontend
FROM base as frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Build backend
FROM base as backend-builder
WORKDIR /app/backend
COPY backendUploader/package*.json ./
RUN npm ci --only=production
COPY backendUploader/ ./

# Build worker
FROM base as worker-builder
WORKDIR /app/worker
COPY processing-storage/package*.json ./
RUN npm ci --only=production
COPY processing-storage/ ./

# Final production image
FROM node:18-alpine as production

# Install runtime dependencies
RUN apk add --no-cache \
    vips-dev \
    sqlite \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

WORKDIR /app

# Copy built applications
COPY --from=backend-builder --chown=nodejs:nodejs /app/backend ./backend
COPY --from=frontend-builder --chown=nodejs:nodejs /app/frontend/dist ./frontend/dist
COPY --from=worker-builder --chown=nodejs:nodejs /app/worker ./worker

# Copy root files
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs start-production.js ./

# Create necessary directories
RUN mkdir -p logs uploads data backend/data && chown -R nodejs:nodejs /app

USER nodejs

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "start-production.js"]
