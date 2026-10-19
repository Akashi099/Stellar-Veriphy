# Provenance Consent and Permission Model

This document defines the consent and permission model governing how provenance data can be viewed, verified, re-used, and modified across creators, verifiers, and administrators. Closes #659.

Ambiguity in access rules is a direct operational and legal risk. This model removes that ambiguity by stating, in product-enforceable terms, who can do what, and under what consent conditions.

---

## Roles

| Role | Description |
|---|---|
| **Creator** | The Stellar address that submitted the original verification request and owns the resulting provenance certificate. |
| **Verifier** | An oracle provider registered in `contracts/registry`, authorized to run TEE-backed verification and attest results. |
| **Admin** | The contract admin address stored in `contracts/oracle`, `contracts/provenance`, and `contracts/registry`. |
| **Consumer** | Any third party (user, API client, integration) that reads provenance data without modifying it. |

---

## Permission Matrix

| Action | Creator | Verifier | Admin | Consumer |
|---|---|---|---|---|
| View own certificate | Yes | Yes (assigned) | Yes | With consent |
| View others' certificates | No | No | Yes | With consent |
| Submit verification request | Yes | No | Yes | No |
| Execute verification (TEE) | No | Yes | No | No |
| Mint provenance certificate | No | Yes (via oracle) | No | No |
| Transfer certificate | Yes (own) | No | No | No |
| Revoke certificate | Yes (own) | No | Yes | No |
| Lock certificate | Yes (own) | No | Yes | No |
| Modify manifest metadata | Yes (own, pre-mint) | No | No | No |
| Register/remove oracle provider | No | No | Yes | No |
| Approve TEE code hash | No | No | Yes | No |
| Pause / unpause oracle | No | No | Yes | No |
| Slash provider stake | No | No | Yes | No |
| View aggregated analytics | No | No | Yes | With consent |

---

## Consent Scopes

Consent is required when a Consumer or third-party integration accesses data beyond what is publicly committed on-chain.

### Defined Scopes

| Scope | What it permits | Who grants |
|---|---|---|
| `read:certificate` | Read the content, manifest, and verification status of a specific certificate | Creator (owner) |
| `read:analytics` | Read aggregate verification and usage analytics | Admin |
| `share:provenance` | Allow a third party to present or re-publish provenance data | Creator |
| `verify:delegate` | Authorize another address to submit verification requests on behalf of the creator | Creator (via `oracle.authorize_delegate`) |
| `write:manifest` | Allow metadata amendment prior to certificate minting | Creator |
| `admin:registry` | Manage providers and TEE code hashes | Admin only — not grantable to users |

Scope strings map to the existing API key scope model in `frontend/components/APIKeyManagement.tsx` (`read:certificates`, `write:verifications`, `read:analytics`, `admin:registry`).

### Consent Grant Lifecycle

1. **Request** — A Consumer or integration requests one or more scopes from the relevant grantor.
2. **Grant** — The grantor explicitly approves. Grants are recorded in the audit log (`frontend/lib/security/auditLogger.ts`).
3. **Use** — The grantee exercises the permission within the approved scope. Each use is logged.
4. **Revoke** — The grantor can revoke at any time; revocation takes effect immediately for all future requests. Revocation is logged.

---

## Enforcement Points

Unauthorized access is blocked at two independent layers:

### Contract Layer (on-chain)

Every privileged write on `contracts/oracle`, `contracts/provenance`, and `contracts/registry` uses Soroban's `require_auth()` before any state mutation. Address comparisons are made against values set at contract initialization — there is no role lookup that could be manipulated at runtime. See `SECURITY.md` section 5.

Relevant enforcement:
- Certificate transfer and revocation: `contracts/provenance` checks the certificate owner.
- Provider operations: `contracts/oracle` checks the stored `Admin` address.
- TEE hash registration: `contracts/registry` checks the stored `Admin` address (known gap — see `SECURITY.md` Known Risks).

### Application Layer (off-chain)

`frontend/lib/security/permissionModel.ts` exposes `checkPermission(actor, action, resource)` which gates all API-layer access decisions. It enforces scope checks, consent grant presence, and blocks any action not explicitly permitted by this model.

API routes that handle certificate or provenance data must call `checkPermission` before reading or writing. Routes that skip this check must be treated as a security defect.

---

## Consent Requirements by Product Flow

| Flow | Consent required? | Notes |
|---|---|---|
| Creator submits verification | No | Creator is acting on own content |
| Verifier runs TEE verification | No | Verifier is fulfilling a submitted request |
| Consumer reads own certificate via API | `read:certificate` | Granted by the certificate owner |
| Consumer reads another user's certificate | `read:certificate` | Requires explicit owner consent; not grantable by admin on behalf of users |
| Third-party re-publishes provenance data | `share:provenance` | Required for any redistribution, embedding, or republication |
| Delegate submits requests on behalf of creator | `verify:delegate` | Recorded on-chain via `oracle.authorize_delegate` |
| Analytics dashboard reads aggregate data | `read:analytics` | Granted by admin; no per-certificate owner consent needed for aggregated, non-identifying data |

---

## Audit and Accountability

Every consent grant, revocation, and use must be recorded in `auditLogger.ts` with:
- `actor`: the Stellar address performing the action
- `category`: `"admin"` for admin grants, `"auth"` for user grants
- `action`: `"consent_granted"`, `"consent_revoked"`, `"permission_checked"`, or `"permission_denied"`
- `severity`: `"info"` for granted/used, `"warning"` for denied

This provides a tamper-evident record for compliance and incident response.

---

## Related Documents

- `SECURITY.md` — full threat model and security controls
- `docs/security/key-management.md` — key custody and API key scope model
- `docs/adr/0004-tee-oracle-trust-model.md` — TEE trust chain
- `contracts/IMPLEMENTATION.md` — auth patterns in contracts
- `frontend/lib/security/permissionModel.ts` — code implementation of this model
