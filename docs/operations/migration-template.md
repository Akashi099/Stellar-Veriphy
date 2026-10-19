# Migration Plan: [Contract Name] — [Short Description]

> Copy this file to `docs/operations/migration-<contract>.md` before upgrading.
> Fill in every section. The upgrade safety check script (`scripts/upgrade-safety-check.sh`)
> verifies that the required sections are present.

**Contract:** `oracle` | `provenance` | `registry` (delete as appropriate)  
**From version:** (WASM hash or git commit of the currently-deployed contract)  
**To version:** (WASM hash or git commit of the candidate contract)  
**Target network:** `testnet` | `mainnet`  
**Planned date:** YYYY-MM-DD  
**Author:** (GitHub handle)  

---

## Context

Why is this upgrade happening? Describe the motivating bug, feature, or refactor. Link the relevant GitHub issue(s).

---

## Storage compatibility analysis

List every `DataKey` variant and `#[contracttype]` struct that changed between the old and new versions. For each change, state whether it is safe or requires migration.

| Change | Type | Safe? | Reason |
|--------|------|-------|--------|
| `DataKey::NewVariant` added | Key addition | ✅ Safe | New keys don't affect reads of existing keys |
| `DataKey::OldVariant` removed | Key removal | ⚠️ Breaking | Existing data under this key becomes unreachable |
| `ProvenanceCert.new_field` added | Struct addition | ✅ Safe if `Option<T>` | Soroban deserialises missing fields as `None` for `Option` types; non-`Option` additions break existing entries |
| `ProvenanceCert.old_field` removed | Struct removal | ⚠️ Breaking | Existing entries fail to deserialise |
| `ProvenanceCert.field` reordered | Struct reorder | ⚠️ Breaking | Soroban serialises structs positionally; reordering corrupts existing entries |

**Overall compatibility verdict:** Safe / Breaking — explain why.

---

## Pre-migration

Steps to perform **before** deploying the new contract:

- [ ] Run `./scripts/snapshot-contract-state.sh <contract>` and commit the output
- [ ] Run `./scripts/upgrade-safety-check.sh <contract> <old_wasm> <new_wasm> <network>` and resolve all FAILs
- [ ] Run all contract unit tests: `cd contracts/<contract> && cargo test --release`
- [ ] Deploy to **testnet** and run `./scripts/verify-deployment.sh <contract> <id> testnet`
- [ ] Record the **current mainnet contract ID** in `docs/operations/deployment-log.md` (rollback requires it)
- [ ] Notify consumers (frontend config, oracle worker config) that a contract ID change is coming
- [ ] For mainnet: obtain second-approver sign-off (see `CONTRIBUTING.md`)

---

## Migration steps

The exact sequence of operations, in order. For each step, include the command to run and the expected outcome.

### Step 1 — Build the new WASM

```bash
cd contracts/<contract>
stellar contract build
# Produces: target/wasm32-unknown-unknown/release/<contract>.wasm
```

### Step 2 — Deploy

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/<contract>.wasm \
  --source deployer \
  --network <network>
# Output: new contract ID (C...)
```

Record the new contract ID immediately:

```
NEW_CONTRACT_ID=C...
```

### Step 3 — Initialise (if applicable)

If the new version adds an `initialize` function or requires re-configuration:

```bash
stellar contract invoke \
  --id $NEW_CONTRACT_ID \
  --source deployer \
  --network <network> \
  -- initialize --admin <admin-address> ...
```

### Step 4 — Data migration (if applicable)

If persistent data must be copied or transformed to the new contract, describe the off-chain migration script here. For most upgrades (new deploy, new ID, same storage model) there is no data migration — note that explicitly.

> No data migration required for this upgrade. The old contract's data remains under the old contract ID and is not carried over. Certificates already minted are permanently accessible via the old contract ID.

### Step 5 — Smoke test

```bash
./scripts/verify-deployment.sh <contract> $NEW_CONTRACT_ID <network>
```

All checks must pass before proceeding to consumer updates.

### Step 6 — Repoint consumers

Update the following config locations to use `$NEW_CONTRACT_ID`:

- `frontend/.env.<environment>` — `NEXT_PUBLIC_<CONTRACT>_CONTRACT_ID`
- Oracle worker environment config
- Any other downstream service configs

Redeploy or restart consumers after updating configs.

---

## Post-migration

Verification steps after consumers are repointed:

- [ ] End-to-end test: submit a verification request and confirm a certificate is minted under the new contract ID
- [ ] Check Stellar Expert / block explorer for the new contract ID's events
- [ ] Confirm no errors in frontend or oracle worker logs
- [ ] Update `docs/operations/deployment-log.md` with the new entry
- [ ] Run `./scripts/snapshot-contract-state.sh <contract>` to update the snapshot to the new version

---

## Rollback

If anything goes wrong **after consumers have been repointed**, rollback means reverting the consumer configuration to the old contract ID — the old contract remains on-chain, unchanged.

### Rollback decision criteria

Roll back immediately if:
- The new contract panics on a valid invocation
- Certificate minting fails for valid inputs
- Any smoke test fails (`./scripts/verify-deployment.sh`)
- On-chain events are malformed or missing

### Rollback steps

1. Revert the consumer configs to the **old contract ID** (recorded in `docs/operations/deployment-log.md`)
2. Redeploy or restart consumers
3. Confirm the old contract is responding: `./scripts/verify-deployment.sh <contract> <old-id> <network>`
4. File a post-mortem issue describing what went wrong

> The old contract's on-chain state is unaffected by the upgrade — there is nothing to undo on-chain.
> Certificates minted during the window between upgrade and rollback will be under the new contract ID.
> Those records remain valid and readable. They can be migrated to the old contract's cert space if needed
> via `provenance.record_rollback`, or left in place with a note in the deployment log.

---

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Struct deserialisation failure for old entries | Low/Medium/High | High | Listed in storage compat analysis; tested on testnet before mainnet |
| Consumer misconfiguration after ID change | Medium | High | Deployment checklist; post-deploy smoke test |
| Admin key unavailable during init | Low | High | Confirm key access before planned deploy window |
| Rollback window too short | Low | Medium | Old contract remains on-chain indefinitely |
