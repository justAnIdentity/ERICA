# Multi-stage build for ERICA (EUDI Relying Party Integration Conformance Analyzer)
# Stage 1: Build core & API
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files for all workspaces
COPY package.json package-lock.json ./
COPY api/package.json api/package-lock.json ./api/
COPY web/package.json web/package-lock.json ./web/
COPY tsconfig.json ./

# Install dependencies for all workspaces
RUN npm ci && cd api && npm ci && cd .. && cd web && npm ci && cd ..

# Copy source code
COPY src/ ./src/
COPY api/src/ ./api/src/
COPY web/src/ ./web/src/
COPY api/tsconfig.json ./api/
COPY web/tsconfig.json ./web/
COPY web/index.html ./web/
COPY web/vite.config.ts ./web/
COPY web/postcss.config.js ./web/
COPY web/tailwind.config.js ./web/
COPY web/tsconfig.node.json ./web/

# Build core TypeScript
RUN npm run build:core

# Build API
RUN npm run build:api

# Build web frontend
RUN npm run build:web

# Stage 2: Runtime
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built artifacts from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/api/dist ./api/dist
COPY --from=builder --chown=nodejs:nodejs /app/web/dist ./web/dist

# Copy package files (for runtime dependencies)
COPY --chown=nodejs:nodejs package.json package-lock.json ./
COPY --chown=nodejs:nodejs api/package.json api/package-lock.json ./api/
COPY --chown=nodejs:nodejs web/package.json web/package-lock.json ./web/

# Install production dependencies only
RUN npm ci --omit=dev && \
    cd api && npm ci --omit=dev && cd .. && \
    cd web && npm ci --omit=dev && cd ..

# Copy web dist to API public folder for serving
RUN mkdir -p api/dist/public && \
    cp -r web/dist/* api/dist/public/

# Switch to non-root user
USER nodejs

# Expose ports
# 3001 = API server + Web frontend (SPA)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start API server
CMD ["node", "api/dist/server.js"]
