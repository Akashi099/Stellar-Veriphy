# Cryptographic Key Rotation and Revocation Framework

> **Related issue:** Closes #679  
> **See also:** `packages/shared/key-lifecycle/index.ts`, `docs/security/key-management.md`

---

## Overview

This document describes the complete lifecycle for every signing and verification key in StellarVeriphy: how keys are created, when they must be rotated, how they are revoked, how each event is recorded in the audit trail, and what operators do in an emergency.

The framework is implemented as a pure TypeScript module (`packages/shared/key-lifecycle/index.ts`) that exposes:

- `evaluateKeyRotationPolicy` — determines whether a key is past its rotation window.
- `buildRotationPlan` — produces a concrete, ordered action plan for rotating a specific key category.
- `buildRevocationEvent` — stamps a consistent revocation record for the audit trail.
- `evaluateEmergencyRevocation` — gates break-glass procedures with two-person integrity where required.
- `summariseKeyLifecycle` — produces a dashboard-ready summary across all tracked keys.

---

## Key categories

| Category | Owner | Purpose | Storage |
|---|---|---|---|
| `tee_enclave` | AWS Nitro Enclave | Signs attestation proofs | Generated and held inside the enclave; never exported |
| `stellar_deployer` | Platform admin | Deploys and administers contracts | Local `stellar keys` identity (testnet) / hardware wallet (mainnet) |
| `oracle_provider` | Oracle node operator | Signs verification attestations submitted to the oracle contract | Oracle node operator's secure storage |
| `api_key` | End user | Authorises verification API calls | One-time reveal; hash stored client-side |
| `ci_cd` | GitHub Actions | Deploys container images | GitHub Environment encrypted secrets |

---

## Rotation policy

### Decision logic

`evaluateKeyRotationPolicy` examines three signals in priority order:

1. **Hard expiry elapsed** — key is `expired`; immediate replacement required.
2. **Hard expiry imminent (≤7 days)** — `rotation_required`; must rotate before expiry.
3. **Rotation interval exceeded** — compare `lastRotatedAt` (or `createdAt`) to `rotationIntervalDays`:
   - ≥ 1.5× interval → `rotation_required` (overdue).
   - ≥ 1× interval → `rotation_recommended` (schedule rotation).
   - Otherwise → `no_rotation_needed`.
4. **Key already revoked** — `already_revoked`; rotation is moot.

### Rotation intervals by category

| Category | Recommended interval | Trigger conditions |
|---|---|---|
| `tee_enclave` | Event-driven (enclave rebuild) | New enclave image, suspected compromise |
| `stellar_deployer` | 365 days (mainnet) | Suspected compromise, contributor offboarding, annual cadence |
| `oracle_provider` | 180 days | Suspected compromise, provider offboarding |
| `api_key` | User-defined (max 365 days) | User-initiated, expiry, suspected compromise |
| `ci_cd` | 90 days | Suspected compromise, contributor offboarding |

---

## Rotation triggers

| Trigger code | Description |
|---|---|
| `scheduled` | Routine time-based rotation |
| `suspected_compromise` | Potential breach or leak detected |
| `confirmed_compromise` | Key material confirmed leaked |
| `contributor_offboarding` | Personnel change; remove departing contributor's access |
| `policy_update` | Algorithm or key-length policy changed |
| `enclave_rebuild` | New TEE image produced a new key pair |
| `user_initiated` | End user requested rotation |
| `expiry_imminent` | Within 7 days of hard expiry |
| `audit_finding` | Security review recommended rotation |

---

## Rotation action plans

`buildRotationPlan` produces an ordered list of steps tailored to the key category and trigger.  For `suspected_compromise` and `confirmed_compromise` triggers the plan sets `requiresTwoPersonIntegrity = true`, requiring a second approver before execution.

See `packages/shared/key-lifecycle/index.ts` — `buildStepsForCategory` — for the full step sequences for each category.

After executing a rotation plan, operators must complete the **verification checks** returned in `plan.verificationChecks` before closing the incident.

---

## Revocation

### Revocation reasons

| Reason code | When to use |
|---|---|
| `key_compromise` | Key material was exposed or leaked |
| `superseded` | A newer key takes over all duties |
| `policy_violation` | Operator violated usage policy |
| `account_closure` | Owner account closed |
| `emergency_response` | Break-glass procedure activated |
| `administrative` | Platform admin decision |
| `expired` | Hard deadline elapsed without renewal |

### Audit event

`buildRevocationEvent` produces a `KeyRevocationEvent` record with:

- `eventId` — deterministic, derived from `keyId + revokedAt`.
- `emergency` — flag set automatically for `key_compromise` and `emergency_response` reasons.
- `successorKeyId` — links this event to the replacement key for audit trail continuity.

Feed the event into `frontend/lib/security/auditLogger.ts` to enter it into the tamper-evident hash-chained log.

---

## Emergency response

### Gate

`evaluateEmergencyRevocation` enforces the following gates before authorising break-glass revocation:

1. **Non-empty justification** — operators must supply a reason; an empty field is rejected with `missing_justification`.
2. **Two-person integrity** — `tee_enclave`, `stellar_deployer`, `oracle_provider`, and `ci_cd` keys require a second approver (`requiresTwoPersonIntegrity = true`).  Only `api_key` allows a single approver.
3. **Already-revoked check** — if the key is already revoked, the gate returns `already_revoked` to prevent duplicate events.

### Default emergency procedures

Each key category has a default `EmergencyProcedure` in `DEFAULT_EMERGENCY_PROCEDURES`:

| Category | Owner | Two-person integrity required |
|---|---|---|
| `tee_enclave` | Platform / Security | Yes |
| `stellar_deployer` | Platform Admin | Yes |
| `oracle_provider` | Oracle Operator / Platform Security | Yes |
| `api_key` | End User / Platform Support | No |
| `ci_cd` | Platform Admin | Yes |

See `packages/shared/key-lifecycle/index.ts` — `DEFAULT_EMERGENCY_PROCEDURES` — for the full ordered step lists for each category.

---

## Governance integration

Key rotation and revocation events that affect the shared trust anchor set (`tee_enclave` and `oracle_provider` keys) must go through the multi-tenant registry governance proposal flow defined in `packages/shared/registry-governance/index.ts`.  Specifically:

- Adding or removing a TEE code hash requires a `register_tee_hash` / `revoke_tee_hash` proposal with the tenant's approval threshold met.
- Adding or removing an oracle provider key requires a `register_provider_key` / `revoke_provider_key` proposal.
- Emergency revocations bypass the proposal flow but require two-person integrity confirmation.

---

## References

- `packages/shared/key-lifecycle/index.ts` — implementation
- `docs/security/key-management.md` — key inventory and custody model
- `docs/security/tee-attestation-service.md` — TEE key generation and rotation
- `docs/deployment/ci-cd-pipeline.md` — CI/CD credential rotation
- `docs/adr/0004-tee-oracle-trust-model.md` — why the TEE key model was chosen
- `frontend/lib/security/auditLogger.ts` — audit log persistence
