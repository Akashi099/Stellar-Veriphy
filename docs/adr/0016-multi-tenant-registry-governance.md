# ADR-0016: Multi-Tenant Registry Governance Model

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** Architecture, Security, Governance

## Context

As StellarVeriphy scales to enterprise and institutional use, the registry (TEE code hashes, oracle provider keys) needs to be usable by multiple independent organisations without:

- One tenant accidentally or maliciously modifying another tenant's entries.
- A single admin being able to unilaterally change the shared trust anchor set.
- The model becoming too complex to audit or explain to new administrators.

`contracts/registry` already enforces cryptographic trust anchors on-chain.  What was missing was an off-chain governance layer that enforces organisational boundaries, approval workflows, and role-based access controls before entries reach the chain.

Alternatives considered:

- **Separate contract instance per tenant** — strongest isolation, but each instance has its own admin key and code hash set, making cross-tenant verification scenarios impossible without bespoke bridging.
- **Flat role-based access in a single contract** — simpler but cannot express multi-sig proposal workflows or cross-tenant trust grants without significant contract complexity.
- **Off-chain governance with on-chain enforcement** — the chosen approach: governance logic lives in `packages/shared/registry-governance/index.ts` (pure, auditable, testable); the on-chain contract remains the authoritative trust store.

## Decision

Implement `packages/shared/registry-governance/index.ts` — a governance layer that defines:

- Four governance tiers (`observer`, `operator`, `admin`, `platform`) with a fixed permissions matrix.
- `OwnedRegistryEntry` — every entry carries an `ownerTenantId` and an `allowedTenants` list.
- `GovernanceProposal` — a multi-sig proposal workflow for trust anchor changes.
- `evaluateGovernanceAction` — pure function; enforces tenant isolation, role checks, and proposal requirements.
- `isTenantReadAllowed` — lightweight guard for query paths.
- `buildGovernanceAuditEvent` — produces a structured audit event for every decision.

Actions that affect the shared trust anchor set (`register_tee_hash`, `revoke_tee_hash`, `register_provider_key`, `revoke_provider_key`, cross-tenant grants) are declared in `PROPOSAL_REQUIRED_ACTIONS` and always require a passing proposal.

## Consequences

- No single operator can unilaterally change the trust anchor set; every change requires approval from the tenant's threshold (minimum 1, recommended ≥2 for `admin` / `platform`).
- Cross-tenant reads are denied by default; explicit grants are required and audited.
- Adding a new tenant is additive and does not affect existing tenants' policies.
- The in-memory `Map`-backed registry must be replaced with a persistent store (database) in production; the interface (`Map<string, RegistryTenantContext>`) is the same.
- The governance layer operates off-chain; on-chain enforcement still relies on `contracts/registry` admin checks.  Closing the existing admin-check gap in the contract (see `docs/deployment.md#contract-initialization`) remains a prerequisite for production deployment.
