# Development Scripts Guide

This guide explains the development scripts available in the Stellar Veriphy project.

## Quick Start

### Initial Setup

To set up your development environment:

```bash
pnpm setup
```

This will:

- Install all dependencies
- Set up environment variables
- Build Soroban contracts (if Stellar CLI is available)
- Generate mock data

### Clean Project

To clean build artifacts and temporary files:

```bash
pnpm clean
```

This removes:

- Next.js build output (`.next/`)
- Rust/Soroban build artifacts (`target/`)
- Test and coverage reports
- Playwright reports
- Bundle analysis reports

## Development Utilities

### Generate Mock Data

Generate realistic mock data for development and testing:

```bash
pnpm generate-mock-data
```

This creates mock data files in `frontend/public/mock-data/`:

- `users.json` - Test users with different roles
- `items.json` - Sample content items
- `verifications.json` - Verification records
- `provenance.json` - Provenance chain data
- `analytics.json` - Aggregated analytics
- `all.json` - Complete dataset

### Reset Database

Reset the database to initial state:

```bash
pnpm reset-db
```

Options:

- `pnpm reset-db` - Reset and load seed data
- `pnpm reset-db --no-seed` - Reset without seed data

**Warning:** This command is destructive and will delete all data.

## Deployment

### Check Deployment Readiness

Verify the project is ready for deployment without actually deploying:

```bash
pnpm deploy:check
```

This performs:

1. Git status validation
2. Branch verification
3. Dependency checks
4. Type checking
5. Test suite validation
6. Frontend build verification
7. Environment configuration checks
8. Bundle size validation

### Deploy to Staging

Deploy to the staging environment:

```bash
pnpm deploy:staging
```

### Deploy to Production

Deploy to the production environment:

```bash
pnpm deploy:production
```

**Note:** Production deployments require the `main` branch and all checks to pass.

## Individual Scripts

### setup.sh

**Path:** `scripts/setup.sh`

Sets up the complete development environment.

**What it does:**

- Checks Node.js and pnpm availability
- Installs dependencies
- Creates `.env.local` from template
- Builds Soroban contracts
- Generates mock data

**Usage:**

```bash
bash scripts/setup.sh
# or
pnpm setup
```

### clean.sh

**Path:** `scripts/clean.sh`

Removes build artifacts and temporary files.

**What it removes:**

- `.next/`, `out/`, `dist/` directories
- Soroban contract build artifacts
- Test and coverage reports
- Temporary files (`.log`, `.DS_Store`, etc.)

**Usage:**

```bash
bash scripts/clean.sh
# or
pnpm clean
```

### reset-db.sh

**Path:** `scripts/reset-db.sh`

Resets the database and optionally loads seed data.

**Requirements:**

- `DATABASE_URL` environment variable set

**Options:**

- `--no-seed` - Skip seed data loading

**Usage:**

```bash
bash scripts/reset-db.sh
# or with options
bash scripts/reset-db.sh --no-seed
# or via pnpm
pnpm reset-db
```

### generate-mock-data.mjs

**Path:** `scripts/generate-mock-data.mjs`

Generates realistic mock data for development and testing.

**Features:**

- Creates 15 test users with different roles
- Generates 30 sample content items
- Creates 40 verification records
- Generates 30 provenance records
- Creates analytics data

**Output:**

- Generated in `frontend/public/mock-data/`
- Files: `users.json`, `items.json`, `verifications.json`, `provenance.json`, `analytics.json`

**Usage:**

```bash
node scripts/generate-mock-data.mjs
# or via pnpm
pnpm generate-mock-data
```

### deploy-helper.sh

**Path:** `scripts/deploy-helper.sh`

Provides pre-deployment checks and validation.

**Pre-deployment Checks:**

1. Git status (working directory must be clean)
2. Branch validation
3. Dependencies validation
4. Type checking
5. Test suite
6. Build verification
7. Environment configuration
8. Bundle size limits

**Usage:**

```bash
bash scripts/deploy-helper.sh <environment> [check-only]

# Check deployment readiness for staging
bash scripts/deploy-helper.sh staging check-only

# Or via pnpm
pnpm deploy:check
pnpm deploy:staging
pnpm deploy:production
```

## Environment Variables

### .env.local

The setup script creates `.env.local` from `.env.local.example`. Update this file with your:

- Stellar network URLs
- Contract addresses
- API endpoints
- Feature flags
- Wallet configuration

### Database URL

For database operations, set:

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/stellar_veriphy"
```

## Common Tasks

### Full Setup for First Time

```bash
# 1. Clone the repository
git clone https://github.com/Stellar-Veriphy/Stellar-Veriphy.git
cd Stellar-Veriphy

# 2. Run setup script
pnpm setup

# 3. Start development server
pnpm dev:frontend
```

### Reset Development Database

```bash
# Reset and reload seed data
pnpm reset-db

# Reset without seed data
pnpm reset-db --no-seed
```

### Clean Build for Fresh Start

```bash
# Clean all artifacts
pnpm clean

# Reinstall dependencies
pnpm install

# Rebuild
pnpm build:frontend
```

### Prepare for Deployment

```bash
# Check readiness (non-destructive)
pnpm deploy:check

# If all checks pass, deploy to staging
pnpm deploy:staging

# After testing staging, deploy to production
pnpm deploy:production
```

## Troubleshooting

### "pnpm: command not found"

Install pnpm globally:

```bash
npm install -g pnpm@10.18.2
```

### "Stellar CLI not found"

Soroban contract builds will be skipped. Install Stellar CLI from [stellar.org](https://developers.stellar.org/docs/build/reference/cli)

### "DATABASE_URL not set"

Set the database URL before running database operations:

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/stellar_veriphy"
```

### "Permission denied" on scripts

Make scripts executable:

```bash
chmod +x scripts/*.sh
```

## Integration with CI/CD

These scripts are integrated with the CI/CD pipeline:

- **Bundle Analysis** runs on every push/PR
- **Type checking** runs before deployment
- **Tests** must pass before merge
- **Pre-deployment checks** run before release deployments

See `.github/workflows/` for CI/CD configuration.

## Contributing

When adding new scripts:

1. Follow the naming convention: `action-noun.sh` or `action-noun.mjs`
2. Add helpful output with colors using the color codes
3. Update this documentation
4. Add a corresponding entry in `package.json` scripts
5. Make scripts executable: `chmod +x scripts/your-script.sh`
