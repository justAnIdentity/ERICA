# ERICA Deployment Guide

This guide covers how to build and run ERICA (EUDI Relying Party Integration Compliance Analyzer) using Docker.

## Overview

ERICA is containerized as a single Docker service that includes:
- Core TypeScript logic (validation and simulation)
- Express API (REST endpoints)
- React Web UI (dashboard interface)

All components run together in one container.

## Prerequisites

- Docker 20.10+ or Docker Desktop
- Docker Compose 2.0+ (included with Docker Desktop)
- 2GB free disk space
- 512MB RAM minimum (1GB recommended)

## Quick Start

### Using Docker Compose

1. Clone and navigate to the project:
   ```bash
   git clone https://github.com/yourusername/eudi-vp-debugger.git
   cd eudi-vp-debugger
   ```

2. Create environment file (optional):
   ```bash
   cp .env.example .env
   ```

3. Start with Docker Compose:
   ```bash
   docker-compose up
   ```

   First build takes 2-3 minutes. You'll see:
   ```
   EUDI VP Debugger API running on http://localhost:3001
   Web UI available at http://localhost:3000
   ```

4. Access the application:
   - Web UI: http://localhost:3000
   - API Health: http://localhost:3001/health

5. Stop the container:
   ```bash
   docker-compose down
   ```

### Using Docker directly

```bash
# Build
docker build -t erica:latest .

# Run
docker run -d \
  -p 3001:3001 \
  -p 3000:3000 \
  --name erica \
  erica:latest

# Verify
docker ps | grep erica
curl http://localhost:3001/health
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` for optimized builds |
| `LOG_LEVEL` | `info` | Logging level: debug, info, warn, error |
| `PORT` | `3001` | API server port |
| `WEB_PORT` | `3000` | Web frontend port |
| `API_BASE_URL` | `http://localhost:3001` | Base URL for API calls from frontend |

### Custom Configuration

1. Edit `.env` file:
   ```bash
   cp .env.example .env
   nano .env
   ```

2. Restart container:
   ```bash
   docker-compose down
   docker-compose up
   ```

## Development Setup

### With Docker (recommended)

```bash
docker-compose up
```

For hot-reload, uncomment volumes in `docker-compose.yml`:

```yaml
volumes:
  - ./src:/app/src
  - ./api/src:/app/api/src
  - ./web/src:/app/web/src
```

### Without Docker (faster iteration)

```bash
# Terminal 1: Build and watch core
npm run build:core && npm run dev:core

# Terminal 2: API server
cd api && npm run dev

# Terminal 3: Web UI
cd web && npm run dev
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker-compose logs erica
```

Common issues:
- Port already in use: `docker-compose down`
- Out of disk space: `docker system prune`
- Build errors: `docker-compose up --build`

### API not responding

```bash
# Check if container is running
docker ps | grep erica

# Check health endpoint
curl http://localhost:3001/health

# View logs
docker-compose logs -f erica
```

### Web UI shows "Cannot reach API"

- Check `API_BASE_URL` in `.env` matches your deployment
- In development: Use `http://localhost:3001` (not `127.0.0.1`)
- Check API is running on expected port

### Performance is slow

- Check available memory: `docker stats`
- Allocate more memory to Docker Desktop (Settings → Resources)
- Check disk space: `docker system df`

## Health Checks

The container includes a health check endpoint:

```bash
curl http://localhost:3001/health
# Response: {"status":"ok"}
```

## Logs

```bash
# Follow logs in real-time
docker-compose logs -f erica

# View last 100 lines
docker-compose logs --tail=100 erica

# View logs for specific time range
docker-compose logs --since 5m erica
```

## Cleanup

```bash
# Remove container
docker-compose down

# Remove image
docker rmi erica:latest

# Clean up all Docker resources
docker system prune -a
```

## Security Notes

- Container runs as non-root user (nodejs, UID 1001)
- All certificates and keys are test-only and publicly committed
- Never use this tool with real personal data
- This is a development/testing tool, not for production use
