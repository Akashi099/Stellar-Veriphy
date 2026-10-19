/**
 * packages/shared/tenant/index.ts
 *
 * Cross-tenant data segregation model for StellarVeriphy. (#687)
 *
 * This module defines the policy-driven model that separates data,
 * permissions, and operational processes across organisational or
 * application tenants so that StellarVeriphy can support enterprise-ready,
 * multi-tenant deployments without hidden trust leaks.
 *
 * ## Design principles
 *
 * - **Explicit boundaries** – every resource (certificate, verification job,
 *   oracle record) carries a `tenantId`.  The engine rejects access requests
 *   that cross tenant lines unless an explicit cross-tenant trust relationship
 *   has been granted.
 * - **Policy-driven** – segregation rules live in `TenantPolicy` objects, not
 *   hard-coded conditionals.  Changing a rule for one tenant does not require
 *   touching unrelated tenants.
 * - **Testable** – `evaluateTenantAccess` is a pure function: same inputs →
 *   same `TenantAccessDecision`.  No side effects, no network calls.
 * - **Scalable** – the registry is an in-memory `Map`; in production it would
 *   be backed by a persistent store (database, KV cache) but the interface
 *   stays the same.
 * - **Auditable** – every access decision includes a `reason` field and the
 *   policy version that produced it, so audit trails can reconstruct any
 *   decision after the fact.
 *
 * ## Quick start
 *
 * ```typescript
 * import {
 *   registerTenant,
 *   evaluateTenantAccess,
 *   SYSTEM_TENANT_ID,
 * } from "@stellarveriphy/shared/tenant";
 *
 * registerTenant({
 *   id: "acme-corp",
 *   displayName: "Acme Corp",
 *   tier: "enterprise",
 *   policy: { dataIsolation: "strict", allowCrossTenant: false },
 * });
 *
 * const decision = evaluateTenantAccess({
 *   actorTenantId: "acme-corp",
 *   resourceTenantId: "beta-corp",
 *   action: "read:certificate",
 *   registry: tenantRegistry,
 * });
 * // decision.allowed === false, decision.reason === "cross_tenant_denied"
 * ```
 *
 * @module shared/tenant
 */

// ---------------------------------------------------------------------------
// Tenant tiers
// ---------------------------------------------------------------------------

/**
 * Capability tier for a tenant.
 *
 * - `free` – limited rate, no cross-tenant access, basic isolation.
 * - `standard` – production-grade isolation, no cross-tenant.
 * - `enterprise` – strict isolation by default; optional cross-tenant grants.
 * - `platform` – reserved for first-party StellarVeriphy infrastructure.
 *   A `platform` tenant may read resources from any other tenant for
 *   operational purposes (audit, support) subject to its own policy.
 */
export type TenantTier = "free" | "standard" | "enterprise" | "platform";

// ---------------------------------------------------------------------------
// Data-isolation level
// ---------------------------------------------------------------------------

/**
 * How tightly a tenant's data is isolated from other tenants.
 *
 * - `shared` – data lives in a shared collection/table; queries are filtered
 *   by `tenantId` at the application layer.
 * - `namespace` – data lives in a dedicated namespace or schema within a
 *   shared infrastructure (e.g. a MongoDB collection prefix or Postgres schema).
 * - `strict` – data lives in fully dedicated infrastructure (separate DB,
 *   separate storage bucket).  Only available to `enterprise` and `platform`
 *   tiers.
 */
export type DataIsolationLevel = "shared" | "namespace" | "strict";

// ---------------------------------------------------------------------------
// Tenant actions
// ---------------------------------------------------------------------------

/**
 * Actions that can be evaluated against tenant boundaries.
 * Mirrors the `ProvenanceAction` union in `frontend/lib/security/permissionModel.ts`
 * but scoped to cross-tenant access decisions.
 */
export type TenantScopedAction =
  | "read:certificate"
  | "write:certificate"
  | "read:job"
  | "write:job"
  | "read:oracle"
  | "read:analytics"
  | "admin:tenant";

// ---------------------------------------------------------------------------
// Cross-tenant trust grant
// ---------------------------------------------------------------------------

/**
 * An explicit grant that allows one tenant to access resources owned by
 * another.  Without a matching grant any cross-tenant access is denied.
 */
export interface CrossTenantGrant {
  /** The tenant that is being given access. */
  grantee: TenantId;
  /** The tenant whose resources are being exposed. */
  grantor: TenantId;
  /** The actions allowed under this grant. */
  actions: TenantScopedAction[];
  /** ISO 8601 timestamp when this grant was created. */
  grantedAt: string;
  /** ISO 8601 expiry; absent means the grant does not expire. */
  expiresAt?: string;
  /** Human-readable reason for the grant (for audit trails). */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Tenant policy
// ---------------------------------------------------------------------------

/**
 * Segregation rules for a single tenant.  All fields have conservative
 * defaults — prefer opt-in over opt-out for security-relevant settings.
 */
export interface TenantPolicy {
  /**
   * Data-isolation level.  Defaults to `"shared"` for free/standard tenants,
   * `"strict"` for enterprise/platform tenants.
   */
  dataIsolation: DataIsolationLevel;
  /**
   * Whether this tenant may receive or issue cross-tenant grants.
   * Defaults to `false`.  Must be `true` for any `CrossTenantGrant` to be
   * honoured.
   */
  allowCrossTenant: boolean;
  /**
   * Optional allow-list of tenant IDs that this tenant can access even
   * without an explicit grant (e.g. a shared read-only data lake tenant).
   * Evaluated before `allowCrossTenant`.
   */
  trustedTenants?: TenantId[];
  /**
   * Maximum number of concurrent verification jobs this tenant may have
   * in the `processing` state.  `0` means unlimited.
   */
  maxConcurrentJobs: number;
  /**
   * Rate limit: maximum verification requests per 24 h window.
   * `0` means unlimited.
   */
  dailyVerificationLimit: number;
  /**
   * If `true`, all data-access decisions for this tenant are emitted as
   * audit log entries regardless of outcome.  Defaults to `true` for
   * enterprise/platform; `false` otherwise.
   */
  auditAllAccess: boolean;
  /** Semantic version of this policy object (for audit trails). */
  policyVersion: string;
}

// ---------------------------------------------------------------------------
// Tenant registration record
// ---------------------------------------------------------------------------

/** Opaque string brand for tenant identifiers. */
export type TenantId = string & { readonly __tenantId: unique symbol };

/** Cast a plain string to a `TenantId` (safe at the type level only). */
export function asTenantId(value: string): TenantId {
  return value as TenantId;
}

/**
 * A registered tenant in the StellarVeriphy multi-tenant registry.
 */
export interface TenantRecord {
  id: TenantId;
  displayName: string;
  tier: TenantTier;
  policy: TenantPolicy;
  /** ISO 8601 registration timestamp. */
  registeredAt: string;
  /**
   * Whether this tenant is currently active.  Inactive tenants are denied
   * all access regardless of policy.
   */
  active: boolean;
  /** Cross-tenant grants issued *to* this tenant by other tenants. */
  inboundGrants: CrossTenantGrant[];
  /** Cross-tenant grants this tenant has issued *to* others. */
  outboundGrants: CrossTenantGrant[];
}

// ---------------------------------------------------------------------------
// Well-known tenant IDs
// ---------------------------------------------------------------------------

/** Reserved tenant ID for StellarVeriphy's own platform services. */
export const SYSTEM_TENANT_ID = asTenantId("__stellarveriphy_system__");

/** Sentinel used when no tenant context is available (e.g. unauthenticated). */
export const ANONYMOUS_TENANT_ID = asTenantId("__anonymous__");

// ---------------------------------------------------------------------------
// Default policy helpers
// ---------------------------------------------------------------------------

/**
 * Returns a conservative default `TenantPolicy` appropriate for the given
 * tier.  Enterprise and platform tenants get `strict` isolation and audit
 * logging enabled.
 */
export function defaultPolicyForTier(tier: TenantTier): TenantPolicy {
  const isPrivileged = tier === "enterprise" || tier === "platform";
  return {
    dataIsolation: isPrivileged ? "strict" : "shared",
    allowCrossTenant: false,
    trustedTenants: [],
    maxConcurrentJobs: tier === "free" ? 5 : 0,
    dailyVerificationLimit: tier === "free" ? 100 : 0,
    auditAllAccess: isPrivileged,
    policyVersion: "1.0.0",
  };
}

// ---------------------------------------------------------------------------
// Tenant registry
// ---------------------------------------------------------------------------

/**
 * In-memory tenant registry.  In a production deployment this would be backed
 * by a persistent data store; the interface is kept the same so swapping the
 * backing store is a single-file change.
 */
export class TenantRegistry {
  private readonly tenants = new Map<TenantId, TenantRecord>();

  /**
   * Register a new tenant.  Throws if the tenant ID is already registered.
   *
   * @param params - Tenant registration parameters.
   * @returns The created `TenantRecord`.
   */
  register(params: {
    id: TenantId;
    displayName: string;
    tier: TenantTier;
    policy?: Partial<TenantPolicy>;
  }): TenantRecord {
    if (this.tenants.has(params.id)) {
      throw new Error(`Tenant "${params.id}" is already registered`);
    }

    const basePolicy = defaultPolicyForTier(params.tier);
    const policy: TenantPolicy = { ...basePolicy, ...(params.policy ?? {}) };

    const record: TenantRecord = {
      id: params.id,
      displayName: params.displayName,
      tier: params.tier,
      policy,
      registeredAt: new Date().toISOString(),
      active: true,
      inboundGrants: [],
      outboundGrants: [],
    };

    this.tenants.set(params.id, record);
    return record;
  }

  /**
   * Look up a tenant by ID.  Returns `undefined` if not found.
   */
  get(id: TenantId): TenantRecord | undefined {
    return this.tenants.get(id);
  }

  /**
   * List all registered tenants.
   */
  list(): TenantRecord[] {
    return Array.from(this.tenants.values());
  }

  /**
   * Deactivate a tenant.  All subsequent access decisions for this tenant
   * will return `denied`.
   */
  deactivate(id: TenantId): void {
    const record = this.tenants.get(id);
    if (record) {
      this.tenants.set(id, { ...record, active: false });
    }
  }

  /**
   * Issue a cross-tenant grant from `grantor` to `grantee`.
   * Both tenants must be registered and active, and both must have
   * `policy.allowCrossTenant === true`.
   *
   * @throws {Error} If either tenant is unknown, inactive, or does not allow
   *   cross-tenant access.
   */
  issueGrant(grant: CrossTenantGrant): void {
    const grantor = this.getActiveOrThrow(grant.grantor, "grantor");
    const grantee = this.getActiveOrThrow(grant.grantee, "grantee");

    if (!grantor.policy.allowCrossTenant) {
      throw new Error(
        `Tenant "${grant.grantor}" does not allow cross-tenant grants (allowCrossTenant=false)`
      );
    }
    if (!grantee.policy.allowCrossTenant) {
      throw new Error(
        `Tenant "${grant.grantee}" does not allow receiving cross-tenant grants (allowCrossTenant=false)`
      );
    }

    this.tenants.set(grant.grantor, {
      ...grantor,
      outboundGrants: [...grantor.outboundGrants, grant],
    });
    this.tenants.set(grant.grantee, {
      ...grantee,
      inboundGrants: [...grantee.inboundGrants, grant],
    });
  }

  /**
   * Revoke all grants between a grantor and a grantee for the given actions.
   * If `actions` is empty, all grants between the pair are removed.
   */
  revokeGrant(grantor: TenantId, grantee: TenantId, actions?: TenantScopedAction[]): void {
    const grantorRecord = this.tenants.get(grantor);
    const granteeRecord = this.tenants.get(grantee);

    const matchGrant = (g: CrossTenantGrant): boolean => {
      if (g.grantor !== grantor || g.grantee !== grantee) return false;
      if (!actions || actions.length === 0) return true;
      // Remove only the specified actions; keep grants that still have other actions
      return g.actions.every((a) => actions.includes(a));
    };

    if (grantorRecord) {
      this.tenants.set(grantor, {
        ...grantorRecord,
        outboundGrants: grantorRecord.outboundGrants.filter((g) => !matchGrant(g)),
      });
    }
    if (granteeRecord) {
      this.tenants.set(grantee, {
        ...granteeRecord,
        inboundGrants: granteeRecord.inboundGrants.filter((g) => !matchGrant(g)),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getActiveOrThrow(id: TenantId, label: string): TenantRecord {
    const record = this.tenants.get(id);
    if (!record) throw new Error(`Unknown tenant "${id}" (${label})`);
    if (!record.active) throw new Error(`Tenant "${id}" (${label}) is inactive`);
    return record;
  }
}

// ---------------------------------------------------------------------------
// Access-decision types
// ---------------------------------------------------------------------------

/**
 * Why a tenant access decision was made.
 * Used in audit trails and operator dashboards.
 */
export type TenantAccessDenialReason =
  | "actor_tenant_unknown"
  | "actor_tenant_inactive"
  | "resource_tenant_unknown"
  | "resource_tenant_inactive"
  | "cross_tenant_denied"
  | "grant_expired"
  | "action_not_granted"
  | "rate_limit_exceeded";

export type TenantAccessAllowReason =
  | "same_tenant"
  | "system_tenant"
  | "trusted_tenant"
  | "explicit_grant"
  | "platform_override";

/**
 * The result of evaluating a single tenant access request.
 *
 * All decisions are logged when `policy.auditAllAccess` is `true` for either
 * the actor or the resource tenant.
 */
export interface TenantAccessDecision {
  allowed: boolean;
  reason: TenantAccessAllowReason | TenantAccessDenialReason;
  /**
   * The policy version of the resource tenant's policy at evaluation time.
   * Stored in audit logs so historical decisions can be replayed.
   */
  policyVersion: string;
  /** ISO 8601 timestamp of the decision. */
  decidedAt: string;
  /** The grant that permitted access, if applicable. */
  appliedGrant?: CrossTenantGrant;
}

// ---------------------------------------------------------------------------
// Access evaluation
// ---------------------------------------------------------------------------

/**
 * Inputs for `evaluateTenantAccess`.
 */
export interface TenantAccessRequest {
  /** The tenant performing the action (the actor). */
  actorTenantId: TenantId;
  /** The tenant that owns the resource being accessed. */
  resourceTenantId: TenantId;
  /** The action being requested. */
  action: TenantScopedAction;
  /** The registry to evaluate against. */
  registry: TenantRegistry;
}

/**
 * Pure function that evaluates whether `actorTenantId` is permitted to
 * perform `action` on a resource owned by `resourceTenantId`.
 *
 * Evaluation order:
 * 1. Actor tenant must be registered and active.
 * 2. Resource tenant must be registered and active.
 * 3. If actor === resource, allow (same-tenant access).
 * 4. If actor is the SYSTEM tenant, allow (platform override).
 * 5. If resource tenant's `trustedTenants` list includes the actor, allow.
 * 6. If `policy.allowCrossTenant` is `false` for either party, deny.
 * 7. Look for an active, matching `CrossTenantGrant` — allow if found.
 * 8. Deny.
 */
export function evaluateTenantAccess(req: TenantAccessRequest): TenantAccessDecision {
  const now = new Date().toISOString();
  const base = { decidedAt: now };

  const actorRecord = req.registry.get(req.actorTenantId);
  if (!actorRecord) {
    return { ...base, allowed: false, reason: "actor_tenant_unknown", policyVersion: "n/a" };
  }
  if (!actorRecord.active) {
    return {
      ...base,
      allowed: false,
      reason: "actor_tenant_inactive",
      policyVersion: actorRecord.policy.policyVersion,
    };
  }

  const resourceRecord = req.registry.get(req.resourceTenantId);
  if (!resourceRecord) {
    return {
      ...base,
      allowed: false,
      reason: "resource_tenant_unknown",
      policyVersion: actorRecord.policy.policyVersion,
    };
  }
  if (!resourceRecord.active) {
    return {
      ...base,
      allowed: false,
      reason: "resource_tenant_inactive",
      policyVersion: resourceRecord.policy.policyVersion,
    };
  }

  const policyVersion = resourceRecord.policy.policyVersion;

  // 3. Same-tenant access is always permitted.
  if (req.actorTenantId === req.resourceTenantId) {
    return { ...base, allowed: true, reason: "same_tenant", policyVersion };
  }

  // 4. The SYSTEM tenant bypasses all cross-tenant restrictions.
  if (req.actorTenantId === SYSTEM_TENANT_ID) {
    return { ...base, allowed: true, reason: "platform_override", policyVersion };
  }

  // 5. Static trusted-tenant allow-list on the resource tenant's policy.
  if (resourceRecord.policy.trustedTenants?.includes(req.actorTenantId)) {
    return { ...base, allowed: true, reason: "trusted_tenant", policyVersion };
  }

  // 6. Cross-tenant access must be explicitly permitted on both sides.
  if (!actorRecord.policy.allowCrossTenant || !resourceRecord.policy.allowCrossTenant) {
    return { ...base, allowed: false, reason: "cross_tenant_denied", policyVersion };
  }

  // 7. Walk the actor's inbound grants for a matching, non-expired grant.
  for (const grant of actorRecord.inboundGrants) {
    if (grant.grantor !== req.resourceTenantId) continue;
    if (!grant.actions.includes(req.action)) continue;

    // Check expiry.
    if (grant.expiresAt && new Date(grant.expiresAt) <= new Date()) {
      return { ...base, allowed: false, reason: "grant_expired", policyVersion };
    }

    return {
      ...base,
      allowed: true,
      reason: "explicit_grant",
      policyVersion,
      appliedGrant: grant,
    };
  }

  // 8. No matching grant — check whether any grants exist at all between
  //    the pair to produce a more specific denial reason.
  const hasGrant = actorRecord.inboundGrants.some((g) => g.grantor === req.resourceTenantId);
  return {
    ...base,
    allowed: false,
    reason: hasGrant ? "action_not_granted" : "cross_tenant_denied",
    policyVersion,
  };
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/** Singleton registry for use in the frontend / API layer. */
export const tenantRegistry = new TenantRegistry();

/** Register the built-in platform (system) tenant at module load time. */
tenantRegistry.register({
  id: SYSTEM_TENANT_ID,
  displayName: "StellarVeriphy Platform",
  tier: "platform",
  policy: {
    dataIsolation: "strict",
    allowCrossTenant: true,
    auditAllAccess: true,
    maxConcurrentJobs: 0,
    dailyVerificationLimit: 0,
    policyVersion: "1.0.0",
  },
});
