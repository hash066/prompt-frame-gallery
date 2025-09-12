FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libvips-dev \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Environment variables
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backendUploader/package*.json ./backendUploader/
COPY processing-storage/package*.json ./processing-storage/

# Install all dependencies using workspaces
RUN npm install

# Copy source code
COPY . .

# Build frontend from the frontend directory
WORKDIR /app/frontend
RUN npm run build

# Go back to root
WORKDIR /app

# Create directories
RUN mkdir -p logs uploads data

EXPOSE 3000
CMD ["node", "start-production.js"]
