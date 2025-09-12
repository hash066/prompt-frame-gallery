
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install build tools for native modules and then dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-distutils \
    make \
    g++ \
    sqlite3 \
    libvips-dev \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --omit=dev

# Rebuild native modules for the container architecture
RUN npm rebuild

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p logs uploads/temp

# Expose backend port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the server
CMD ["node", "src/server.js"]
