# Multi-Tenant Registry Governance Model

> **Related issue:** Closes #678  
> **See also:** `packages/shared/registry-governance/index.ts`, `packages/shared/tenant/index.ts`, `contracts/registry/src/lib.rs`

---

## Overview

This document defines how multiple organisations, creators, and verifiers share the StellarVeriphy registry without cross-tenant contamination, data leakage, or governance conflicts.

The model is implemented in `packages/shared/registry-governance/index.ts` and operates as a governance layer on top of the on-chain `contracts/registry` contract.  The on-chain contract enforces cryptographic trust anchors; this governance layer enforces organisational boundaries, approval workflows, and role-based access controls that cannot be efficiently expressed on-chain.

---

## Design goals

| Goal | How achieved |
|---|---|
| No cross-tenant contamination | Every registry entry (`OwnedRegistryEntry`) carries an `ownerTenantId`; reads across tenant lines are denied unless an explicit grant exists |
| Governance role clarity | Four tiers (`observer`, `operator`, `admin`, `platform`) with a fixed permissions matrix |
| Safe expansion | Adding a new tenant is additive; existing tenant policies are unchanged |
| Accountability | Every governance action produces a `GovernanceAuditEvent` for the audit log |
| Trustless proposals | Changes to the shared trust anchor set require a formal `GovernanceProposal` with a configurable approval threshold |

---

## Governance tiers

| Tier | Who | Key permissions |
|---|---|---|
| `observer` | Read-only consumers (e.g. relying parties) | Read registry entries |
| `operator` | Oracle node operators, creators | Submit proposals; view audit log |
| `admin` | Tenant administrators | Approve/reject proposals; revoke entries; manage members |
| `platform` | StellarVeriphy first-party services | All operations; cross-tenant read; global settings |

The permissions matrix is declared as `GOVERNANCE_PERMISSIONS` in `packages/shared/registry-governance/index.ts`.

---

## Tenant contexts

Each tenant is represented as a `RegistryTenantContext` with:

- `tenantId` — stable unique identifier.
- `tier` — governance tier.
- `approvalThreshold` — minimum approvals required for a proposal to execute (minimum 1; recommended ≥ 2 for `admin` and `platform`).
- `canReadCrossTenant` — whether the tenant may read entries owned by other tenants (only `platform` tenants should set this).
- `canProposeTrustAnchorChanges` — whether the tenant may propose TEE hash or provider key changes that affect the global trust set.

Tenant contexts are evaluated by `evaluateGovernanceAction` on every governance action, ensuring that:

1. Unknown tenants are rejected (`unknown_tenant`).
2. Inactive tenants are blocked (`tenant_inactive`).
3. Cross-tenant access is denied unless explicitly granted (`cross_tenant_denied`).
4. Role mismatches are caught before any state change is applied (`insufficient_role`).

---

## Isolation boundaries

### Data isolation

Every `OwnedRegistryEntry` specifies:

- `ownerTenantId` — the tenant that registered the entry.
- `allowedTenants` — an explicit list of other tenants that may reference the entry in verification jobs.

`isTenantReadAllowed` enforces this boundary in query paths.  The default is deny: unless the requestor is the owner, is `platform` tier, or is in `allowedTenants`, the entry is not returned.

### On-chain enforcement

The on-chain `contracts/registry` contract enforces that:

- Only registered oracle provider keys may submit attestations.
- Only approved TEE code hashes are accepted during attestation validation.

The governance layer decides *which* keys and hashes reach the on-chain contract.  An entry rejected by the governance layer is never submitted to the contract.

---

## Proposal workflow

Changes to the shared trust anchor set (TEE hashes, provider keys) and cross-tenant grants must go through a formal `GovernanceProposal`.  The following actions require a proposal:

- `register_tee_hash`
- `revoke_tee_hash`
- `register_provider_key`
- `revoke_provider_key`
- `grant_cross_tenant_access`
- `revoke_cross_tenant_access`
- `update_approval_threshold`

### Lifecycle

```
operator submits proposal
        ↓
      open
        ↓
admin approves (repeat until threshold met)
        ↓
     approved
        ↓
   (execute on-chain)
        ↓
     executed
```

Proposals expire after a configurable window (default: 7 days) if the threshold is not met.  Any admin may reject a proposal at any time, immediately setting its status to `rejected`.

### Approval model

`applyProposalApproval` enforces:

- Idempotency: the same approver cannot vote twice.
- Threshold transition: once `approvals.length >= approvalThreshold` the status automatically advances to `"approved"`.

`applyProposalRejection` implements a veto model: a single admin rejection moves the proposal to `"rejected"`.

---

## Emergency operations

Emergency revocations (triggered by key compromise or break-glass events) bypass the proposal flow but are gated by the key lifecycle framework (`packages/shared/key-lifecycle/index.ts — evaluateEmergencyRevocation`):

- Two-person integrity (2PI) is required for `tee_enclave` and `oracle_provider` entries.
- Emergency events produce a `GovernanceAuditEvent` with the `emergency_revoke` action type for retrospective review.

---

## Audit trail

Every call to `evaluateGovernanceAction` should be followed by a call to `buildGovernanceAuditEvent`, which produces a `GovernanceAuditEvent` record for:

- The actor's tenant and role.
- The action attempted and its outcome.
- The resource's owning tenant.
- The timestamp.

Feed audit events into `frontend/lib/security/auditLogger.ts` for tamper-evident storage.

---

## Operational guide for administrators

### Adding a new tenant

1. Create a `RegistryTenantContext` with the appropriate `tier` and `approvalThreshold`.
2. Register the context in the tenant registry (in-memory `Map`; backed by a persistent store in production).
3. Assign at least one `TenantMember` with role `admin` to the new tenant.
4. Verify that `evaluateGovernanceAction` returns `allowed` for the tenant's expected operations before activating.

### Granting cross-tenant access

1. The resource-owning tenant's `admin` submits a `grant_cross_tenant_access` proposal.
2. Once the approval threshold is met, update `OwnedRegistryEntry.allowedTenants` with the grantee tenant ID.
3. Record a `GovernanceAuditEvent` for the grant.

### Deactivating a tenant

Set `RegistryTenantContext.active = false`.  `evaluateGovernanceAction` will return `tenant_inactive` for all subsequent actions.  Existing on-chain entries owned by the tenant remain but cannot be updated until the tenant is reactivated or ownership is transferred via a proposal.

---

## References

- `packages/shared/registry-governance/index.ts` — implementation
- `packages/shared/tenant/index.ts` — cross-tenant data segregation model
- `contracts/registry/src/lib.rs` — on-chain registry contract
- `docs/security/cross-tenant-segregation.md` — data segregation policy
- `docs/adr/0011-cross-tenant-data-segregation.md` — ADR for the segregation model
- `docs/security/key-rotation-revocation.md` — key lifecycle framework
