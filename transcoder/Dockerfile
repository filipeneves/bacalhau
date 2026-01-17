FROM node:20-bookworm-slim AS base

# Install FFmpeg with common codecs (CPU-only, works everywhere)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy application
COPY server.js ./

# Create HLS directory
RUN mkdir -p /tmp/hls

EXPOSE 3001

CMD ["node", "server.js"]

# ============================================================
# NVIDIA GPU variant - use this for NVENC support
# Build with: docker compose build --build-arg GPU=nvidia transcoder
# ============================================================
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04 AS nvidia

# Install Node.js and FFmpeg with NVIDIA support
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get install -y ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Note: For full NVENC support, you may need to compile FFmpeg with:
# --enable-cuda --enable-nvenc --enable-cuvid
# Or use jrottenberg/ffmpeg:nvidia or similar pre-built images

WORKDIR /app
COPY package.json ./
RUN npm install
COPY server.js ./
RUN mkdir -p /tmp/hls

EXPOSE 3001
CMD ["node", "server.js"]
