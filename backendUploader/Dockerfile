FROM node:18

WORKDIR /app

COPY package*.json ./

# Use npm install as requested (not npm ci)
RUN npm install

COPY . .

# Backend only; no build step required
# RUN npm run build

# Expose backend port
EXPOSE 3001

CMD ["node", "src/server.js"]
