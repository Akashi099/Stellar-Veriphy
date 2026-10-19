# ADR-0007: Contract upgrade model — redeploy with ID rotation

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Core maintainers

## Context

StellarVeriphy's Soroban contracts (`oracle`, `provenance`, `registry`) are content-addressed and immutable once deployed. There are two upgrade strategies available in the Soroban ecosystem:

1. **`update_current_contract_wasm`** — an in-place WASM swap that preserves the contract ID and all on-chain state. The new code runs against the existing storage. Requires the contract to call this function explicitly, gated behind admin auth.

2. **Redeploy with ID rotation** — deploy a new contract instance, which gets a new ID, and repoint all consumers. The old contract and its state remain on-chain permanently.

Both strategies have real tradeoffs. The upgrade discussion is also intertwined with the known **registry admin gap** (noted in `docs/deployment.md#contract-initialization`) — the current registry `register` function does not verify that the caller is a designated admin, making it unsafe for mainnet. Any upgrade must address this before mainnet deployment.

Options considered:

**Option A: Add `update_current_contract_wasm` to all three contracts**  
Preserves contract IDs. Makes frontend/oracle worker configs stable across upgrades. Requires careful admin gating — a compromised admin key can silently replace contract logic under an existing, trusted ID. State compatibility between old and new WASM is still required (Soroban persistent storage layout rules still apply). The trust model implication is significant: whoever holds the admin key can change the on-chain logic that backs provenance certificates.

**Option B: Redeploy with ID rotation (current approach)**  
New WASM → new ID → repoint consumers. Old contract is permanently on-chain and unchanged. No upgrade vector means no admin-key-compromise-silently-changes-contract-logic risk. Rollback is a config change, not an on-chain operation. Downside: consumers must be updated on every upgrade; state from the old contract is not automatically accessible in the new one.

**Option C: Hybrid — upgradeable registry, immutable oracle and provenance**  
Make only the registry upgradeable (since it is the trust anchor and may need hash rotation logic updated) while keeping oracle and provenance immutable. Reduces the attack surface while giving flexibility where it matters most. Deferred as a future evolution — introduces two deployment models to maintain.

## Decision

Continue with **Option B (redeploy with ID rotation)** for all three contracts, and formalise the upgrade process with safety tooling and documentation rather than retrofitting upgrade mechanisms.

The key reasons:

- The provenance contract's core value proposition is **immutability** — a certificate holder should be able to verify that the contract logic that produced their certificate has not changed. In-place upgrades undermine this for existing certificates.
- The admin-gap issue in the registry must be resolved before mainnet regardless; retrofitting an upgrade mechanism adds another admin-controlled operation that needs the same fix.
- The tooling introduced alongside this decision (`scripts/upgrade-safety-check.sh`, `scripts/verify-deployment.sh`, `docs/operations/contract-upgrade-safety.md`) addresses the practical risks of redeploy upgrades: storage incompatibility, consumer misconfiguration, and missing rollback records.
- If a future governance decision determines that in-place upgradeability is necessary (e.g. for the registry's TEE hash rotation logic), that should be a new ADR that explicitly accepts the trust model change.

## Consequences

**Easier:**
- No admin key can silently change the on-chain logic that backs certificates already minted.
- Old contract state remains permanently accessible. There is no data-loss window during an upgrade.
- Rollback is a consumer-side config change requiring no on-chain transaction.
- The upgrade tooling (`upgrade-safety-check.sh`, `verify-deployment.sh`) catches storage incompatibilities and smoke-tests the new deploy before consumers are repointed.

**Harder:**
- Every upgrade changes the contract ID. All consumers must update their configs.
- State accumulated under the old contract (certificates, requests, provider reputations) is not accessible from the new contract unless explicitly carried over via an off-chain migration.
- As the contract set grows, keeping consumers' config maps in sync across upgrades requires discipline (solved by the deployment log and structured upgrade checklist).

**Known follow-up work:**
- Fix the registry admin gap (`registry.register` must verify the caller against a stored admin address) before any mainnet deployment. Track as a prerequisite in the deployment checklist.
- Decide whether the registry should adopt Option C (in-place upgradeable) as the TEE hash rotation use case matures. Open a new ADR when that decision is ready.

## Related

- `docs/operations/contract-upgrade-safety.md` — full upgrade process, storage compat rules, rollback procedures
- `scripts/upgrade-safety-check.sh` — pre-deploy static safety checks
- `scripts/verify-deployment.sh` — post-deploy smoke tests
- `docs/operations/deployment-log.md` — permanent contract ID record
- `docs/deployment.md` — general deployment guide
- ADR-0002 — why Soroban; immutability as a design property
