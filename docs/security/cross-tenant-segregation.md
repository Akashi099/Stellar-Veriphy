# Cross-Tenant Data Segregation

This document describes how StellarVeriphy enforces data segregation, permission
boundaries, and operational isolation across organisational or application tenants.

Closes #687.

> **Warning:** The implementation described here is the design-phase
> specification. Do not test; implement only.

---

## Overview

Every resource in StellarVeriphy — certificates, verification jobs, oracle
records, manifests — carries an opaque `tenantId` string. The
`packages/shared/tenant/index.ts` module provides:

- A `TenantRegistry` that stores tenant records and cross-tenant grants.
- `evaluateTenantAccess`, a pure function that determines whether a given
  actor may perform an action on a resource owned by another tenant.
- Three data-isolation levels (`shared`, `namespace`, `strict`) that map
  to different infrastructure tiers.

---

## Tenant tiers and default isolation

| Tier         | Default isolation | Cross-tenant allowed by default | Audit all access |
| ------------ | ----------------- | ------------------------------- | ---------------- |
| `free`       | `shared`          | No                              | No               |
| `standard`   | `shared`          | No                              | No               |
| `enterprise` | `strict`          | No                              | Yes              |
| `platform`   | `strict`          | Yes                             | Yes              |

Enterprise and platform tenants must explicitly set `allowCrossTenant: true`
in their `TenantPolicy` and the other party must do the same before any
cross-tenant grant can be issued.

---

## Data-isolation levels

### `shared`

Data lives in a shared collection or table. Access is filtered at the
application layer by `tenantId`.

- Suitable for free and standard tenants.
- Lowest operational overhead.
- Relies on correct query filtering; application bugs could leak data.

### `namespace`

Data lives in a dedicated namespace, schema, or collection prefix within
shared infrastructure (e.g. a MongoDB collection per tenant or a Postgres
schema per tenant).

- Reduces the blast radius of application bugs.
- Still shares the same database process.

### `strict`

Data lives in fully dedicated infrastructure (separate database instance,
separate storage bucket).

- Maximum isolation; required for enterprise and platform tenants.
- Highest operational overhead; provisioned separately per tenant.

---

## Cross-tenant grants

By default all cross-tenant access is denied. To allow tenant A to read
certificates owned by tenant B:

1. Both tenants must have `policy.allowCrossTenant = true`.
2. Tenant B (the grantor) calls `TenantRegistry.issueGrant` with a
   `CrossTenantGrant` that lists the permitted `actions` and an optional
   `expiresAt`.
3. `evaluateTenantAccess` then returns `allowed: true` with
   `reason: "explicit_grant"` when tenant A requests the permitted action on
   tenant B's resources.

Grants can be revoked at any time via `TenantRegistry.revokeGrant`.

---

## Access-decision flow

```
Actor request
      │
      ▼
Is actor tenant registered and active?   ──No──▶ DENY (actor_tenant_unknown / inactive)
      │
      ▼
Is resource tenant registered and active? ─No──▶ DENY (resource_tenant_unknown / inactive)
      │
      ▼
Same tenant?                             ──Yes─▶ ALLOW (same_tenant)
      │
      ▼
Actor is SYSTEM tenant?                  ──Yes─▶ ALLOW (platform_override)
      │
      ▼
Resource policy trustedTenants includes actor? ──Yes─▶ ALLOW (trusted_tenant)
      │
      ▼
Both policies allow cross-tenant?        ──No──▶ DENY (cross_tenant_denied)
      │
      ▼
Active cross-tenant grant covers action? ──Yes─▶ ALLOW (explicit_grant)
      │
      ▼
DENY (cross_tenant_denied / action_not_granted)
```

---

## Permission boundaries

- **Admins** operate within their own tenant only. A tenant admin cannot
  modify the policy of another tenant.
- **Consumers and creators** are scoped to their own tenant's resources.
- **The SYSTEM tenant** (`__stellarveriphy_system__`) has platform-wide read
  access for operational purposes (audit, support) but its access is logged.
- **Anonymous actors** (`__anonymous__`) are always denied; no policy grants
  are issued to or from the anonymous tenant.

---

## Testability

`evaluateTenantAccess` is a pure function. Every segregation rule can be
verified by constructing a `TenantRegistry` with specific tenant records and
grants and asserting the resulting `TenantAccessDecision`.

Example test pattern:

```typescript
const registry = new TenantRegistry();
registry.register({ id: asTenantId("t1"), displayName: "T1", tier: "standard" });
registry.register({ id: asTenantId("t2"), displayName: "T2", tier: "standard" });

const result = evaluateTenantAccess({
  actorTenantId: asTenantId("t1"),
  resourceTenantId: asTenantId("t2"),
  action: "read:certificate",
  registry,
});

assert(result.allowed === false);
assert(result.reason === "cross_tenant_denied");
```

---

## Scalability considerations

- The `TenantRegistry` is intentionally an in-memory `Map` for the initial
  implementation. Replace it with a persistent store (MongoDB, Redis) for
  multi-process deployments.
- `evaluateTenantAccess` is synchronous and O(n) in the number of inbound
  grants for the actor tenant. For tenants with many grants, cache the grant
  lookup by `(actorId, grantorId, action)`.
- Tenant records should be cached in the API layer; every request does not need
  to hit the backing store for the tenant lookup.

---

## Related

- `packages/shared/tenant/index.ts` — implementation
- `docs/adr/0011-cross-tenant-data-segregation.md` — decision record
- `docs/security/key-management.md` — key custody per tenant tier
- `frontend/lib/security/permissionModel.ts` — role-level permission model
