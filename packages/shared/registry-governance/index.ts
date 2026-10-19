/**
 * packages/shared/registry-governance/index.ts
 *
 * Multi-tenant registry governance model for StellarVeriphy. Closes #678.
 *
 * ## Purpose
 *
 * This module defines the governance layer that allows multiple organisations,
 * creators, and verifiers to share the StellarVeriphy registry safely —
 * without cross-tenant contamination, data leakage, or governance conflicts.
 *
 * ## Design principles
 *
 * - **Tenant isolation by default** — every registry entry (TEE hash,
 *   provider key, governance proposal) is scoped to exactly one tenant context.
 *   Cross-tenant reads/writes are denied unless an explicit trust grant exists.
 * - **Role-based governance** — changes to the registry are gated by a
 *   declared role (admin, auditor, operator, observer) with explicit
 *   permissions per role.
 * - **Multi-sig proposals** — any change that affects the shared trust
 *   anchor set (TEE hashes, provider allow-list) must go through a `Proposal`
 *   with a configurable approval threshold.
 * - **Pure evaluation** — `evaluateGovernanceAction` is side-effect free.
 *   Callers persist the resulting decision and state changes.
 * - **Expandable without weakening** — adding a new tenant never relaxes
 *   the rules of existing tenants; tenant policies are additive.
 *
 * @module shared/registry-governance
 */

// ---------------------------------------------------------------------------
// Tenant context
// ---------------------------------------------------------------------------

/**
 * Governance tier for a tenant.  Determines which registry operations are
 * available to members of this tenant.
 *
 * - `observer` – read-only access to approved hashes and provider lists.
 * - `operator` – can submit proposals but cannot approve them.
 * - `admin` – can approve/reject proposals and manage tenant members.
 * - `platform` – first-party StellarVeriphy tenants; can manage global
 *   settings and emergency procedures.
 */
export type RegistryGovernanceTier =
  | "observer"
  | "operator"
  | "admin"
  | "platform";

/**
 * A registry tenant context.
 */
export interface RegistryTenantContext {
  /** Stable unique identifier for this tenant. */
  tenantId: string;
  /** Human-readable display name. */
  displayName: string;
  tier: RegistryGovernanceTier;
  /**
   * Minimum number of approvals required for a governance proposal to
   * be executed.  Must be ≥ 1.  Recommended ≥ 2 for `admin` and `platform`
   * tiers.
   */
  approvalThreshold: number;
  /**
   * Whether this tenant can read TEE hashes / provider keys registered by
   * other tenants.  Only `platform` tenants should set this true.
   */
  canReadCrossTenant: boolean;
  /**
   * Whether this tenant can propose registry changes that affect the global
   * shared trust anchor set.
   */
  canProposeTrustAnchorChanges: boolean;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** Whether the tenant is currently active. */
  active: boolean;
}

// ---------------------------------------------------------------------------
// Registry entry ownership
// ---------------------------------------------------------------------------

/**
 * A registry entry (TEE code hash or oracle provider key) with tenant
 * ownership metadata.
 */
export interface OwnedRegistryEntry {
  /** Unique identifier for the entry (e.g. hex-encoded hash). */
  entryId: string;
  entryType: "tee_hash" | "provider_key";
  /** The owning tenant.  Determines who can propose changes to this entry. */
  ownerTenantId: string;
  /** ISO-8601 timestamp when the entry was first registered. */
  registeredAt: string;
  /** ISO-8601 timestamp of the most recent update. */
  updatedAt: string;
  status: "active" | "pending_approval" | "revoked" | "expired";
  /**
   * Tenant IDs that are explicitly allowed to reference this entry in
   * verification jobs (for cross-tenant provider sharing scenarios).
   */
  allowedTenants: string[];
  /** Short human-readable label for operator tooling. */
  label: string;
}

// ---------------------------------------------------------------------------
// Governance roles and permissions
// ---------------------------------------------------------------------------

/**
 * A member of a tenant with an assigned governance role.
 */
export interface TenantMember {
  memberId: string;
  tenantId: string;
  /** Stellar public key (G...) or service account identifier. */
  address: string;
  role: RegistryGovernanceTier;
  /** ISO-8601 timestamp of role assignment. */
  assignedAt: string;
  active: boolean;
}

/**
 * Permissions matrix for each governance tier.
 */
export const GOVERNANCE_PERMISSIONS: Record<
  RegistryGovernanceTier,
  {
    canRead: boolean;
    canPropose: boolean;
    canApprove: boolean;
    canRevoke: boolean;
    canManageMembers: boolean;
    canViewAuditLog: boolean;
  }
> = {
  observer: {
    canRead: true,
    canPropose: false,
    canApprove: false,
    canRevoke: false,
    canManageMembers: false,
    canViewAuditLog: false,
  },
  operator: {
    canRead: true,
    canPropose: true,
    canApprove: false,
    canRevoke: false,
    canManageMembers: false,
    canViewAuditLog: true,
  },
  admin: {
    canRead: true,
    canPropose: true,
    canApprove: true,
    canRevoke: true,
    canManageMembers: true,
    canViewAuditLog: true,
  },
  platform: {
    canRead: true,
    canPropose: true,
    canApprove: true,
    canRevoke: true,
    canManageMembers: true,
    canViewAuditLog: true,
  },
};

// ---------------------------------------------------------------------------
// Governance proposals
// ---------------------------------------------------------------------------

export type ProposalActionType =
  | "register_tee_hash"
  | "revoke_tee_hash"
  | "register_provider_key"
  | "revoke_provider_key"
  | "grant_cross_tenant_access"
  | "revoke_cross_tenant_access"
  | "update_approval_threshold"
  | "add_tenant_member"
  | "remove_tenant_member"
  | "emergency_revoke";

export type ProposalStatus =
  | "open" // Accepting approvals
  | "approved" // Threshold met; ready to execute
  | "executed" // Action has been applied
  | "rejected" // Explicitly rejected by an admin
  | "expired"; // Deadline elapsed without approval

/**
 * A governance proposal for a registry change.
 */
export interface GovernanceProposal {
  /** Unique identifier. */
  proposalId: string;
  tenantId: string;
  actionType: ProposalActionType;
  /** JSON-serialisable payload specific to the action type. */
  payload: Record<string, unknown>;
  /** Identifier of the member who submitted the proposal. */
  proposedBy: string;
  /** ISO-8601 submission timestamp. */
  proposedAt: string;
  /** ISO-8601 hard deadline for approval. */
  expiresAt: string;
  status: ProposalStatus;
  /** Member IDs that have approved the proposal. */
  approvals: string[];
  /** Member IDs that have rejected the proposal. */
  rejections: string[];
  /** Free-text rationale for audit trails. */
  justification: string;
  /** ISO-8601 timestamp of most recent status change. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Governance action evaluation
// ---------------------------------------------------------------------------

export type GovernanceActionOutcome =
  | "allowed" // Actor has permission; proceed
  | "insufficient_role" // Actor's role does not permit this action
  | "cross_tenant_denied" // Entry belongs to a different tenant; access denied
  | "proposal_required" // Change requires a formal proposal
  | "approval_threshold_not_met" // Proposal has insufficient approvals
  | "tenant_inactive" // Tenant context is deactivated
  | "unknown_tenant"; // Tenant not found in registry

export interface GovernanceActionDecision {
  outcome: GovernanceActionOutcome;
  reason: string;
  actorTenantId: string;
  actorRole: RegistryGovernanceTier;
  action: ProposalActionType;
  decidedAt: string;
}

export interface GovernanceActionInput {
  /** The tenant the actor belongs to. */
  actorTenantId: string;
  actorRole: RegistryGovernanceTier;
  /** The action being attempted. */
  action: ProposalActionType;
  /**
   * The tenant that owns the resource being acted upon.
   * Same as `actorTenantId` for self-owned resources.
   */
  resourceTenantId: string;
  /** The tenant registry to look up context in. */
  tenantRegistry: Map<string, RegistryTenantContext>;
  /**
   * Active proposal for the action, if one exists.
   * Required for actions that go through the proposal flow.
   */
  proposal?: GovernanceProposal;
  now: string;
}

/**
 * Evaluate whether an actor may perform a governance action.
 *
 * This is a pure function: same inputs → same `GovernanceActionDecision`.
 */
export function evaluateGovernanceAction(
  input: GovernanceActionInput
): GovernanceActionDecision {
  const {
    actorTenantId,
    actorRole,
    action,
    resourceTenantId,
    tenantRegistry,
    proposal,
    now,
  } = input;

  const actorContext = tenantRegistry.get(actorTenantId);

  if (!actorContext) {
    return {
      outcome: "unknown_tenant",
      reason: `Tenant "${actorTenantId}" is not registered in the governance registry.`,
      actorTenantId,
      actorRole,
      action,
      decidedAt: now,
    };
  }

  if (!actorContext.active) {
    return {
      outcome: "tenant_inactive",
      reason: `Tenant "${actorTenantId}" is inactive. Reactivate the tenant before performing governance actions.`,
      actorTenantId,
      actorRole,
      action,
      decidedAt: now,
    };
  }

  // Cross-tenant access check
  if (
    actorTenantId !== resourceTenantId &&
    !actorContext.canReadCrossTenant &&
    actorContext.tier !== "platform"
  ) {
    return {
      outcome: "cross_tenant_denied",
      reason: `Tenant "${actorTenantId}" does not have cross-tenant access. Actions on resources owned by "${resourceTenantId}" are denied.`,
      actorTenantId,
      actorRole,
      action,
      decidedAt: now,
    };
  }

  // Role-based permission check
  const perms = GOVERNANCE_PERMISSIONS[actorRole];
  const actionRequiresProposal = PROPOSAL_REQUIRED_ACTIONS.has(action);

  if (action === "emergency_revoke") {
    if (!perms.canRevoke) {
      return {
        outcome: "insufficient_role",
        reason: `Role "${actorRole}" cannot perform emergency revocations. Required: admin or platform.`,
        actorTenantId,
        actorRole,
        action,
        decidedAt: now,
      };
    }
    return {
      outcome: "allowed",
      reason: `Emergency revocation by "${actorRole}" in tenant "${actorTenantId}" is permitted.`,
      actorTenantId,
      actorRole,
      action,
      decidedAt: now,
    };
  }

  if (actionRequiresProposal) {
    // Submitting proposal
    if (!proposal) {
      if (!perms.canPropose) {
        return {
          outcome: "insufficient_role",
          reason: `Role "${actorRole}" cannot submit proposals. Required: operator, admin, or platform.`,
          actorTenantId,
          actorRole,
          action,
          decidedAt: now,
        };
      }
      return {
        outcome: "proposal_required",
        reason: `Action "${action}" requires a governance proposal. Submit a proposal and obtain the required ${actorContext.approvalThreshold} approval(s).`,
        actorTenantId,
        actorRole,
        action,
        decidedAt: now,
      };
    }

    // Approving proposal
    if (proposal.approvals.length < actorContext.approvalThreshold) {
      return {
        outcome: "approval_threshold_not_met",
        reason: `Proposal "${proposal.proposalId}" has ${proposal.approvals.length} approval(s); requires ${actorContext.approvalThreshold}. Collect additional approvals before executing.`,
        actorTenantId,
        actorRole,
        action,
        decidedAt: now,
      };
    }
  } else {
    if (action.startsWith("register") && !perms.canPropose) {
      return {
        outcome: "insufficient_role",
        reason: `Role "${actorRole}" cannot perform action "${action}". Required: operator, admin, or platform.`,
        actorTenantId,
        actorRole,
        action,
        decidedAt: now,
      };
    }
    if (
      (action.startsWith("revoke") || action.startsWith("remove")) &&
      !perms.canRevoke
    ) {
      return {
        outcome: "insufficient_role",
        reason: `Role "${actorRole}" cannot revoke entries. Required: admin or platform.`,
        actorTenantId,
        actorRole,
        action,
        decidedAt: now,
      };
    }
  }

  return {
    outcome: "allowed",
    reason: `Action "${action}" permitted for role "${actorRole}" in tenant "${actorTenantId}".`,
    actorTenantId,
    actorRole,
    action,
    decidedAt: now,
  };
}

/**
 * Actions that must go through the formal multi-sig proposal flow.
 * Direct execution without a passed proposal is denied.
 */
export const PROPOSAL_REQUIRED_ACTIONS = new Set<ProposalActionType>([
  "register_tee_hash",
  "revoke_tee_hash",
  "register_provider_key",
  "revoke_provider_key",
  "grant_cross_tenant_access",
  "revoke_cross_tenant_access",
  "update_approval_threshold",
]);

// ---------------------------------------------------------------------------
// Proposal lifecycle helpers
// ---------------------------------------------------------------------------

/**
 * Create a new governance proposal.
 *
 * `proposalId` is generated from the tenant, action, and timestamp to avoid
 * duplicates in replay scenarios.
 */
export function createGovernanceProposal(params: {
  tenantId: string;
  actionType: ProposalActionType;
  payload: Record<string, unknown>;
  proposedBy: string;
  justification: string;
  proposedAt: string;
  /** How many days before the proposal expires.  Default: 7. */
  expiryDays?: number;
}): GovernanceProposal {
  const {
    tenantId,
    actionType,
    payload,
    proposedBy,
    justification,
    proposedAt,
    expiryDays = 7,
  } = params;

  const proposalId = `prop-${tenantId}-${actionType}-${new Date(proposedAt).getTime()}`;
  const expiresAt = new Date(
    new Date(proposedAt).getTime() + expiryDays * 86_400_000
  ).toISOString();

  return {
    proposalId,
    tenantId,
    actionType,
    payload,
    proposedBy,
    proposedAt,
    expiresAt,
    status: "open",
    approvals: [],
    rejections: [],
    justification,
    updatedAt: proposedAt,
  };
}

/**
 * Apply an approval to an open proposal.
 *
 * Returns a new `GovernanceProposal` (immutable update pattern); the caller
 * is responsible for persisting the updated value.
 *
 * If the approval threshold is met, the returned proposal's status is
 * `"approved"`.
 */
export function applyProposalApproval(
  proposal: GovernanceProposal,
  approverId: string,
  threshold: number,
  now: string
): GovernanceProposal {
  if (proposal.status !== "open") {
    return proposal; // No-op for non-open proposals
  }

  if (proposal.approvals.includes(approverId)) {
    return proposal; // Idempotent
  }

  const newApprovals = [...proposal.approvals, approverId];
  const newStatus: ProposalStatus =
    newApprovals.length >= threshold ? "approved" : "open";

  return {
    ...proposal,
    approvals: newApprovals,
    status: newStatus,
    updatedAt: now,
  };
}

/**
 * Apply a rejection vote to an open proposal.
 *
 * A proposal is rejected once any admin rejects it (veto model).
 */
export function applyProposalRejection(
  proposal: GovernanceProposal,
  rejecterId: string,
  now: string
): GovernanceProposal {
  if (proposal.status !== "open") {
    return proposal;
  }

  return {
    ...proposal,
    rejections: [...proposal.rejections, rejecterId],
    status: "rejected",
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Isolation boundary checker
// ---------------------------------------------------------------------------

/**
 * Determine whether `actorTenantId` can read an entry owned by
 * `resourceTenantId`.
 *
 * Used as a lightweight guard in query paths (e.g. before returning
 * a provider key to a caller).
 */
export function isTenantReadAllowed(params: {
  actorTenantId: string;
  resourceTenantId: string;
  entry: OwnedRegistryEntry;
  actorContext: RegistryTenantContext;
}): boolean {
  const { actorTenantId, resourceTenantId, entry, actorContext } = params;

  // Same tenant — always allowed
  if (actorTenantId === resourceTenantId) return true;

  // Platform tier may read cross-tenant
  if (actorContext.tier === "platform") return true;

  // Explicit allow-list on the entry
  if (entry.allowedTenants.includes(actorTenantId)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Governance audit event
// ---------------------------------------------------------------------------

/**
 * A structured audit event emitted for every governance decision.
 * Feed into `frontend/lib/security/auditLogger.ts`.
 */
export interface GovernanceAuditEvent {
  eventId: string;
  proposalId?: string;
  actorTenantId: string;
  actorMemberId: string;
  actorRole: RegistryGovernanceTier;
  action: ProposalActionType;
  outcome: GovernanceActionOutcome;
  reason: string;
  resourceTenantId: string;
  occurredAt: string;
}

/**
 * Build a governance audit event from a decision.
 */
export function buildGovernanceAuditEvent(params: {
  decision: GovernanceActionDecision;
  actorMemberId: string;
  resourceTenantId: string;
  proposalId?: string;
}): GovernanceAuditEvent {
  const { decision, actorMemberId, resourceTenantId, proposalId } = params;
  const eventId = `gov-${decision.actorTenantId}-${decision.action}-${new Date(decision.decidedAt).getTime()}`;

  return {
    eventId,
    proposalId,
    actorTenantId: decision.actorTenantId,
    actorMemberId,
    actorRole: decision.actorRole,
    action: decision.action,
    outcome: decision.outcome,
    reason: decision.reason,
    resourceTenantId,
    occurredAt: decision.decidedAt,
  };
}
