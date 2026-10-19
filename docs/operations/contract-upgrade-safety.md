# Contract Upgrade Safety

This document defines the process for safely upgrading StellarVeriphy's Soroban contracts (`oracle`, `provenance`, `registry`). Read it before running any deployment that replaces a live contract.

## Why upgrades are risky here

Soroban contracts are **immutable once deployed** — upgrading means deploying a new contract instance with a new ID and repointing consumers. The old contract and all its on-chain state remain unchanged forever. This creates three specific risks:

1. **Storage incompatibility.** The new contract's `DataKey` variants and `#[contracttype]` struct layouts must be compatible with the data the old contract wrote. If a struct field is removed or reordered, existing persistent-storage entries will fail to deserialise under the new code.

2. **Consumer misconfiguration.** Every frontend config, oracle worker config, and downstream integration must be updated to the new contract ID atomically. A partial update splits traffic between two contract versions.

3. **No in-place rollback.** There is no `update_wasm` call in these contracts. Rolling back means reverting consumer configs to the old contract ID — which is only possible if you recorded it before upgrading.

## Upgrade lifecycle

```
Record current ID → Safety check → Testnet deploy → Smoke test → [Mainnet deploy] → Smoke test → Repoint consumers → Post-deploy verify
```

### Step 1 — Record the current contract ID

Before touching anything, add an entry to `docs/operations/deployment-log.md` with the currently-deployed contract ID for the contract you are upgrading. If this record does not exist, you cannot roll back.

### Step 2 — Snapshot storage state

```bash
./scripts/snapshot-contract-state.sh <contract>
git add docs/operations/storage-keys-<contract>.txt docs/operations/struct-snapshot-<contract>.txt docs/operations/api-<contract>.txt
git commit -m "chore: pre-upgrade snapshot for <contract>"
```

This captures the `DataKey` variants, the persisted struct fields and the public entry points, so the safety check can diff against them. Run it against the **currently-deployed** version. A snapshot of unreleased code does not describe what live data and consumers depend on. Missing baselines fail the check. They are never skipped.

### Step 3 — Write a migration plan

Copy `docs/operations/migration-template.md` to `docs/operations/migration-<contract>.md` and fill in every section. The migration plan is **required for mainnet upgrades** and strongly recommended for testnet. The safety check script (`upgrade-safety-check.sh`) will fail if the migration doc is missing on mainnet or if required sections (`Pre-migration`, `Migration steps`, `Post-migration`, `Rollback`) are absent.

### Step 4 — Run the safety check

```bash
./scripts/upgrade-safety-check.sh <contract> <old_wasm_path> <new_wasm_path> testnet
```

All checks must pass before proceeding. Fix any failures the script reports — they are not advisory for mainnet.

The checker flags a change as **RISK** when it could break live data or existing callers:

| RISK | Why it matters |
|------|----------------|
| A removed `DataKey` variant | Data stored under that key becomes unreachable. |
| A removed or changed persisted struct field | Existing entries may not deserialise. |
| A new required (non-`Option`) struct field | Existing entries lack the field and must be migrated. |
| A removed public entry point | Clients that call it fail. |

Every RISK must be named in the migration doc, using the exact token the checker prints (for example `DataKey::Old`, `ProviderInfo.field` or `fn old_entry`). A RISK with no migration doc blocks the upgrade on testnet too. A new `Option` field is reported as information, not a risk.

The tooling has its own self-test. It covers each failure class above and runs without building a contract:

```bash
make upgrade-selftest        # or: pnpm test:upgrade-safety
```

Common failures and their fixes:

| Failure | Fix |
|---------|-----|
| Storage key missing in new source | Do not remove `DataKey` variants that have live data. Add a migration step to move data to the new key name before removing the old one. |
| Struct field changes detected | For non-`Option` additions, all existing on-chain entries must be migrated before the new code is deployed. For removals, confirm no live data depends on that field. |
| No migration doc | Create `docs/operations/migration-<contract>.md` from the template. |
| No deployment log entry | Add the current contract ID to `docs/operations/deployment-log.md`. |
| Mainnet confirmation missing | Add `--confirm` flag; only after all other checks pass. |

### Step 5 — Deploy to testnet first

Always deploy and fully test on testnet before mainnet. Use the same WASM artifact.

```bash
# From the contract directory:
stellar contract build

stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/<contract>.wasm \
  --source deployer \
  --network testnet
# → records new contract ID
```

### Step 6 — Smoke test the new deploy

```bash
./scripts/verify-deployment.sh <contract> <new-contract-id> testnet
```

All smoke tests must pass. If any fail, do not repoint consumers. Investigate and fix, then redeploy.

### Step 7 — Repoint consumers (testnet)

Update `frontend/.env.test` and any oracle worker test configs. Restart/redeploy consumers. Run an end-to-end test (submit a verification → confirm certificate is minted under the new ID).

### Step 8 — Repeat for mainnet

After testnet is confirmed stable:

```bash
./scripts/upgrade-safety-check.sh <contract> <old_wasm> <new_wasm> mainnet --confirm
stellar contract deploy --wasm <wasm> --source deployer --network mainnet
./scripts/verify-deployment.sh <contract> <new-id> mainnet
```

Then update `frontend/.env.production` and the production oracle worker config.

### Step 9 — Update the deployment log and snapshots

```bash
# Add a new entry to docs/operations/deployment-log.md
# Re-snapshot to reflect the new version's storage layout
./scripts/snapshot-contract-state.sh <contract>
git add docs/operations/
git commit -m "chore: post-upgrade snapshot and deployment log for <contract>"
```

---

## Storage compatibility rules

Understanding Soroban's storage model is essential for safe upgrades.

### What is safe

| Change | Safe? | Notes |
|--------|-------|-------|
| Adding a new `DataKey` variant | ✅ | Does not affect reads of existing keys |
| Adding an `Option<T>` field to a struct | ✅ | Missing field deserialises as `None` |
| Adding a new contract method | ✅ | Additive; existing callers unaffected |
| Changing a method's logic (same signature) | ✅ | New WASM is a new contract; old data is not re-read until the new code calls it |
| Increasing a constant (`MAX_BATCH_SIZE`, etc.) | Usually ✅ | Verify no downstream assumption depends on the old value |

### What is breaking

| Change | Breaking | Mitigation |
|--------|----------|------------|
| Removing a `DataKey` variant | ⚠️ | Data under that key is stranded. Migrate to a new key name first. |
| Adding a non-`Option` field to a persistent struct | ⚠️ | Existing entries fail to deserialise. Migrate all entries off the old key before deploying, or use `Option`. |
| Removing a field from a persistent struct | ⚠️ | Existing entries fail to deserialise (field count mismatch). |
| Reordering fields in a persistent struct | ⚠️ | Soroban serialises structs positionally; reordering corrupts all existing entries. |
| Changing a field's type | ⚠️ | Deserialisation will fail. Migrate entries first. |
| Renaming a `DataKey` variant | ⚠️ | Treat as remove + add; existing data under the old name is unreachable. |

### Worked example: adding a field to `ProvenanceCert`

If you want to add `pub chain_anchor: Option<String>` to `ProvenanceCert`:

1. Add the field as `Option<String>` — not `String`. Existing certs will deserialise with `chain_anchor: None`.
2. No data migration needed.
3. New certs minted by the new contract will have the field populated.
4. Run `./scripts/snapshot-contract-state.sh provenance` after the upgrade to update the reference snapshot.

If you want to add `pub chain_anchor: String` (non-optional):

1. You **cannot** safely deploy this against a live contract — all existing certs will fail to deserialise.
2. Options: (a) make it `Option<String>`, (b) write an off-chain migration script that reads every cert, transforms the data, and writes it into a new contract, (c) accept that the new contract is a clean-slate deploy with no history carried over.

---

## Rollback procedures

### When to roll back

Roll back if any of the following occur after consumer repointing:

- The new contract panics on a valid invocation
- Certificate minting fails for inputs that previously succeeded
- `./scripts/verify-deployment.sh` fails on the new ID
- Unexpected events or missing events on Stellar Expert
- Frontend or oracle worker errors spike after the change

### How to roll back

1. **Revert consumer configs** to the old contract ID from `docs/operations/deployment-log.md`.
2. **Redeploy or restart** consumers (frontend, oracle worker).
3. **Verify** the old contract is responsive: `./scripts/verify-deployment.sh <contract> <old-id> <network>`
4. **Confirm** the old contract is receiving traffic as expected.
5. **File a post-mortem** issue — describe what failed, what data (if any) was written to the new contract during the window, and the plan to address the root cause before the next upgrade attempt.

### What about data written to the new contract during the window?

Any certificates minted or requests submitted between "consumers repointed to new ID" and "consumers reverted to old ID" are recorded under the new contract ID. They remain accessible via the new ID — no data is lost.

If those records need to be reconciled with the main history, use `provenance.record_rollback` to create an auditable link, or add a note to the deployment log referencing the new contract ID and the affected certificate ID range.

### The old contract is permanent

The old contract remains deployed at its original ID. No on-chain action is needed to "restore" it — it never went anywhere. Rollback is entirely a consumer-side config change.

---

## Upgrade failure detection before go-live

The layered approach for catching failures **before** consumer repointing:

1. **`upgrade-safety-check.sh`** — static analysis of WASM and source, catches structural issues before a single byte hits the network.
2. **`cargo test --release`** — contract unit + integration tests run against the full new source.
3. **Testnet deploy + `verify-deployment.sh`** — live smoke tests against the actual deployed contract on testnet, catching serialisation issues that only appear at runtime.
4. **End-to-end testnet flow** — submit a request → oracle picks it up → certificate is minted → verify it reads back correctly. This catches cross-contract call issues that unit tests miss.

All four gates must pass before a mainnet upgrade.

---

## Related files

| File | Purpose |
|------|---------|
| `scripts/upgrade-safety-check.sh` | Pre-deploy static safety checks |
| `scripts/verify-deployment.sh` | Post-deploy smoke tests |
| `scripts/snapshot-contract-state.sh` | Capture storage key + struct snapshots |
| `docs/operations/migration-template.md` | Template for per-upgrade migration docs |
| `docs/operations/deployment-log.md` | Permanent record of all deployed contract IDs |
| `docs/deployment.md` | General deployment guide (build, deploy, network config) |
| `docs/adr/0002-soroban-on-stellar.md` | Why Soroban; immutability implications |
