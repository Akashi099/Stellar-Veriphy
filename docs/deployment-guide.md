# Deployment Guide

Addresses issue #397. Step-by-step guide for deploying the Soroban contracts and the Next.js frontend.

## 1. Environment Setup

Prerequisites (see also the root [README](../README.md#-getting-started)):

- Node.js 20+
- pnpm (`packageManager` pinned to `pnpm@10.18.2` in [package.json](../package.json))
- Rust (latest stable) + Cargo, with the `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)
- A funded Stellar account/keypair for the network you're deploying to (Friendbot for testnet, a real funded account for mainnet)

Install dependencies from the repo root:

```bash
pnpm install
```

Configure a Stellar CLI identity for the target network:

```bash
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet
```

For mainnet, import an existing funded key instead of generating a fresh one:

```bash
stellar keys add deployer --secret-key
```

## 2. Contract Deployment

Contracts live under [`contracts/`](../contracts): `oracle`, `provenance`, `registry`.

### 2.1 Build

```bash
pnpm build:contracts
```

This runs `stellar contract build` in each of the three contract crates (see the script in [package.json](../package.json)). Build artifacts land at `contracts/<name>/target/wasm32-unknown-unknown/release/<name>.wasm`.

### 2.2 Deploy

Deploy each contract, capturing the returned contract ID — later contracts depend on the IDs of earlier ones (e.g. `registry` must be known to `oracle`/`provenance` once cross-contract calls are wired up):

```bash
stellar contract deploy \
  --wasm contracts/registry/target/wasm32-unknown-unknown/release/registry.wasm \
  --source deployer \
  --network testnet

stellar contract deploy \
  --wasm contracts/oracle/target/wasm32-unknown-unknown/release/oracle.wasm \
  --source deployer \
  --network testnet

stellar contract deploy \
  --wasm contracts/provenance/target/wasm32-unknown-unknown/release/provenance.wasm \
  --source deployer \
  --network testnet
```

Record each `contract_id` returned by the CLI — the frontend and any oracle worker need them (see [Environment Setup](#3-frontend-environment-variables) below).

### 2.3 Initialize

Initialize the registry, then register the oracle's TEE code hash so the oracle's `is_tee_hash_approved` check passes. The legacy `register` / `is_approved` pair is deprecated (see [naming conventions](contracts/naming-conventions.md)) and is not read by the oracle.

```bash
stellar contract invoke \
  --id <REGISTRY_CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- init --admin <ADMIN_PUBLIC_KEY> --provenance <PROVENANCE_CONTRACT_ID>

stellar contract invoke \
  --id <REGISTRY_CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- add_tee_hash --code_hash <TEE_CODE_HASH_HEX>
```

## 3. Frontend Environment Variables

Create `frontend/.env.local` (not committed — verify it's covered by [`.gitignore`](../.gitignore)) with the deployed contract IDs and network config:

```bash
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_ORACLE_CONTRACT_ID=<from step 2.2>
NEXT_PUBLIC_PROVENANCE_CONTRACT_ID=<from step 2.2>
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=<from step 2.2>
```

For mainnet, swap the network/Horizon/RPC values for their mainnet equivalents and use mainnet contract IDs from a separate deployment.

## 4. Frontend Deployment

### 4.1 Local build verification

```bash
pnpm build:frontend
pnpm --filter frontend start
```

Confirm the app boots on `http://localhost:3000` and `GET /api/health` (see [`frontend/app/api/health/route.ts`](../frontend/app/api/health/route.ts)) returns a healthy response.

### 4.2 Deploy

Deploy `frontend/` as a standalone Next.js app to your hosting target (e.g. Vercel, or any Node-capable host):

- Set the build command to `pnpm build:frontend` (run from the repo root so the workspace resolves `@stellarveriphy/shared`).
- Set the output/start command to `pnpm --filter frontend start`.
- Configure the environment variables from [section 3](#3-frontend-environment-variables) in the hosting platform's dashboard/secrets store — never commit them.

## 5. Configuration Checklist

Before calling a deployment done, confirm:

- [ ] Contracts built with no warnings from `stellar contract build`
- [ ] All three contract IDs recorded and match the intended network (testnet vs mainnet)
- [ ] Registry initialized with the correct TEE code hash and admin key
- [ ] `frontend/.env.local` (or hosting platform env vars) set for the target network, not left pointing at testnet
- [ ] Deployer/admin secret keys are stored in a secrets manager, not in shell history or committed files
- [ ] `pnpm build:frontend` completes without errors
- [ ] `/api/health` responds successfully against the deployed frontend

## 6. Post-Deployment Verification

1. **Health check** — `curl https://<deployed-host>/api/health` returns `200`.
2. **Contract reachability** — invoke a read-only method on each contract to confirm the RPC endpoint and contract IDs are correct:
   ```bash
   stellar contract invoke \
     --id <REGISTRY_CONTRACT_ID> \
     --network testnet \
     -- is_tee_hash_approved --code_hash <TEE_CODE_HASH_HEX>
   ```
3. **End-to-end smoke test** — submit a verification request through the oracle contract with a test manifest and confirm a `submitted` event is emitted and the request is retrievable via `get_request`.
4. **Frontend smoke test** — load the deployed app, walk through the creator upload flow at `/creator/upload-content`, and confirm no console errors referencing missing env vars or unreachable RPC endpoints.

## 7. Rollback Procedures

**Frontend:** Next.js deployments are typically immutable per-build. Roll back by redeploying the previous known-good build/commit through your hosting platform's rollback or "promote previous deployment" feature. No data migration is involved since the frontend is stateless.

**Contracts:** Soroban contracts are immutable once deployed — there is no in-place rollback of contract code.

- If a newly deployed contract is broken, deploy a corrected version as a **new** contract (new contract ID) rather than attempting to patch the old one.
- Update the frontend's env vars to point at the new contract ID and redeploy the frontend.
- Old contract IDs remain on-chain and queryable; do not treat them as deleted. Any provenance certificates already minted against the old contract remain valid and retrievable at that old ID.
- If the registry contract itself needs to change, deploy the new registry, re-register all previously approved TEE code hashes against it, and update every dependent contract/frontend reference before decommissioning references to the old registry ID.
- For irrecoverable admin-key loss, treat it as a full redeploy: new contracts, new admin key, new frontend config — there is no key-recovery path at the contract level.
