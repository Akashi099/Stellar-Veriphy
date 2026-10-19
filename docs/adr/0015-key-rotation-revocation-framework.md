# ADR-0015: Cryptographic Key Rotation and Revocation Framework

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** Security, Platform, Operations

## Context

StellarVeriphy manages five distinct key categories (TEE enclave keys, Stellar deployer/admin keys, oracle provider signing keys, application API keys, CI/CD deployment credentials) with different owners, rotation cadences, and risk profiles.  Before this ADR, rotation and revocation procedures were partially described in `docs/security/key-management.md` but were:

- Not codified as machine-readable data structures.
- Not enforced by a consistent decision function.
- Lacking structured emergency procedures that operators could consume without reading prose documentation under stress.

Alternatives considered:

- **Rely solely on prose runbooks** — accessible but hard to keep consistent with code changes; no machine-readable audit trail.
- **External secrets manager (HashiCorp Vault, AWS KMS)** — appropriate for production credential storage but does not provide the governance layer (rotation policy evaluation, action plans) specific to StellarVeriphy's key categories.
- **Typed TypeScript module with pure functions** — the chosen approach: consistent with the existing policy engine pattern, testable, and consumable by both the frontend (operator dashboards) and automated scripts.

## Decision

Implement `packages/shared/key-lifecycle/index.ts` — a typed key lifecycle framework that exposes:

- `evaluateKeyRotationPolicy` — pure function; determines rotation status from key metadata and current time.
- `buildRotationPlan` — produces an ordered, category-specific action plan for a given trigger.
- `buildRevocationEvent` — stamps a standardised revocation record for the audit trail.
- `evaluateEmergencyRevocation` — gates break-glass revocations; enforces two-person integrity for critical key categories.
- `DEFAULT_EMERGENCY_PROCEDURES` — structured emergency procedures per category, eliminating the need to read prose under incident conditions.

The framework integrates with the existing audit logger (`frontend/lib/security/auditLogger.ts`) and the registry governance model (ADR-0016).

## Consequences

- Rotation policy decisions are now deterministic and testable (same inputs → same outcome).
- Emergency procedures are machine-readable; operators and runbooks consume the same data structure.
- Two-person integrity is enforced structurally for `tee_enclave`, `stellar_deployer`, `oracle_provider`, and `ci_cd` categories; single-approver path is only available for `api_key`.
- The framework does not store keys — it only models lifecycle decisions.  Callers are responsible for persisting state.
- A persistent key registry (database or KV store) will be needed in production to back the in-memory model; this is deferred as a follow-up.
