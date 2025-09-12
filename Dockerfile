FROM node:20-slim

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

# Copy package files and lock files
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backendUploader/package*.json ./backendUploader/
COPY processing-storage/package*.json ./processing-storage/

# Install all dependencies using workspaces
RUN npm install

# Copy source code
COPY . .

# Build frontend from root using workspace
RUN npm run build -w frontend

# Create directories
RUN mkdir -p logs uploads data

EXPOSE 3000
CMD ["node", "start-production.js"]
