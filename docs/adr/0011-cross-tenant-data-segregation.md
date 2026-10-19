# ADR-0011: Cross-Tenant Data Segregation Model

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** Architecture, Security, Governance

## Context

StellarVeriphy is growing toward enterprise adoption, where multiple independent
organisations ("tenants") share the same platform infrastructure. Without explicit
tenant boundaries, data from one organisation can leak to another through shared
database queries, analytics endpoints, or API responses. This is both a security
risk and a contractual liability.

The problem has three dimensions:

1. **Data isolation** — certificates, verification jobs, and oracle records must
   only be visible to the owning tenant and explicitly permitted peers.
2. **Permission boundaries** — admin and user roles within one tenant must not
   grant any authority in another tenant's namespace.
3. **Scalability** — the solution must not require per-tenant infrastructure by
   default; shared-infrastructure tenants (free/standard tier) and dedicated-
   infrastructure tenants (enterprise/platform tier) should be handled by the
   same policy engine.

Alternatives considered:

- **Database-per-tenant (always)** — provides the strongest isolation but is
  operationally expensive and unnecessary for lower-tier tenants.
- **Row-level security in PostgreSQL** — good but couples isolation to a
  specific database technology; IPFS and MongoDB need separate handling.
- **Policy-driven registry with tiered isolation levels** — the chosen approach.
  It is technology-agnostic and allows the isolation level to evolve per tenant.

## Decision

Implement a policy-driven tenant registry (`packages/shared/tenant/index.ts`)
that assigns every resource a `tenantId` and enforces access decisions through
a pure `evaluateTenantAccess` function.

Key properties:

- **Three isolation levels** — `shared` (filtered queries), `namespace`
  (dedicated namespace/schema), and `strict` (dedicated infrastructure).
  Enterprise/platform tenants default to `strict`; free/standard default to
  `shared`.
- **Explicit cross-tenant grants** — cross-tenant access is denied by default.
  A `CrossTenantGrant` must be issued by both parties (both must have
  `allowCrossTenant: true`) before any cross-tenant action succeeds.
- **SYSTEM tenant bypass** — the built-in `__stellarveriphy_system__` tenant
  may access any resource for operational purposes (audit, support), subject
  to its own policy.
- **Audit trail** — every access decision includes a `reason`, the resource
  tenant's `policyVersion`, and the `appliedGrant` (if any) so historical
  decisions can be reconstructed from logs.

## Consequences

**Easier:**

- Tenant boundaries are explicit and enforceable in code, not convention.
- Adding a new tenant requires only a `TenantRegistry.register` call; no schema
  migrations needed for shared-tier tenants.
- Cross-tenant sharing can be enabled incrementally per tenant pair without
  global changes.

**Harder:**

- Every resource creation must stamp a `tenantId`; existing records need a
  migration to assign a default tenant (or a backfill script).
- The in-memory registry must be backed by a persistent store (database, KV)
  before multi-process deployments can share tenant state.
- `strict`-tier tenants require operational provisioning of dedicated
  infrastructure, which is out of scope for the current MVP.

**Known limitations:**

- The registry is currently in-memory and does not survive process restarts.
  Follow-up work should persist tenant records and grants to MongoDB or a
  dedicated KV store.
- Cross-tenant grant expiry is checked at evaluation time but expired grants
  are not automatically pruned; a background task should run `revokeGrant`
  for expired entries.

Closes #687.
