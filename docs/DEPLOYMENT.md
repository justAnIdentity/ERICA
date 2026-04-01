# ERICA Deployment Guide

This guide covers how to build, run, and deploy ERICA (EUDI Relying Party Integration Conformance Analyzer) using Docker.

## Overview

ERICA is containerized as a single Docker service that includes:
- **Core TypeScript logic** - Validation and simulation
- **Express API** - REST endpoints for debugging
- **React Web UI** - Dashboard and debugger interface

All components run together in one container for simplicity.

## Prerequisites

- Docker 20.10+ or Docker Desktop
- Docker Compose 2.0+ (included with Docker Desktop)
- 2GB free disk space minimum
- 512MB RAM minimum (1GB recommended)

## Quick Start

### Development

1. **Clone and navigate to the project**:
   ```bash
   git clone https://github.com/yourusername/eudi-vp-debugger.git
   cd eudi-vp-debugger
   ```

2. **Create environment file** (optional - uses defaults):
   ```bash
   cp .env.example .env
   ```

3. **Start with Docker Compose**:
   ```bash
   docker-compose up
   ```

   The first build may take 2-3 minutes. You'll see:
   ```
   ✓ EUDI VP Debugger API running on http://localhost:3001
   ✓ Web UI available at http://localhost:3000
   ```

4. **Access the application**:
   - Web UI: http://localhost:3000
   - API Health: http://localhost:3001/health

5. **Stop the container**:
   ```bash
   docker-compose down
   ```

### Production

1. **Build the image**:
   ```bash
   docker build -t erica:latest .
   ```

2. **Run the container**:
   ```bash
   docker run -d \
     -p 3001:3001 \
     -p 3000:3000 \
     -e NODE_ENV=production \
     -e API_BASE_URL=https://yourdomain.com \
     --name erica \
     erica:latest
   ```

3. **Verify it's running**:
   ```bash
   docker ps | grep erica
   ```

4. **Check health**:
   ```bash
   curl http://localhost:3001/health
   # Expected: {"status":"ok"}
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

1. **Edit `.env` file**:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   nano .env
   ```

2. **Restart container**:
   ```bash
   docker-compose down
   docker-compose up
   ```

## Docker Compose Customization

### Development with Live Reload

Uncomment the volumes section in `docker-compose.yml` to enable hot-reload:

```yaml
volumes:
  - ./src:/app/src
  - ./api/src:/app/api/src
  - ./web/src:/app/web/src
```

Then rebuild while running:
```bash
docker-compose up
npm run dev:core  # In another terminal, or rebuild the container
```

### Custom Port Mapping

```bash
docker-compose -f docker-compose.yml -e PORT=8001 -e WEB_PORT=8000 up
```

Or edit `docker-compose.yml`:
```yaml
ports:
  - "8001:3001"  # Custom API port
  - "8000:3000"  # Custom web port
```

## Troubleshooting

### Container won't start

**Check logs**:
```bash
docker-compose logs erica
```

**Common issues**:
- Port already in use: `docker-compose down` any existing containers
- Out of disk space: `docker system prune`
- Build errors: Try `docker-compose up --build`

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
- In production: Use full domain `https://yourdomain.com`

### Performance is slow

- Check available memory: `docker stats`
- Allocate more memory to Docker Desktop (Settings → Resources)
- Check disk space: `docker system df`

## Deployment Platforms

### Docker Hub

1. **Build and tag**:
   ```bash
   docker build -t yourusername/erica:latest .
   ```

2. **Push**:
   ```bash
   docker login
   docker push yourusername/erica:latest
   ```

3. **Pull and run**:
   ```bash
   docker run -p 3001:3001 yourusername/erica:latest
   ```

### AWS ECS

```bash
# Create repository
aws ecr create-repository --repository-name erica --region us-east-1

# Build and tag for ECR
docker tag erica:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/erica:latest

# Push to ECR
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/erica:latest

# Create ECS task definition pointing to your ECR image
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: erica
spec:
  replicas: 1
  selector:
    matchLabels:
      app: erica
  template:
    metadata:
      labels:
        app: erica
    spec:
      containers:
      - name: erica
        image: yourusername/erica:latest
        ports:
        - containerPort: 3001
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: API_BASE_URL
          value: https://yourdomain.com
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 30
```

### Heroku

```bash
# Create app
heroku create your-app-name

# Set buildpack
heroku buildpacks:add heroku/dockerfile

# Deploy
git push heroku main
```

## Health Checks

The container includes a health check endpoint:

```bash
curl http://localhost:3001/health
# Response: {"status":"ok"}
```

This can be used by orchestration platforms (Docker, Kubernetes, etc.) to monitor and restart unhealthy containers.

## Logs

### View logs

```bash
# Follow logs in real-time
docker-compose logs -f erica

# View last 100 lines
docker-compose logs --tail=100 erica

# View logs for specific time range
docker-compose logs --since 5m erica
```

### Structured logging

Logs are formatted as JSON for easy parsing:

```bash
docker-compose logs erica | jq '.message' # Extract message field
```

## Security Considerations

- **Non-root user**: Container runs as `nodejs` user (UID 1001)
- **Health checks**: Automatically restart unhealthy containers
- **HTTPS**: In production, use a reverse proxy (nginx, CloudFlare) to enforce HTTPS
- **Request validation**: Always validate request URIs from external sources

## Cleanup

### Remove container

```bash
docker-compose down
```

### Remove image

```bash
docker rmi erica:latest
```

### Clean up all Docker resources

```bash
docker system prune -a
```

## Development

### Rebuild on source changes

```bash
docker-compose up --build
```

### Interactive debugging

```bash
# Start with bash shell
docker run -it erica:latest /bin/sh

# Or attach to running container
docker exec -it erica /bin/sh
```

### Development without Docker

For faster iteration during development, you can run locally:

```bash
# Terminal 1: Build and watch core
npm run build:core && npm run dev:core

# Terminal 2: API server
cd api && npm run dev

# Terminal 3: Web UI
cd web && npm run dev
```

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review [GitHub Issues](https://github.com/yourusername/eudi-vp-debugger/issues)
3. Check [README.md](../README.md) for general project info

