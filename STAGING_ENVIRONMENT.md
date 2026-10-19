# Staging Environment Setup Guide

This document describes the staging environment for Stellar-Veriphy, which is used for testing before production deployment.

## Overview

The staging environment mirrors the production setup with:

- Separate PostgreSQL database
- Redis cache for session management
- Test smart contracts on Stellar testnet
- Automated deployments from main branch
- Full E2E testing pipeline
- Security scanning

## Environment Details

| Component  | Environment     | Details                           |
| ---------- | --------------- | --------------------------------- |
| Frontend   | Staging         | `https://staging.example.com`     |
| API        | Staging         | `https://staging-api.example.com` |
| Database   | Separate DB     | `stellar_veriphy_staging`         |
| Blockchain | Stellar Testnet | XLM balances are free/test only   |
| Cache      | Redis           | Session and ephemeral data        |

## Local Development with Staging

### Prerequisites

- Docker and Docker Compose 20.10+
- Node.js 20+
- pnpm 10.18.2+
- Rust 1.75+ (for contract development)

### Starting the Staging Environment Locally

```bash
# Set environment variables
export STAGING_DB_PASSWORD=your_secure_password
export STAGING_REDIS_PASSWORD=your_secure_password
export STAGING_GRAFANA_PASSWORD=your_secure_password

# Start services
docker-compose -f docker-compose.staging.yml up -d

# View logs
docker-compose -f docker-compose.staging.yml logs -f

# Stop services
docker-compose -f docker-compose.staging.yml down
```

### Environment Variables

Create a `.env.staging` file:

```bash
# Frontend
NODE_ENV=staging
PORT=3000
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_WALLET_NETWORK=testnet
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_MOCK_WALLET=false
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://staging_user:${STAGING_DB_PASSWORD}@localhost:5432/stellar_veriphy_staging
STAGING_DB_PASSWORD=your_secure_password

# Cache
REDIS_URL=redis://:${STAGING_REDIS_PASSWORD}@localhost:6379
STAGING_REDIS_PASSWORD=your_secure_password

# Blockchain
STELLAR_NETWORK=testnet
STELLAR_ACCOUNT=your_testnet_account
STELLAR_SECRET_KEY=your_testnet_secret
```

## Deployment Process

### Automated Deployment

Deployments are triggered automatically when code is pushed to `main`:

1. **Build Phase**: Contracts and frontend are built
2. **Test Phase**: Contract tests and E2E tests run
3. **Deploy Phase**: Docker image is pushed and deployment is triggered
4. **Security Scan**: SAST scan and dependency audit
5. **Health Check**: Endpoints are verified for health

### Manual Deployment

```bash
# Build and deploy manually
docker-compose -f docker-compose.staging.yml up --build -d

# Run database migrations
docker-compose -f docker-compose.staging.yml exec api npm run migrate

# Run E2E tests
docker-compose -f docker-compose.staging.yml exec frontend pnpm test:e2e
```

## Database Management

### Backup

```bash
# Create backup
docker-compose -f docker-compose.staging.yml exec postgres \
  pg_dump -U staging_user stellar_veriphy_staging > staging_backup.sql

# Restore backup
docker-compose -f docker-compose.staging.yml exec postgres \
  psql -U staging_user stellar_veriphy_staging < staging_backup.sql
```

### Reset the environment

Use `scripts/reset-staging.sh` (or `pnpm reset:staging`) to return the local staging stack to a known state. It:

1. Starts `postgres` and `redis` if they aren't running and waits until both report healthy.
2. Drops `stellar_veriphy_staging` (terminating open connections) and recreates it.
3. Re-applies `scripts/init-staging-db.sql`, which creates the schema and the sample rows.
4. Flushes the staging Redis cache.
5. Verifies the result: database exists, `content_items`, `verification_proofs` and `provenance_records` are present, seed rows match the requested mode, and Redis is empty. Any mismatch exits non-zero.

```bash
export STAGING_DB_PASSWORD=your_secure_password
export STAGING_REDIS_PASSWORD=your_secure_password

# Preview what will happen; changes nothing
scripts/reset-staging.sh --dry-run

# Interactive reset (asks you to type "reset")
scripts/reset-staging.sh

# Non-interactive, e.g. from CI or another script
scripts/reset-staging.sh --yes

# Empty tables instead of sample data, and keep cached sessions
scripts/reset-staging.sh --yes --no-seed --keep-cache

# Check the current state without touching anything
scripts/reset-staging.sh --verify-only
```

**Safe to rerun.** Every step is idempotent: `DROP DATABASE IF EXISTS`, `CREATE ... IF NOT EXISTS` throughout the init script, `DROP TRIGGER IF EXISTS` before recreating the trigger, and `ON CONFLICT DO NOTHING` for sample rows. If a reset is interrupted halfway, run it again.

**Guard rails.** The script only targets `docker-compose.staging.yml`, refuses to run when `NODE_ENV`, `ENVIRONMENT` or `DEPLOY_ENV` is `production`, and refuses to run without `--yes` when there is no terminal to confirm on.

**Passwords.** `STAGING_DB_PASSWORD` and `STAGING_REDIS_PASSWORD` must match the values the stack was first started with. Postgres only reads its password when the data volume is created; to change it, run `docker-compose -f docker-compose.staging.yml down -v` and start again.

## Testing in Staging

### E2E Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run specific test
pnpm test:e2e -- e2e/home.spec.ts

# Debug mode
pnpm test:e2e:ui
```

### Load Testing

```bash
# Run load tests
npm run test:load:frontend
npm run test:load:contracts

# Generate report
npm run test:load:report
```

### Security Testing

```bash
# Dependency audit
pnpm audit

# Contract security analysis
cargo audit
```

## Monitoring

### Prometheus Metrics

Access Prometheus at `http://localhost:9090`

### Infrastructure Health Dashboard

Grafana runs at `http://localhost:3002` with the **Infrastructure Health** dashboard as its home page. It shows the app services, Postgres, Redis and the backend's external dependencies at a glance. See [docs/operations/infrastructure-dashboard.md](docs/operations/infrastructure-dashboard.md).

### Container Logs

```bash
# View frontend logs
docker-compose -f docker-compose.staging.yml logs frontend

# View database logs
docker-compose -f docker-compose.staging.yml logs postgres

# Tail logs in real-time
docker-compose -f docker-compose.staging.yml logs -f
```

### Database Queries

```bash
# Connect to database
docker-compose -f docker-compose.staging.yml exec postgres \
  psql -U staging_user stellar_veriphy_staging

# List tables
\dt

# View recent content
SELECT * FROM recent_content LIMIT 10;
```

## Access Control

### Who Can Deploy to Staging?

- Maintainers with push access to `main` branch
- CI/CD system (GitHub Actions)
- Designated DevOps team members

### Secrets Management

Staging secrets are stored in GitHub repository settings:

- `STAGING_DB_PASSWORD` - Database password
- `STAGING_REDIS_PASSWORD` - Redis password
- `STAGING_DEPLOYMENT_URL` - Staging server URL
- `STAGING_API_KEY` - API authentication key
- `STAGING_DATABASE_URL` - Full database connection string

To add/update secrets:

1. Go to Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add secret name and value
4. Confirm

### IP Whitelisting

Staging server should be restricted to:

- CI/CD runners
- Team VPN
- Development machines (with approval)

## Troubleshooting

### Services Won't Start

```bash
# Check Docker
docker ps

# Check logs
docker-compose -f docker-compose.staging.yml logs

# Restart all services
docker-compose -f docker-compose.staging.yml restart
```

### Database Connection Issues

```bash
# Verify credentials
docker-compose -f docker-compose.staging.yml exec postgres \
  psql -U staging_user -d stellar_veriphy_staging -c "SELECT 1;"

# Check connection pooling
docker-compose -f docker-compose.staging.yml exec api \
  curl http://localhost:3001/api/health
```

### Frontend Not Building

```bash
# Clear cache and rebuild
docker-compose -f docker-compose.staging.yml down -v
docker-compose -f docker-compose.staging.yml up --build -d

# Check Node version
docker-compose -f docker-compose.staging.yml exec frontend node --version
```

## Best Practices

1. **Use Fresh Data**: Regularly reset database with test data
2. **Monitor Deployments**: Watch CI/CD logs for errors
3. **Test Thoroughly**: Run full E2E test suite before merging
4. **Keep Secrets Secure**: Never commit sensitive data
5. **Review Changes**: Have PRs reviewed before merge to main
6. **Document Changes**: Update this guide when infrastructure changes

## Related Documentation

- [Deployment Guide](./DEPLOYMENT.md)
- [Docker Documentation](./DOCKER.md)
- [CI/CD Reference](./github/CI_QUICK_REFERENCE.md)
- [Development Workflow](./DEVELOPMENT_WORKFLOW.md)
