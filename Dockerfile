# Use Node.js 20 Alpine image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install yt-dlp, ffmpeg y python3 (CRÍTICO para descargar videos)
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    && pip3 install --break-system-packages yt-dlp

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port (Railway usa variable PORT o 8080)
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
