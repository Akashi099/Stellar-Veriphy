# Migration Safety Review

Covers schema/storage migrations for Soroban contracts (`contracts/*`) and any off-chain data stores.

## Ordering

- Migrations live in `scripts/migrations/` and are named `NNNN_description.(sh|sql)` (zero-padded, strictly increasing).
- Each migration must have a matching rollback: `NNNN_description.down.(sh|sql)`, or a `-- IRREVERSIBLE: <reason>` / `# IRREVERSIBLE: <reason>` header with a documented recovery path.
- `scripts/migrations/validate.sh` enforces ordering (no gaps, no duplicates), rollback presence, and flags critical changes. It runs in CI (`.github/workflows/deploy-smoke.yml`).

## Critical schema changes

The validator flags these patterns and requires a `REVIEWED-BY:` header before deploy:

- `DROP`, `TRUNCATE`, `ALTER ... TYPE`, `RENAME`
- Contract storage key removal/renaming, `upgrade` / `update_current_contract_wasm` calls

## Pre-deployment checklist

1. `scripts/migrations/validate.sh` passes.
2. Backup/snapshot taken (DB dump, or contract state export via `stellar contract read`).
3. Migration tested against a staging/testnet copy of production data.
4. Rollback tested on staging.
5. Data integrity check defined (row counts, checksums, or contract read of key entries) and run before + after.

## Rollback / recovery

- **Reversible**: run the `.down` script for each applied migration in reverse order.
- **Contract WASM upgrade**: re-deploy the previous WASM hash via `upgrade` (keep the hash in the release notes).
- **Irreversible**: restore from the snapshot taken in step 2; follow `docs/ops/incident-runbook.md`.
