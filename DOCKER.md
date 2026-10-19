# Docker Setup Guide

This guide explains how to use Docker for development and deployment of the Stellar-Veriphy application.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Docker Files Overview](#docker-files-overview)
- [Building the Image](#building-the-image)
- [Running the Container](#running-the-container)
- [Development with Docker](#development-with-docker)
- [Docker Compose](#docker-compose)
- [Environment Variables](#environment-variables)
- [Startup Diagnostics](#startup-diagnostics)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## Prerequisites

- **Docker**: Version 20.10 or higher
  - Install: [Docker Desktop](https://www.docker.com/products/docker-desktop)
  - Verify: `docker --version`

- **Docker Compose**: Version 2.0 or higher (included with Docker Desktop)
  - Verify: `docker compose version`

---

## Quick Start

### Production Build

```bash
# Build the image
docker build -t stellarveriphy:latest .

# Run the container
docker run -p 3000:3000 stellarveriphy:latest

# Access the application
open http://localhost:3000
```

### Using Docker Compose

```bash
# Start the application
docker compose up

# Start in detached mode
docker compose up -d

# View logs
docker compose logs -f

# Stop the application
docker compose down
```

### Development Mode

```bash
# Start development environment with hot reload
docker compose --profile dev up dev

# Access the development server
open http://localhost:3001
```

---

## Docker Files Overview

### `Dockerfile`

Multi-stage production Dockerfile with three stages:

**Stage 1: Contract Builder**

- Base: `rust:1.75-slim`
- Installs Rust toolchain and wasm32 target
- Builds all three Soroban contracts (oracle, provenance, registry)
- Outputs optimized WASM files

**Stage 2: Frontend Builder**

- Base: `node:20-slim`
- Installs Node.js 20 and pnpm 10.18.2
- Installs dependencies with `pnpm install`
- Builds Next.js frontend
- Copies compiled contracts from Stage 1

**Stage 3: Production Runtime**

- Base: `node:20-slim`
- Minimal production image
- Installs only production dependencies
- Runs as non-root user (`appuser`)
- Exposes port 3000
- Includes health check

### `Dockerfile.dev`

Development Dockerfile with:

- Full development environment (Git, Curl, Rust, Stellar CLI)
- All dependencies (including dev dependencies)
- Hot reload support via volume mounts
- Contract build tools available

### `.dockerignore`

Excludes unnecessary files from Docker build context:

- `node_modules/` (reinstalled in container)
- `target/` (rebuilt in container)
- `.git/` (not needed in container)
- `.env` files (set via environment variables)
- IDE configuration files
- Documentation files (except README.md)

### `docker-compose.yml`

Orchestrates multiple services:

- **app**: Production service on port 3000
- **dev**: Development service on port 3001 (with hot reload)

---

## Building the Image

### Basic Build

```bash
docker build -t stellarveriphy:latest .
```

### Build with Cache Optimization

```bash
# Build with BuildKit (faster)
DOCKER_BUILDKIT=1 docker build -t stellarveriphy:latest .
```

### Build Specific Stage

```bash
# Build only contract stage
docker build --target contract-builder -t stellarveriphy-contracts .

# Build only frontend stage
docker build --target frontend-builder -t stellarveriphy-frontend .
```

### Build with Custom Tag

```bash
# Tag with version
docker build -t stellarveriphy:1.0.0 .

# Tag for registry
docker build -t ghcr.io/your-org/stellarveriphy:latest .
```

### View Build Progress

```bash
# Build with detailed output
docker build --progress=plain -t stellarveriphy:latest .
```

---

## Running the Container

### Basic Run

```bash
docker run -p 3000:3000 stellarveriphy:latest
```

### Run in Detached Mode

```bash
docker run -d -p 3000:3000 --name stellarveriphy stellarveriphy:latest
```

### Run with Environment Variables

```bash
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_NETWORK=testnet \
  -e NEXT_PUBLIC_ORACLE_CONTRACT_ID=CXXXXXXX \
  stellarveriphy:latest
```

### Run with Environment File

```bash
# Create .env.docker file
cat > .env.docker << EOF
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_TESTNET_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_ORACLE_CONTRACT_ID=
NEXT_PUBLIC_PROVENANCE_CONTRACT_ID=
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=
EOF

# Run with env file
docker run -p 3000:3000 --env-file .env.docker stellarveriphy:latest
```

### Run with Volume Mounts

```bash
# Mount contracts directory
docker run -p 3000:3000 \
  -v $(pwd)/contracts:/app/contracts:ro \
  stellarveriphy:latest
```

### View Container Logs

```bash
# Follow logs
docker logs -f stellarveriphy

# View last 100 lines
docker logs --tail 100 stellarveriphy
```

### Execute Commands in Container

```bash
# Open shell
docker exec -it stellarveriphy sh

# Run a command
docker exec stellarveriphy ls -la /app/contracts
```

### Stop and Remove Container

```bash
# Stop
docker stop stellarveriphy

# Remove
docker rm stellarveriphy

# Stop and remove in one command
docker rm -f stellarveriphy
```

---

## Development with Docker

### Start Development Environment

```bash
docker compose --profile dev up dev
```

This starts a development container with:

- Hot reload enabled
- Source code mounted from host
- All development tools available
- Running on port 3001

### Rebuild Contracts in Dev Container

```bash
# Access the container
docker compose exec dev sh

# Build a specific contract
cd contracts/oracle
cargo build --target wasm32-unknown-unknown --release

# Build all contracts
cd /app
pnpm build:contracts
```

### Run Tests in Container

```bash
# Frontend tests
docker compose exec dev pnpm --filter frontend test

# Contract tests
docker compose exec dev sh -c "cd contracts/oracle && cargo test"
```

### Install New Dependencies

```bash
# Install in container
docker compose exec dev pnpm install <package-name>

# Rebuild image to persist
docker compose build dev
```

---

## Docker Compose

### Available Services

**Production Service (`app`)**:

```bash
docker compose up app
```

- Production-optimized build
- Port 3000
- No source code mounts
- Minimal dependencies

**Development Service (`dev`)**:

```bash
docker compose --profile dev up dev
```

- Development build
- Port 3001
- Source code mounted for hot reload
- Full development tools

### Common Commands

```bash
# Start all services
docker compose up

# Start specific service
docker compose up app

# Start in background
docker compose up -d

# View logs
docker compose logs -f app

# Stop services
docker compose down

# Stop and remove volumes
docker compose down -v

# Rebuild images
docker compose build

# Rebuild without cache
docker compose build --no-cache

# View running services
docker compose ps

# Execute command in service
docker compose exec app sh
```

### Environment Variables in Docker Compose

Override environment variables:

```bash
# Create .env file in project root
cat > .env << EOF
NEXT_PUBLIC_NETWORK=futurenet
NEXT_PUBLIC_ORACLE_CONTRACT_ID=CXXXXXXX
EOF

# Docker Compose automatically loads .env
docker compose up
```

Or use a custom env file:

```bash
docker compose --env-file .env.production up
```

---

## Environment Variables

### Required Variables

None. The application has defaults for all variables.

### Optional Variables

| Variable                             | Default                                                     | Description                 |
| ------------------------------------ | ----------------------------------------------------------- | --------------------------- |
| `NODE_ENV`                           | `production`                                                | Node environment            |
| `PORT`                               | `3000`                                                      | Application port            |
| `HOSTNAME`                           | `0.0.0.0`                                                   | Bind hostname               |
| `NEXT_PUBLIC_NETWORK`                | `testnet`                                                   | Stellar network             |
| `NEXT_PUBLIC_TESTNET_RPC_URL`        | `https://soroban-testnet.stellar.org`                       | Testnet RPC                 |
| `NEXT_PUBLIC_MAINNET_RPC_URL`        | `https://mainnet.stellar.validationcloud.io/v1/soroban/rpc` | Mainnet RPC                 |
| `NEXT_PUBLIC_FUTURENET_RPC_URL`      | `https://rpc-futurenet.stellar.org`                         | Futurenet RPC               |
| `NEXT_PUBLIC_ORACLE_CONTRACT_ID`     | -                                                           | Oracle contract address     |
| `NEXT_PUBLIC_PROVENANCE_CONTRACT_ID` | -                                                           | Provenance contract address |
| `NEXT_PUBLIC_REGISTRY_CONTRACT_ID`   | -                                                           | Registry contract address   |

### Setting Environment Variables

**Method 1: Command Line**

```bash
docker run -e NEXT_PUBLIC_NETWORK=testnet stellarveriphy:latest
```

**Method 2: Environment File**

```bash
docker run --env-file .env.docker stellarveriphy:latest
```

**Method 3: Docker Compose**

```yaml
services:
  app:
    environment:
      - NEXT_PUBLIC_NETWORK=testnet
```

**Method 4: .env File with Docker Compose**

```bash
# Create .env in project root
echo "NEXT_PUBLIC_NETWORK=testnet" > .env
docker compose up
```

---

## Startup Diagnostics

The production image starts through `docker/entrypoint.sh`. Before the app server starts, the entrypoint checks the configuration and logs what it found. Every line is prefixed with `[startup]`:

```
2026-10-19T10:00:00Z [startup] Stellar-Veriphy container starting
2026-10-19T10:00:00Z [startup] node=v20.18.0 user=appuser pid=1
2026-10-19T10:00:00Z [startup] NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
2026-10-19T10:00:00Z [startup] NEXT_PUBLIC_NETWORK=testnet
2026-10-19T10:00:00Z [startup] NEXT_PUBLIC_TESTNET_RPC_URL=https://soroban-testnet.stellar.org
2026-10-19T10:00:00Z [startup] WARN: NEXT_PUBLIC_ORACLE_CONTRACT_ID is not set
2026-10-19T10:00:00Z [startup] data dir /app/frontend/.data is writable
2026-10-19T10:00:00Z [startup] pre-flight checks passed; starting app (readiness: GET /api/health/ready)
```

A fatal problem stops the container right away with a `FATAL:` line and a `Remediation:` line. The container does not keep restarting with an unclear error.

| Condition                                                                                    | Severity | Fix                                                                      |
| -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `NEXT_PUBLIC_NETWORK` missing or not `testnet`/`mainnet`/`futurenet`                         | FATAL    | Set the variable                                                         |
| Data directory (`VERIPHY_DATA_DIR`, default `/app/frontend/.data`) not writable by `appuser` | FATAL    | Mount a volume owned by `appuser`, or point `VERIPHY_DATA_DIR` elsewhere |
| `.next` build output missing                                                                 | FATAL    | Rebuild the image with `--no-cache`                                      |
| Only the legacy `NEXT_PUBLIC_STELLAR_NETWORK` is set                                         | WARN     | Rename it to `NEXT_PUBLIC_NETWORK`                                       |
| RPC URL for the active network missing                                                       | WARN     | Set `NEXT_PUBLIC_<NETWORK>_RPC_URL`                                      |
| Contract IDs missing                                                                         | WARN     | Set `NEXT_PUBLIC_{ORACLE,PROVENANCE,REGISTRY}_CONTRACT_ID`               |

### Health endpoints

| Endpoint                      | Purpose                                                         | Status codes                          |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------- |
| `GET /api/health`             | Liveness. The process is serving requests                       | `200`                                 |
| `GET /api/health/ready`       | Readiness. Runs the checks below and returns a report           | `200` ready/degraded, `503` not ready |
| `GET /api/health/ready?rpc=0` | Readiness without the outbound RPC call (used by `HEALTHCHECK`) | same                                  |

Readiness checks:

| Check            | Critical | Fails when                                                                                            |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `network_config` | yes      | network variable missing or unsupported                                                               |
| `data_dir`       | yes      | the data directory cannot be created or written                                                       |
| `soroban_rpc`    | no       | the RPC URL is missing, unreachable within `HEALTH_RPC_TIMEOUT_MS` (default 3000), or returns non-2xx |

A failing non-critical check reports `degraded` with HTTP 200, so a slow RPC provider does not take the container out of rotation. Each failing check logs a `readiness.check_failed` JSON line with a `remediation` hint.

The Docker `HEALTHCHECK` (and both compose files) run `docker/healthcheck.mjs`. It prints the failing checks, so `docker inspect` shows why the container is unhealthy:

```bash
docker inspect --format '{{range .State.Health.Log}}{{.Output}}{{end}}' stellarveriphy-app
# not_ready HTTP 503: data_dir=fail (/app/frontend/.data is not writable: EACCES ...)
```

### Validating health locally and in staging

```bash
# Local
docker compose up -d app
scripts/check-container-health.sh stellarveriphy-app

# Staging stack (frontend waits for postgres to be healthy before starting)
docker compose -f docker-compose.staging.yml up -d
scripts/check-container-health.sh stellar-veriphy-staging-frontend 180

# Without Docker (dev server)
curl -s http://localhost:3000/api/health/ready | jq
```

`check-container-health.sh` waits for the container to report `healthy`. If it does not, it prints the last probe outputs, the full readiness report and the `[startup]` log lines, then exits non-zero, so it can also gate CI or deploy scripts.

### Diagnosing a failed start

1. `docker ps -a`: did the container exit (entrypoint FATAL) or is it running but `unhealthy`?
2. Exited: `docker logs <name> | grep '\[startup\]'`. The `FATAL`/`Remediation` lines name the cause.
3. Unhealthy: `docker inspect` health log (above), or `curl /api/health/ready` for the full report.
4. Stuck in `starting` past 40s: the server is not listening yet. Check `docker logs` for Next.js build/runtime errors.

---

## Troubleshooting

### Build Fails

**Issue**: Docker build fails during contract compilation

**Solution**:

```bash
# Clear build cache
docker builder prune -a

# Rebuild without cache
docker build --no-cache -t stellarveriphy:latest .
```

---

### Container Fails to Start

**Issue**: Container exits immediately after starting

**Diagnosis**:

```bash
# Check logs
docker logs stellarveriphy

# Check exit code
docker inspect stellarveriphy --format='{{.State.ExitCode}}'
```

**Common Causes**:

- Port 3000 already in use
- Invalid environment variables
- Missing dependencies

**Solution**:

```bash
# Use different port
docker run -p 3001:3000 stellarveriphy:latest

# Check what's using port 3000
lsof -i :3000
```

---

### Frontend Build Fails

**Issue**: Next.js build fails in Docker

**Solution**:

```bash
# Increase Docker memory limit (Docker Desktop → Settings → Resources)
# Minimum: 4GB RAM

# Or build locally first
pnpm build:frontend
docker build -t stellarveriphy:latest .
```

---

### Slow Build Times

**Issue**: Docker build takes too long

**Optimization**:

```bash
# Use BuildKit
export DOCKER_BUILDKIT=1
docker build -t stellarveriphy:latest .

# Use build cache
docker build --build-arg BUILDKIT_INLINE_CACHE=1 -t stellarveriphy:latest .
```

---

### Cannot Access Application

**Issue**: Application running but not accessible

**Diagnosis**:

```bash
# Check if container is running
docker ps

# Check port mapping
docker port stellarveriphy

# Check health
docker inspect stellarveriphy --format='{{.State.Health.Status}}'
```

**Solution**:

```bash
# Ensure correct port binding
docker run -p 3000:3000 stellarveriphy:latest

# Check firewall rules
# Access via container IP if localhost doesn't work
docker inspect stellarveriphy --format='{{.NetworkSettings.IPAddress}}'
curl http://<container-ip>:3000
```

---

### Health Check Fails

**Issue**: Container health check shows unhealthy

**Diagnosis**:

```bash
# View health check logs
docker inspect stellarveriphy --format='{{json .State.Health}}' | jq

# Check application logs
docker logs stellarveriphy
```

**Solution**:

```bash
# Disable health check temporarily
docker run -p 3000:3000 --no-healthcheck stellarveriphy:latest

# Or customize health check
docker run -p 3000:3000 \
  --health-cmd="curl -f http://localhost:3000/api/health || exit 1" \
  stellarveriphy:latest
```

---

### Volume Mount Issues (Development)

**Issue**: Changes not reflected in development container

**Solution**:

```bash
# Ensure correct volume syntax
docker compose --profile dev up dev

# Check volume mounts
docker inspect stellarveriphy-dev --format='{{json .Mounts}}' | jq

# Restart container
docker compose restart dev
```

---

## Best Practices

### Image Optimization

1. **Use Multi-stage Builds**: Separate build and runtime stages
2. **Minimize Layers**: Combine RUN commands where possible
3. **Order Dependencies**: Place less frequently changing layers first
4. **Use .dockerignore**: Exclude unnecessary files
5. **Specific Base Images**: Use `-slim` variants

### Security

1. **Non-root User**: Run as `appuser` in production
2. **Minimal Base Image**: Use `node:20-slim` instead of full image
3. **Scan for Vulnerabilities**:
   ```bash
   docker scan stellarveriphy:latest
   ```
4. **Keep Images Updated**: Regularly rebuild with latest base images
5. **Don't Store Secrets**: Use environment variables or secrets management

### Development Workflow

1. **Use Docker Compose**: Simplifies multi-container setup
2. **Mount Volumes**: Enable hot reload in development
3. **Separate Dev/Prod**: Use `Dockerfile.dev` for development
4. **Cache Dependencies**: Mount package manager cache
5. **Use Profiles**: Separate dev and prod services

### CI/CD Integration

```yaml
# Example GitHub Actions workflow
- name: Build Docker image
  run: docker build -t stellarveriphy:${{ github.sha }} .

- name: Run tests in container
  run: docker run stellarveriphy:${{ github.sha }} pnpm test

- name: Push to registry
  run: |
    docker tag stellarveriphy:${{ github.sha }} ghcr.io/org/stellarveriphy:latest
    docker push ghcr.io/org/stellarveriphy:latest
```

### Performance

1. **Use BuildKit**: Faster builds with parallel stages
2. **Layer Caching**: Order layers from least to most frequently changed
3. **Multi-platform Builds**: Build for multiple architectures
   ```bash
   docker buildx build --platform linux/amd64,linux/arm64 -t stellarveriphy:latest .
   ```

---

## Advanced Usage

### Multi-platform Build

```bash
# Create builder
docker buildx create --name multiplatform --use

# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t stellarveriphy:latest \
  --push \
  .
```

### Push to Registry

```bash
# Tag for GitHub Container Registry
docker tag stellarveriphy:latest ghcr.io/your-org/stellarveriphy:latest

# Login
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Push
docker push ghcr.io/your-org/stellarveriphy:latest
```

### Export Image

```bash
# Save to tar
docker save stellarveriphy:latest -o stellarveriphy.tar

# Load from tar
docker load -i stellarveriphy.tar
```

### Resource Limits

```bash
# Limit CPU and memory
docker run -p 3000:3000 \
  --cpus=2 \
  --memory=2g \
  stellarveriphy:latest
```

---

## Deployment

### Deploy to Production

```bash
# Build production image
docker build -t stellarveriphy:v1.0.0 .

# Run with production settings
docker run -d \
  --name stellarveriphy \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_NETWORK=mainnet \
  stellarveriphy:v1.0.0
```

### Deploy with Orchestration

**Kubernetes**:

```bash
# Create deployment
kubectl create deployment stellarveriphy --image=stellarveriphy:latest

# Expose service
kubectl expose deployment stellarveriphy --port=3000 --type=LoadBalancer
```

**Docker Swarm**:

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml stellarveriphy
```

---

## Related Documentation

- [Contributing Guide](./CONTRIBUTING.md) - Development setup
- [Deployment Guide](./DEPLOYMENT.md) - Contract deployment
- [CI Workflow](./.github/workflows/README.md) - GitHub Actions

---

**Last Updated**: June 1, 2026
