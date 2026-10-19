/**
 * packages/shared/access-policy/index.ts
 *
 * Dynamic policy engine for provenance access controls. (#684)
 *
 * This module defines a rule-based access-control engine that evaluates
 * access requests against explicit, composable policy rules.  Rules can
 * respond to content type, jurisdiction, user role, and trust posture to
 * determine what can be shared and with whom — particularly relevant for
 * sensitive or regulated content.
 *
 * ## Design goals
 *
 * - **Dynamic evaluation** – access policy is evaluated at request time
 *   against explicit, named rules; no hard-coded `if/else` chains.
 * - **Role and context separation** – different user roles and access
 *   contexts map to different rule paths; cross-role leakage is prevented by
 *   the engine, not by callers.
 * - **Testable** – `evaluateAccessPolicy` is a pure function; every rule is
 *   independently testable with its `predicate`.
 * - **Extensible** – adding a new jurisdiction, role, or content type adds a
 *   rule (or updates a rule predicate); it does not require touching the
 *   evaluation engine.
 *
 * ## Usage
 *
 * ```typescript
 * import {
 *   evaluateAccessPolicy,
 *   defaultAccessRuleSet,
 * } from "@stellarveriphy/shared/access-policy";
 *
 * const decision = evaluateAccessPolicy(defaultAccessRuleSet, {
 *   actor: { role: "consumer", stellarAddress: "G..." },
 *   resource: { contentType: "legal_document", jurisdiction: "EU", ownerId: "G..." },
 *   requestedAction: "read:certificate",
 * });
 *
 * if (!decision.allowed) {
 *   console.error("Access denied:", decision.denyReason);
 * }
 * ```
 *
 * @module shared/access-policy
 */

// ---------------------------------------------------------------------------
// User roles
// ---------------------------------------------------------------------------

/**
 * User roles recognised by the access-control engine.
 *
 * Mirrors `Role` in `frontend/lib/security/permissionModel.ts` with
 * additional roles for multi-tenant enterprise scenarios.
 */
export type AccessPolicyRole =
  | "creator"        // the creator of the content (always has full access to own content)
  | "verifier"       // an oracle worker or internal verification service
  | "admin"          // platform administrator
  | "consumer"       // unauthenticated or authenticated read-only user
  | "enterprise"     // enterprise tenant member
  | "auditor"        // read-only access for compliance auditing
  | "regulator";     // external regulator with elevated read rights

// ---------------------------------------------------------------------------
// Content types / asset classes for access control
// ---------------------------------------------------------------------------

/**
 * Content types that influence access-control policy.
 * Extends `AssetClass` from `packages/shared/policy/index.ts`.
 */
export type AccessPolicyContentType =
  | "news_media"
  | "legal_document"
  | "ai_generated_artwork"
  | "scientific_data"
  | "supply_chain_evidence"
  | "nft_asset"
  | "medical_record"
  | "financial_record"
  | "government_document"
  | "other";

// ---------------------------------------------------------------------------
// Jurisdictions
// ---------------------------------------------------------------------------

export type AccessPolicyJurisdiction = "EU" | "US" | "UK" | "GLOBAL" | string;

// ---------------------------------------------------------------------------
// Trust posture
// ---------------------------------------------------------------------------

/**
 * A numeric 0–100 trust score for the actor, derived from the provider trust
 * model (`packages/shared/scoring/providerTrust.ts`).
 *
 * - 0–24  → `"untrusted"`
 * - 25–49 → `"low"`
 * - 50–74 → `"medium"`
 * - 75–100 → `"high"`
 */
export type TrustPosture = "untrusted" | "low" | "medium" | "high";

export function trustPostureFromScore(score: number): TrustPosture {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  if (score >= 25) return "low";
  return "untrusted";
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Actions that can be requested against a provenance resource.
 */
export type AccessPolicyAction =
  | "read:certificate"        // read the certificate metadata and provenance record
  | "read:full_manifest"      // read the full (potentially sensitive) manifest
  | "read:attestation"        // read the attestation evidence
  | "read:analytics"          // read analytics derived from this resource
  | "share:certificate"       // re-publish / link the certificate to a third party
  | "export:certificate"      // export certificate to PDF or external format
  | "write:manifest"          // update or annotate the manifest
  | "revoke:certificate"      // revoke the certificate
  | "transfer:ownership"      // transfer the certificate to another account
  | "admin:override";         // admin-only: bypass standard access rules

// ---------------------------------------------------------------------------
// Access-policy context
// ---------------------------------------------------------------------------

/**
 * Facts about the actor requesting access.
 */
export interface AccessActor {
  /** User role. */
  role: AccessPolicyRole;
  /** Stellar public key of the requesting account (G...). */
  stellarAddress?: string;
  /**
   * Trust posture, derived from the provider trust score (relevant for
   * `verifier` role actors).
   */
  trustPosture?: TrustPosture;
  /**
   * Whether the actor has completed identity verification / KYC.
   * Relevant for `legal_document` and `financial_record` content types.
   */
  identityVerified?: boolean;
  /**
   * The tenant the actor belongs to (from `packages/shared/tenant`).
   * Used for cross-tenant access evaluation.
   */
  tenantId?: string;
}

/**
 * Facts about the resource being accessed.
 */
export interface AccessResource {
  /** Content type of the underlying asset. */
  contentType: AccessPolicyContentType;
  /** Jurisdiction the content is certified under. */
  jurisdiction: AccessPolicyJurisdiction;
  /** Stellar public key of the certificate owner / creator. */
  ownerId: string;
  /**
   * If `true`, the resource has been explicitly marked as publicly shareable
   * by the owner.
   */
  publiclyShareable?: boolean;
  /**
   * If `true`, the resource has been locked (e.g. for legal hold) and
   * modification actions are blocked regardless of other rules.
   */
  locked?: boolean;
  /**
   * If `true`, the resource has been revoked and is not accessible for most
   * actions.
   */
  revoked?: boolean;
}

/**
 * Full context evaluated by the access-policy engine.
 */
export interface AccessPolicyContext {
  actor: AccessActor;
  resource: AccessResource;
  requestedAction: AccessPolicyAction;
  /**
   * Any additional facts for custom rules.
   */
  extra?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Access-policy decision
// ---------------------------------------------------------------------------

export type AccessGrantReason =
  | "owner_access"
  | "admin_override"
  | "public_resource"
  | "role_allowed"
  | "trusted_verifier"
  | "auditor_read"
  | "regulator_read";

export type AccessDenyReason =
  | "revoked_resource"
  | "locked_resource"
  | "insufficient_role"
  | "insufficient_trust"
  | "identity_required"
  | "jurisdiction_restriction"
  | "content_type_restriction"
  | "action_not_permitted";

/**
 * Result of evaluating an access-policy request.
 */
export interface AccessPolicyDecision {
  allowed: boolean;
  reason: AccessGrantReason | AccessDenyReason;
  /**
   * Additional conditions the actor must satisfy even when access is allowed
   * (e.g. "display redaction notice", "log access for GDPR compliance").
   */
  conditions: string[];
  /** The rule ID that produced this decision. */
  appliedRuleId: string;
  /** ISO 8601 timestamp of this decision. */
  decidedAt: string;
  /**
   * The policy version used for this decision (for audit trails).
   */
  policyVersion: string;
}

// ---------------------------------------------------------------------------
// Policy rule
// ---------------------------------------------------------------------------

/**
 * A single access-policy rule.
 *
 * Evaluation stops at the first rule that produces a definitive
 * `allow` or `deny` outcome.  Rules with `effect: "condition"` add to the
 * `conditions` list but do not stop evaluation.
 */
export interface AccessPolicyRule {
  id: string;
  description: string;
  /**
   * Returns `true` when this rule applies to the given context.
   * Must be a pure function.
   */
  predicate: (ctx: AccessPolicyContext) => boolean;
  effect: "allow" | "deny" | "condition";
  reason: AccessGrantReason | AccessDenyReason;
  /** Condition text appended to the decision when `effect === "condition"`. */
  conditionText?: string;
}

// ---------------------------------------------------------------------------
// Policy rule set
// ---------------------------------------------------------------------------

export interface AccessPolicyRuleSet {
  id: string;
  version: string;
  description: string;
  rules: AccessPolicyRule[];
}

// ---------------------------------------------------------------------------
// Evaluation engine
// ---------------------------------------------------------------------------

/**
 * Evaluate an `AccessPolicyRuleSet` against an `AccessPolicyContext`.
 *
 * Evaluation order:
 * 1. Hard-block rules (revoked/locked resources) — checked first, always.
 * 2. Allow rules — first match grants access.
 * 3. Condition rules — accumulate conditions without stopping evaluation.
 * 4. Deny rules — first match denies access.
 * 5. Default deny — if no allow rule matched, access is denied.
 *
 * @param ruleSet - The rule set to evaluate.
 * @param context - Facts about the actor, resource, and action.
 * @returns An `AccessPolicyDecision`.
 */
export function evaluateAccessPolicy(
  ruleSet: AccessPolicyRuleSet,
  context: AccessPolicyContext
): AccessPolicyDecision {
  const now = new Date().toISOString();
  const base = { decidedAt: now, policyVersion: ruleSet.version };
  const conditions: string[] = [];

  for (const rule of ruleSet.rules) {
    if (!rule.predicate(context)) continue;

    if (rule.effect === "deny") {
      return {
        ...base,
        allowed: false,
        reason: rule.reason,
        conditions: [],
        appliedRuleId: rule.id,
      };
    }

    if (rule.effect === "allow") {
      return {
        ...base,
        allowed: true,
        reason: rule.reason,
        conditions,
        appliedRuleId: rule.id,
      };
    }

    // condition — accumulate and continue
    if (rule.conditionText) {
      conditions.push(rule.conditionText);
    }
  }

  // Default deny — no allow rule matched.
  return {
    ...base,
    allowed: false,
    reason: "action_not_permitted",
    conditions: [],
    appliedRuleId: "default_deny",
  };
}

// ---------------------------------------------------------------------------
// Default access rule set
// ---------------------------------------------------------------------------

/**
 * Default StellarVeriphy access-control policy (v1.0.0).
 *
 * Rules are evaluated in declaration order.  Deny rules for revoked/locked
 * resources are placed first to ensure they cannot be bypassed.
 */
export const defaultAccessRuleSet: AccessPolicyRuleSet = {
  id: "stellarveriphy-access-default",
  version: "1.0.0",
  description: "Default StellarVeriphy provenance access-control policy",
  rules: [
    // -----------------------------------------------------------------------
    // Hard blocks — always evaluated first
    // -----------------------------------------------------------------------
    {
      id: "deny-revoked-resource",
      description: "Revoked resources are inaccessible for all actions except admin:override.",
      predicate: (ctx) =>
        (ctx.resource.revoked ?? false) && ctx.requestedAction !== "admin:override",
      effect: "deny",
      reason: "revoked_resource",
    },
    {
      id: "deny-locked-modification",
      description: "Locked resources cannot be modified or transferred.",
      predicate: (ctx) =>
        (ctx.resource.locked ?? false) &&
        (ctx.requestedAction === "write:manifest" ||
          ctx.requestedAction === "revoke:certificate" ||
          ctx.requestedAction === "transfer:ownership"),
      effect: "deny",
      reason: "locked_resource",
    },

    // -----------------------------------------------------------------------
    // Admin override — bypasses all subsequent rules
    // -----------------------------------------------------------------------
    {
      id: "allow-admin-override",
      description: "Admins may perform any action on any resource.",
      predicate: (ctx) => ctx.actor.role === "admin",
      effect: "allow",
      reason: "admin_override",
    },

    // -----------------------------------------------------------------------
    // Owner access — creators/owners have full access to their own content
    // -----------------------------------------------------------------------
    {
      id: "allow-owner-full-access",
      description: "The certificate owner has full access to their own content.",
      predicate: (ctx) =>
        ctx.actor.stellarAddress !== undefined &&
        ctx.actor.stellarAddress === ctx.resource.ownerId,
      effect: "allow",
      reason: "owner_access",
    },

    // -----------------------------------------------------------------------
    // Regulator read rights (elevated read access, all jurisdictions)
    // -----------------------------------------------------------------------
    {
      id: "allow-regulator-read",
      description: "Regulators may read any certificate, manifest, or attestation.",
      predicate: (ctx) =>
        ctx.actor.role === "regulator" &&
        (ctx.requestedAction === "read:certificate" ||
          ctx.requestedAction === "read:full_manifest" ||
          ctx.requestedAction === "read:attestation"),
      effect: "allow",
      reason: "regulator_read",
    },

    // -----------------------------------------------------------------------
    // Auditor read rights
    // -----------------------------------------------------------------------
    {
      id: "allow-auditor-read",
      description: "Auditors may read certificates and attestations.",
      predicate: (ctx) =>
        ctx.actor.role === "auditor" &&
        (ctx.requestedAction === "read:certificate" ||
          ctx.requestedAction === "read:attestation" ||
          ctx.requestedAction === "read:analytics"),
      effect: "allow",
      reason: "auditor_read",
    },

    // -----------------------------------------------------------------------
    // Verifier access (needs attestation read)
    // -----------------------------------------------------------------------
    {
      id: "allow-trusted-verifier-attestation",
      description: "Verifiers with high trust may read attestation evidence.",
      predicate: (ctx) =>
        ctx.actor.role === "verifier" &&
        (ctx.actor.trustPosture === "high" || ctx.actor.trustPosture === "medium") &&
        ctx.requestedAction === "read:attestation",
      effect: "allow",
      reason: "trusted_verifier",
    },
    {
      id: "deny-untrusted-verifier",
      description: "Verifiers with low or no trust cannot access attestation evidence.",
      predicate: (ctx) =>
        ctx.actor.role === "verifier" &&
        (ctx.actor.trustPosture === "low" || ctx.actor.trustPosture === "untrusted") &&
        ctx.requestedAction === "read:attestation",
      effect: "deny",
      reason: "insufficient_trust",
    },

    // -----------------------------------------------------------------------
    // Legal and medical documents — identity verification required
    // -----------------------------------------------------------------------
    {
      id: "deny-legal-unverified-identity",
      description:
        "Reading the full manifest of a legal document requires identity verification.",
      predicate: (ctx) =>
        (ctx.resource.contentType === "legal_document" ||
          ctx.resource.contentType === "medical_record" ||
          ctx.resource.contentType === "financial_record") &&
        ctx.requestedAction === "read:full_manifest" &&
        ctx.actor.role !== "admin" &&
        ctx.actor.role !== "regulator" &&
        !(ctx.actor.identityVerified ?? false),
      effect: "deny",
      reason: "identity_required",
    },

    // -----------------------------------------------------------------------
    // EU GDPR — consumer access conditions
    // -----------------------------------------------------------------------
    {
      id: "eu-gdpr-access-condition",
      description: "EU-jurisdiction content accessed by consumers requires GDPR notice.",
      predicate: (ctx) =>
        ctx.resource.jurisdiction === "EU" &&
        ctx.actor.role === "consumer" &&
        ctx.requestedAction === "read:certificate",
      effect: "condition",
      reason: "role_allowed",
      conditionText:
        "GDPR Notice: this access has been logged. The data subject may request erasure of off-chain metadata under Article 17 GDPR.",
    },

    // -----------------------------------------------------------------------
    // Public resources — consumers can read
    // -----------------------------------------------------------------------
    {
      id: "allow-public-certificate-read",
      description: "Publicly shareable certificates may be read by any consumer.",
      predicate: (ctx) =>
        (ctx.resource.publiclyShareable ?? false) &&
        ctx.requestedAction === "read:certificate",
      effect: "allow",
      reason: "public_resource",
    },
    {
      id: "allow-public-share",
      description: "Publicly shareable certificates may be shared by any consumer.",
      predicate: (ctx) =>
        (ctx.resource.publiclyShareable ?? false) &&
        ctx.requestedAction === "share:certificate",
      effect: "allow",
      reason: "public_resource",
    },

    // -----------------------------------------------------------------------
    // Enterprise tenant access
    // -----------------------------------------------------------------------
    {
      id: "allow-enterprise-read",
      description: "Enterprise users may read any certificate within their tenant.",
      predicate: (ctx) =>
        ctx.actor.role === "enterprise" &&
        (ctx.requestedAction === "read:certificate" ||
          ctx.requestedAction === "read:attestation" ||
          ctx.requestedAction === "read:analytics" ||
          ctx.requestedAction === "export:certificate"),
      effect: "allow",
      reason: "role_allowed",
    },

    // -----------------------------------------------------------------------
    // Government documents — restrict to government/enterprise/admin
    // -----------------------------------------------------------------------
    {
      id: "deny-consumer-government-document",
      description: "Government documents may not be read by general consumers.",
      predicate: (ctx) =>
        ctx.resource.contentType === "government_document" &&
        ctx.actor.role === "consumer",
      effect: "deny",
      reason: "content_type_restriction",
    },

    // -----------------------------------------------------------------------
    // Creator role — read/write own content, no admin actions
    // -----------------------------------------------------------------------
    {
      id: "allow-creator-self-actions",
      description: "Creators may read, write, export, and share their own content.",
      predicate: (ctx) =>
        ctx.actor.role === "creator" &&
        (ctx.requestedAction === "read:certificate" ||
          ctx.requestedAction === "read:full_manifest" ||
          ctx.requestedAction === "read:attestation" ||
          ctx.requestedAction === "write:manifest" ||
          ctx.requestedAction === "share:certificate" ||
          ctx.requestedAction === "export:certificate"),
      effect: "allow",
      reason: "role_allowed",
    },

    // -----------------------------------------------------------------------
    // Consumer read of non-sensitive public content
    // -----------------------------------------------------------------------
    {
      id: "allow-consumer-basic-read",
      description:
        "Consumers may read certificates for non-sensitive content types.",
      predicate: (ctx) => {
        const nonSensitive: AccessPolicyContentType[] = [
          "news_media",
          "ai_generated_artwork",
          "supply_chain_evidence",
          "nft_asset",
          "other",
        ];
        return (
          ctx.actor.role === "consumer" &&
          nonSensitive.includes(ctx.resource.contentType) &&
          ctx.requestedAction === "read:certificate"
        );
      },
      effect: "allow",
      reason: "role_allowed",
    },

    // -----------------------------------------------------------------------
    // Deny admin:override to non-admins (safety net)
    // -----------------------------------------------------------------------
    {
      id: "deny-non-admin-override",
      description: "Only admins may use the admin:override action.",
      predicate: (ctx) =>
        ctx.requestedAction === "admin:override" && ctx.actor.role !== "admin",
      effect: "deny",
      reason: "insufficient_role",
    },
  ],
};
