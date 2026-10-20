# Development Workflow

This document describes the end-to-end development workflow for StellarVeriphy — from setting up your local environment to getting code merged into `main`. It covers both the frontend (Next.js) and the smart contracts (Rust/Soroban).

For coding standards and style rules, see [STYLE-GUIDE.md](./STYLE-GUIDE.md). For contribution guidelines and PR process details, see [CONTRIBUTING.md](./CONTRIBUTING.md). If you hit setup or environment problems, see the [troubleshooting guide](./docs/troubleshooting.md) for fixes to common issues.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Local Setup](#2-local-setup)
3. [Project Structure Overview](#3-project-structure-overview)
4. [Daily Development Cycle](#4-daily-development-cycle)
5. [Frontend Development](#5-frontend-development)
6. [Smart Contract Development](#6-smart-contract-development)
7. [Shared Package Development](#7-shared-package-development)
8. [Git Workflow](#8-git-workflow)
9. [Automated Quality Gates](#9-automated-quality-gates)
10. [Running the Full Stack Locally](#10-running-the-full-stack-locally)
11. [Docker-Based Development](#11-docker-based-development)
12. [Continuous Integration](#12-continuous-integration)
13. [Deployment Pipeline](#13-deployment-pipeline)
14. [Common Commands Reference](#14-common-commands-reference)

---

## 1. Prerequisites

For your first contribution, use the [onboarding guide](docs/onboarding.md). Install tools only for your area: documentation needs Git/editor; TypeScript needs Node.js/pnpm; contracts need Rust/Stellar; the backend needs MongoDB. Wallets and Docker are optional unless your workflow uses them. Use [common contributor tasks](docs/contributor-tasks.md) for focused checks and release validation.

Install the following tools before starting.

| Tool | Minimum Version | Install |
|---|---|---|
| **Node.js** | `>= 20.0.0` | [nodejs.org](https://nodejs.org) |
| **pnpm** | `10.18.2` (pinned) | Use the [onboarding instructions](docs/onboarding.md#environment-setup) |
| **Rust** | `stable` | [rustup.rs](https://rustup.rs) |
| **Stellar CLI** | latest | `cargo install --locked stellar-cli --features opt` |
| **Docker** | latest | [docker.com](https://www.docker.com) (optional, for containerised dev) |
| **Freighter Wallet** | latest | Browser extension for Stellar wallet interactions |

After installing Rust, add the WebAssembly target required by Soroban:

```bash
rustup target add wasm32-unknown-unknown
```

Verify everything is in place:

```bash
node -v          # should print v20.x.x or higher
pnpm -v          # should print 10.18.2
rustc --version  # should print stable toolchain
stellar --version
```

If any of these commands fail or print an unexpected version, see the [troubleshooting guide](./docs/troubleshooting.md) for common setup and environment fixes.

---

## 2. Local Setup

### 2.1 Clone and install

```bash
git clone https://github.com/Stellar-Veriphy/Stellar-Veriphy.git
cd Stellar-Veriphy
pnpm install
```

`pnpm install` installs all workspace packages (frontend, shared) and registers git hooks via `husky`.

### 2.2 Configure environment variables

```bash
cp frontend/.env.local.example frontend/.env.local
```

Open `frontend/.env.local` and fill in the values relevant to your target network:

```env
# Which Stellar network to connect to
NEXT_PUBLIC_NETWORK=testnet           # testnet | mainnet | futurenet

# RPC endpoints
NEXT_PUBLIC_TESTNET_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_MAINNET_RPC_URL=https://mainnet.stellar.validationcloud.io/v1/soroban/rpc
NEXT_PUBLIC_FUTURENET_RPC_URL=https://rpc-futurenet.stellar.org

# Deployed contract addresses (leave empty until contracts are deployed)
NEXT_PUBLIC_ORACLE_CONTRACT_ID=
NEXT_PUBLIC_PROVENANCE_CONTRACT_ID=
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=

# Enable in-memory mock wallet for local dev and e2e tests
NEXT_PUBLIC_MOCK_WALLET=true
```

### 2.3 Verify the setup

```bash
# Should start the Next.js dev server on http://localhost:3000
pnpm dev:frontend
```

If the dev server fails to start, `pnpm install` errors out, or environment variables are not picked up, check the [troubleshooting guide](./docs/troubleshooting.md) before opening an issue.

---

## 3. Project Structure Overview

```
Stellar-Veriphy/
├── contracts/
│   ├── oracle/        # Verification request orchestration, staking, SLA, disputes
│   ├── provenance/    # Provenance certificate minting and lifecycle
│   └── registry/      # TEE code hash registry, provider management, multisig
├── frontend/
│   ├── app/           # Next.js App Router pages and API routes
│   ├── components/    # Reusable React components
│   ├── features/      # Feature modules (grouped by domain)
│   ├── hooks/         # Custom React hooks
│   ├── services/      # Blockchain and external service clients
│   ├── context/       # React context providers
│   ├── utils/         # Frontend-only helpers
│   ├── types/         # TypeScript type declarations
│   └── e2e/           # Playwright end-to-end tests
├── packages/
│   └── shared/        # Shared TypeScript types and hashing utilities
├── docs/              # Architecture, ADRs, API docs, tutorials
├── scripts/
│   └── deploy/        # blue-green-deploy.sh for production
├── .github/
│   └── workflows/     # e2e.yml, contract-docs.yml CI pipelines
└── .husky/            # pre-commit and pre-push git hooks
```

Each contract is an independent Rust crate. The frontend is a standard Next.js 15 application. The `packages/shared` library is consumed by the frontend and tested independently.

---

## 4. Daily Development Cycle

A typical development day follows this flow:

```
Sync with main
     │
     ▼
Create feature branch
     │
     ▼
Write code (frontend and/or contracts)
     │
     ▼
Run local tests
     │
     ▼
Stage and commit  ← pre-commit hook runs lint-staged automatically
     │
     ▼
Push branch       ← pre-push hook runs full frontend build automatically
     │
     ▼
Open Pull Request → CI runs (e2e tests, contract docs)
     │
     ▼
Review → Merge into main
```

---

## 5. Frontend Development

### 5.1 Starting the dev server

```bash
pnpm dev:frontend
```

The frontend runs at `http://localhost:3000` with Next.js hot module replacement active.

### 5.2 Building for production

```bash
pnpm build:frontend
```

A production build is also triggered automatically by the `pre-push` git hook on every push. If the build fails, the push is blocked.

### 5.3 Linting and type checking

```bash
# Run ESLint with auto-fix
pnpm check:frontend

# TypeScript type check across all workspace packages
pnpm typecheck

# Format all files with Prettier
pnpm format

# Check formatting without writing (CI mode)
pnpm format:check
```

### 5.4 Environment variable contract

- All frontend environment variables must be prefixed with `NEXT_PUBLIC_` to be accessible in the browser.
- `NEXT_PUBLIC_MOCK_WALLET=true` activates an in-memory wallet shim — no Freighter extension is needed for local development or e2e tests.
- Never commit `.env.local`. It is listed in `.gitignore`.

### 5.5 API routes

Health check and backend-facing endpoints live under `frontend/app/api/`. The `/api/health` endpoint is used by Docker's `HEALTHCHECK` directive and the blue-green deployment health polling loop.

---

## 6. Smart Contract Development

StellarVeriphy's three Soroban contracts are independent Rust crates. Each targets `wasm32-unknown-unknown` for on-chain execution.

### 6.1 Building contracts

Build all three contracts in one command:

```bash
pnpm build:contracts
```

Or build individually using the Stellar CLI:

```bash
cd contracts/oracle    && stellar contract build
cd contracts/provenance && stellar contract build
cd contracts/registry  && stellar contract build
```

The compiled `.wasm` files land in each contract's `target/wasm32-unknown-unknown/release/` directory.

### 6.2 Running contract tests

```bash
# Test a single contract
cd contracts/oracle    && cargo test
cd contracts/provenance && cargo test
cd contracts/registry  && cargo test

# Or run all contract tests from the workspace root via Docker
make test-contracts
```

Tests use `soroban-sdk testutils` with `Env::default()` and `env.mock_all_auths()`. The oracle contract's dev dependencies include `ed25519-dalek` for generating real cryptographic signatures in tests.

### 6.3 Generating contract documentation

```bash
pnpm docs:contracts
```

This runs `cargo doc --no-deps` for each contract. The output is assembled into a `site/` directory and deployed to GitHub Pages by the `contract-docs.yml` CI workflow on every push to `main` that touches contract source files.

### 6.4 Adding new contract functions

When adding a new public function to any contract:

1. Define the function in `src/lib.rs` with a Rustdoc `///` comment.
2. Add the corresponding error variant(s) to the contract's `Error` enum with an explicit, stable discriminant.
3. Emit a typed event using `#[contractevent]` if the operation produces observable side effects.
4. Write unit tests in `src/test.rs` covering the happy path, error cases, and auth requirements.
5. If the function modifies cross-contract behavior, update the relevant callers (Oracle ↔ Registry ↔ Provenance).

### 6.5 Storage conventions

| Storage type | Use for |
|---|---|
| `env.storage().instance()` | Contract-level singletons: admin address, contract addresses, global config |
| `env.storage().persistent()` | Long-lived per-entity data: certificates, provider records, stakes |
| `env.storage().temporary()` | Short-lived request data that should auto-expire: pending verification requests |

See [contracts/IMPLEMENTATION.md](./contracts/IMPLEMENTATION.md) for full storage, error enum, and event patterns.

### 6.6 Deploying contracts

Contracts are deployed with the `deploy.sh` script at the repository root:

```bash
export STELLAR_NETWORK=testnet
export STELLAR_ACCOUNT=your-account-name
# Optionally: export STELLAR_SECRET_KEY=your-secret-key

./deploy.sh
```

The script builds the WASM, uploads it to the network, and runs the `initialize` entrypoint. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full contract deployment reference.

---

## 7. Shared Package Development

The `packages/shared` library contains TypeScript types (`ContentManifest`, `ProvenanceCert`, `VerificationStatus`) and hashing utilities shared across the frontend and any future backend services.

```bash
# Run unit tests
cd packages/shared && pnpm test

# Run with coverage
cd packages/shared && pnpm test:coverage

# Run mutation tests (Stryker)
pnpm test:mutation
```

Changes to shared types often require corresponding updates in the frontend. Run `pnpm typecheck` from the workspace root after modifying shared types to catch breakage early.

---

## 8. Git Workflow

### 8.1 Branching strategy

All work happens on topic branches off `main`. Direct commits to `main` are not accepted.

| Branch type | Pattern | Example |
|---|---|---|
| Feature | `feature/<issue>-<slug>` | `feature/200-batch-mint` |
| Bug fix | `fix/<issue>-<slug>` | `fix/215-sla-threshold` |
| Docs | `docs/<issue>-<slug>` | `docs/220-workflow-guide` |
| Refactor | `refactor/<issue>-<slug>` | `refactor/180-provider-list` |
| Hotfix | `hotfix/<issue>-<slug>` | `hotfix/911-auth-bypass` |

```bash
git checkout main
git pull origin main
git checkout -b feature/200-batch-mint
```

### 8.2 Commit messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short summary>
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.

Common scopes: `oracle`, `provenance`, `registry`, `frontend`, `shared`, `ci`, `docs`.

Examples:

```
feat(provenance): add batch certificate minting (max 50 per call)
fix(oracle): use saturating_sub to prevent underflow in slash_stake
docs(registry): document TEE hash rotation policy
test(oracle): add SLA auto-suspension edge case coverage
```

### 8.3 Keeping branches up to date

Rebase your branch onto the latest `main` before opening a PR:

```bash
git fetch origin
git rebase origin/main
```

If conflicts arise in contract source files, resolve them carefully — duplicate constant or function definitions in Rust will cause compilation errors.

---

## 9. Automated Quality Gates

Two git hooks run automatically and cannot be bypassed without `--no-verify` (which is strongly discouraged).

### 9.1 pre-commit — `lint-staged`

Runs on every `git commit`. Only staged files are processed:

| File pattern | Actions |
|---|---|
| `frontend/**/*.{ts,tsx}` | `prettier --write` then `eslint --fix` |
| `**/*.{js,jsx,json,css,md,yml,yaml}` | `prettier --write` |
| `contracts/**/*.rs` | `rustfmt --edition 2021` |

If any tool exits with a non-zero code, the commit is aborted.

### 9.2 pre-push — frontend build

Runs the full Next.js production build (`pnpm build:frontend`) before every push. A failed build blocks the push entirely with:

```
❌ Frontend build failed. Fix errors before pushing.
```

This ensures no broken frontend code reaches the remote repository.

---

## 10. Running the Full Stack Locally

With the dev server running and `NEXT_PUBLIC_MOCK_WALLET=true` in `.env.local`, the frontend operates without a real wallet or deployed contracts. To test against real Soroban contracts on testnet:

1. Deploy the three contracts:

   ```bash
   export STELLAR_NETWORK=testnet
   export STELLAR_ACCOUNT=<your-account>
   ./deploy.sh
   ```

2. Copy the printed contract addresses into `.env.local`:

   ```env
   NEXT_PUBLIC_ORACLE_CONTRACT_ID=C...
   NEXT_PUBLIC_PROVENANCE_CONTRACT_ID=C...
   NEXT_PUBLIC_REGISTRY_CONTRACT_ID=C...
   NEXT_PUBLIC_MOCK_WALLET=false
   ```

3. Restart the dev server:

   ```bash
   pnpm dev:frontend
   ```

4. Use Freighter wallet configured for Stellar Testnet to interact with the application.

---

## 11. Docker-Based Development

### 11.1 Development container

```bash
# Start only the dev service (hot reload, port 3001)
docker compose --profile dev up dev

# Or use the Makefile shortcut
make up
```

The dev container mounts `./frontend`, `./packages`, and `./contracts` as live volumes, so file changes are reflected immediately.

### 11.2 Production image

```bash
# Build the production image
make build
# or
docker build -t stellarveriphy:latest .

# Run the production image
make run
# or
docker compose up app
```

The multi-stage `Dockerfile` builds:
1. **Stage 1** (`rust:1.75-slim`): Compiles all three contracts to `.wasm`.
2. **Stage 2** (`node:20-slim`): Installs pnpm, builds the Next.js frontend.
3. **Stage 3** (`node:20-slim`): Production runtime using a non-root `appuser`, prod-only deps, port 3000.

### 11.3 Makefile reference

```bash
make build            # Build production Docker image
make build-dev        # Build development Docker image
make build-contracts  # Build WASM contracts inside the dev container
make up               # Start docker-compose services
make down             # Stop docker-compose services
make test             # Run frontend tests inside the dev container
make test-contracts   # Run Rust cargo tests inside the dev container
make ci-build         # CI-specific image build
make ci-test          # CI-specific test run
```

---

## 12. Continuous Integration

Two GitHub Actions workflows run on every push to `main` and on pull requests.

### 12.1 E2E tests (`e2e.yml`)

Triggers on: `pull_request`, `push` to `main`.

Steps:
1. Checkout → Setup pnpm 10.18.2 → Setup Node 20 (pnpm cache enabled).
2. `pnpm install --frozen-lockfile`.
3. Install Playwright Chromium browser and system dependencies.
4. `pnpm --filter frontend build` (full production build).
5. Run `e2e/home.spec.ts` against Chromium with `NEXT_PUBLIC_MOCK_WALLET=true`.
6. Upload Playwright HTML report as an artifact (always, including on failure).

### 12.2 Contract documentation (`contract-docs.yml`)

Triggers on: push to `main` when `contracts/**`, `docs/api/**`, or `docs/INTEGRATION_GUIDE.md` change; manual dispatch.

Steps:
1. Setup Rust stable toolchain.
2. Run `cargo doc --no-deps` for all three contracts.
3. Assemble a `site/` directory with contract docs and integration guides.
4. Deploy to GitHub Pages.

---

## 13. Deployment Pipeline

### 13.1 Contract deployment

Contracts are deployed using `deploy.sh`. Each deployment:
1. Builds the WASM with `cargo build --target wasm32-unknown-unknown --release`.
2. Uploads the WASM to the Stellar network with `stellar contract upload`.
3. Runs the contract's `initialize` (or `init`) entrypoint.

Each contract must be initialized in dependency order: **Registry → Oracle → Provenance**. The Oracle needs both Registry and Provenance addresses at init time. The Provenance contract needs the Oracle address.

For a detailed step-by-step sequence, see [DEPLOYMENT.md](./DEPLOYMENT.md).

### 13.2 Frontend deployment (blue-green)

The frontend is deployed using `scripts/deploy/blue-green-deploy.sh` on the target host. It maintains two Docker containers (`stellarveriphy-blue` on port 8081 and `stellarveriphy-green` on port 8082) behind an nginx upstream.

**Deploy a new version:**

```bash
./scripts/deploy/blue-green-deploy.sh deploy <image-ref>
```

Flow:
1. Pull the new image.
2. Start the *inactive* color container.
3. Poll `/api/health` until healthy (up to 90 seconds).
4. Rewrite the nginx upstream config to point at the new container.
5. Update the state file. The old container stays running for instant rollback.

**Roll back to the previous version:**

```bash
./scripts/deploy/blue-green-deploy.sh rollback
```

Flips the nginx upstream back to the previously active container — no re-pull, no rebuild.

---

## 14. Common Commands Reference

### Frontend

```bash
pnpm dev:frontend          # Start dev server on http://localhost:3000
pnpm build:frontend        # Build for production
pnpm check:frontend        # Run ESLint with auto-fix
pnpm typecheck             # TypeScript type check (all packages)
pnpm format                # Format all files with Prettier
pnpm format:check          # Check formatting without writing (CI)
```

### Contracts

```bash
pnpm build:contracts       # Build all three contracts to WASM
pnpm docs:contracts        # Generate rustdoc for all contracts
cd contracts/<name> && cargo test          # Run tests for a specific contract
cd contracts/<name> && cargo fmt -- --check  # Check Rust formatting
cd contracts/<name> && cargo clippy        # Run Clippy linter
```

### Testing

```bash
pnpm test                  # Run all workspace tests
pnpm test:e2e              # Run Playwright e2e tests
pnpm test:coverage         # Run tests with coverage
pnpm test:mutation         # Run Stryker mutation tests (shared package)
```

### Docker

```bash
make build                 # Build production image
make up                    # Start all services
make down                  # Stop all services
make test-contracts        # Run Rust tests in container
```

### Deployment

```bash
./deploy.sh                                                    # Deploy contracts
./scripts/deploy/blue-green-deploy.sh deploy <image>          # Deploy frontend
./scripts/deploy/blue-green-deploy.sh rollback                # Rollback frontend
```
