# Base stage with Node.js
FROM node:20-bookworm-slim AS base

WORKDIR /app

# Install common dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# ============================================
# Development stage - Vite dev server
# ============================================
FROM base AS development

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ============================================
# Production build stage
# ============================================
FROM base AS builder

# Build-time argument for version
ARG VITE_APP_VERSION=1.0.0
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# ============================================
# Production stage - Serve static files
# ============================================
FROM nginx:alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
