/**
 * packages/shared/key-lifecycle/index.ts
 *
 * Cryptographic key rotation and revocation framework for StellarVeriphy.
 * Closes #679.
 *
 * ## Purpose
 *
 * This module provides a complete, auditable lifecycle for every signing or
 * verification key used in the StellarVeriphy system: TEE enclave keys,
 * Stellar deployer / admin keys, oracle provider signing keys, and
 * application-issued API keys.
 *
 * Key responsibilities:
 * - Define the canonical `KeyRecord` data model with rotation / revocation
 *   metadata.
 * - Provide deterministic `evaluateKeyRotationPolicy` to decide whether a key
 *   is past its rotation window.
 * - Provide `buildRotationPlan` to produce a concrete, ordered action plan.
 * - Provide `buildRevocationEvent` to stamp a consistent revocation record that
 *   feeds into audit trails.
 * - Provide `evaluateEmergencyRevocation` to gate break-glass procedures.
 *
 * ## Design principles
 *
 * - **Pure functions** – all decision functions are free of side effects.
 *   Callers are responsible for persisting state.
 * - **Reason-coded** – every rotation trigger and revocation carries an
 *   explicit `reason` code so audit logs are self-describing.
 * - **Fallback / rescue paths** – each key category carries a documented
 *   emergency procedure expressed as structured data, not just prose.
 * - **Zero-trust default** – a key whose rotation window cannot be determined
 *   (e.g. no `createdAt`) is treated as requiring rotation immediately.
 *
 * @module shared/key-lifecycle
 */

// ---------------------------------------------------------------------------
// Key categories
// ---------------------------------------------------------------------------

/**
 * The category of cryptographic key being managed.
 *
 * | Category | Owner | Purpose |
 * |---|---|---|
 * | `tee_enclave` | AWS Nitro Enclave | Signs attestation proofs |
 * | `stellar_deployer` | Platform admin | Deploys and administers contracts |
 * | `oracle_provider` | Oracle node operator | Signs verification attestations |
 * | `api_key` | End user | Authorises verification API calls |
 * | `ci_cd` | GitHub Actions / CI system | Deploys container images |
 */
export type KeyCategory =
  | "tee_enclave"
  | "stellar_deployer"
  | "oracle_provider"
  | "api_key"
  | "ci_cd";

// ---------------------------------------------------------------------------
// Key status
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of a key record.
 *
 * - `active` – in-use, within its rotation window.
 * - `rotation_pending` – past rotation window; still usable but operator
 *   should schedule rotation.
 * - `revoked` – explicitly revoked; must not be used for new operations.
 * - `expired` – past its `expiresAt` hard deadline; treated as revoked.
 * - `superseded` – replaced by a successor key; kept for backward-verify
 *   of old signatures only.
 */
export type KeyStatus =
  | "active"
  | "rotation_pending"
  | "revoked"
  | "expired"
  | "superseded";

// ---------------------------------------------------------------------------
// Rotation trigger codes
// ---------------------------------------------------------------------------

/**
 * Machine-readable reason a key rotation was triggered.
 *
 * The set maps 1-to-1 with the operational rotation matrix in
 * `docs/security/key-management.md`.
 */
export type RotationTrigger =
  | "scheduled" // Routine time-based rotation
  | "suspected_compromise" // Potential breach or leak detected
  | "confirmed_compromise" // Key material confirmed leaked
  | "contributor_offboarding" // Personnel change
  | "policy_update" // Algorithm or key-length policy changed
  | "enclave_rebuild" // New TEE image produced a new key
  | "user_initiated" // End user requested rotation (API keys)
  | "expiry_imminent" // Within 7 days of hard expiry
  | "audit_finding"; // Security review recommended rotation

// ---------------------------------------------------------------------------
// Revocation reason codes
// ---------------------------------------------------------------------------

/**
 * Machine-readable reason a key was revoked.
 */
export type RevocationReason =
  | "key_compromise" // Key material was exposed
  | "superseded" // A newer key takes over all duties
  | "policy_violation" // Operator violated usage policy
  | "account_closure" // Owner account closed
  | "emergency_response" // Break-glass procedure activated
  | "administrative" // Platform admin decision
  | "expired"; // Hard deadline elapsed without renewal

// ---------------------------------------------------------------------------
// Emergency procedure
// ---------------------------------------------------------------------------

/**
 * Structured description of the fallback / break-glass procedure for a key
 * category.  Operators consume this at incident response time to avoid
 * consulting prose documentation under stress.
 */
export interface EmergencyProcedure {
  /** Short label for dashboards and runbooks. */
  title: string;
  /** Ordered action steps.  Each step is a single imperative sentence. */
  steps: string[];
  /** Role or team responsible for executing this procedure. */
  owner: string;
  /**
   * Whether revocation can be applied without a second approval.
   * `false` means two-person integrity (2PI) is required.
   */
  singleApprover: boolean;
  /** References to dependent runbooks or system documentation. */
  references: string[];
}

// ---------------------------------------------------------------------------
// Key record
// ---------------------------------------------------------------------------

/**
 * Canonical data model for a tracked cryptographic key.
 */
export interface KeyRecord {
  /** Stable identifier; format depends on category (e.g. SHA-256 thumbprint). */
  id: string;
  category: KeyCategory;
  status: KeyStatus;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /**
   * ISO-8601 timestamp of the most recent rotation window start.
   * Undefined for keys that have never been through a rotation cycle.
   */
  lastRotatedAt?: string;
  /**
   * ISO-8601 hard expiry deadline.  After this point the key is treated as
   * `expired` regardless of any other status.  Optional: some keys (e.g. TEE
   * enclave) do not have a fixed expiry — their rotation is event-driven.
   */
  expiresAt?: string;
  /** Human-readable display label for operator tooling. */
  label: string;
  /** Identifier of the entity that owns or is responsible for this key. */
  ownerId: string;
  /**
   * Recommended rotation cadence in days.  Used by `evaluateKeyRotationPolicy`
   * to determine when a key enters `rotation_pending`.
   */
  rotationIntervalDays?: number;
  /** Identifier of the key this one supersedes, if any. */
  supersedes?: string;
  /** Identifier of the key that superseded this one, if any. */
  supersededBy?: string;
  /** ISO-8601 timestamp of revocation; present only when `status === "revoked"`. */
  revokedAt?: string;
  revocationReason?: RevocationReason;
  /** Free-text human context for the revocation (operator notes). */
  revocationNote?: string;
  /** Reason the most recent rotation was triggered. */
  lastRotationTrigger?: RotationTrigger;
  /** Emergency procedure applicable to this key. */
  emergencyProcedure: EmergencyProcedure;
}

// ---------------------------------------------------------------------------
// Rotation policy evaluation
// ---------------------------------------------------------------------------

export interface RotationPolicyInput {
  key: KeyRecord;
  /** Current wall-clock time as ISO-8601 (injected for testability). */
  now: string;
}

export type RotationPolicyOutcome =
  | "no_rotation_needed"
  | "rotation_recommended" // Past scheduled window; non-urgent
  | "rotation_required" // Trigger condition exceeded; rotate promptly
  | "immediate_rotation" // Compromise suspected / confirmed; rotate now
  | "already_revoked"; // Key is revoked; rotation is moot

export interface RotationPolicyDecision {
  keyId: string;
  outcome: RotationPolicyOutcome;
  /** Human-readable explanation for operator tooling and audit logs. */
  reason: string;
  /** Computed age of the key in days at decision time. */
  keyAgeDays: number;
  /** Days remaining until the hard expiry, if one exists.  Null otherwise. */
  daysUntilExpiry: number | null;
  decidedAt: string;
}

/**
 * Evaluate whether a key requires rotation based on its rotation interval,
 * hard expiry, and current status.
 *
 * This is a pure function: same inputs → same `RotationPolicyDecision`.
 */
export function evaluateKeyRotationPolicy(
  input: RotationPolicyInput
): RotationPolicyDecision {
  const { key, now } = input;
  const nowMs = new Date(now).getTime();
  const createdMs = new Date(key.createdAt).getTime();
  const keyAgeDays = Math.floor((nowMs - createdMs) / 86_400_000);

  const daysUntilExpiry =
    key.expiresAt != null
      ? Math.floor((new Date(key.expiresAt).getTime() - nowMs) / 86_400_000)
      : null;

  // Already revoked — rotation is moot
  if (key.status === "revoked" || key.status === "expired") {
    return {
      keyId: key.id,
      outcome: "already_revoked",
      reason: `Key ${key.id} is already ${key.status}; rotation is not applicable.`,
      keyAgeDays,
      daysUntilExpiry,
      decidedAt: now,
    };
  }

  // Hard expiry elapsed
  if (daysUntilExpiry !== null && daysUntilExpiry <= 0) {
    return {
      keyId: key.id,
      outcome: "immediate_rotation",
      reason: `Key ${key.id} has passed its hard expiry (${key.expiresAt}). Treat as expired and replace immediately.`,
      keyAgeDays,
      daysUntilExpiry,
      decidedAt: now,
    };
  }

  // Hard expiry imminent (≤7 days)
  if (daysUntilExpiry !== null && daysUntilExpiry <= 7) {
    return {
      keyId: key.id,
      outcome: "rotation_required",
      reason: `Key ${key.id} expires in ${daysUntilExpiry} day(s) (${key.expiresAt}). Rotation is required before expiry.`,
      keyAgeDays,
      daysUntilExpiry,
      decidedAt: now,
    };
  }

  // Rotation interval check
  if (key.rotationIntervalDays != null) {
    const referenceDate = key.lastRotatedAt ?? key.createdAt;
    const referenceMs = new Date(referenceDate).getTime();
    const daysSinceLastRotation = Math.floor(
      (nowMs - referenceMs) / 86_400_000
    );

    if (daysSinceLastRotation >= key.rotationIntervalDays * 1.5) {
      // Overdue by 50% or more → required
      return {
        keyId: key.id,
        outcome: "rotation_required",
        reason: `Key ${key.id} is ${daysSinceLastRotation} days since last rotation (interval: ${key.rotationIntervalDays} days). Rotation is overdue.`,
        keyAgeDays,
        daysUntilExpiry,
        decidedAt: now,
      };
    }

    if (daysSinceLastRotation >= key.rotationIntervalDays) {
      return {
        keyId: key.id,
        outcome: "rotation_recommended",
        reason: `Key ${key.id} is ${daysSinceLastRotation} days since last rotation (interval: ${key.rotationIntervalDays} days). Schedule rotation.`,
        keyAgeDays,
        daysUntilExpiry,
        decidedAt: now,
      };
    }
  }

  return {
    keyId: key.id,
    outcome: "no_rotation_needed",
    reason: `Key ${key.id} is within its rotation window.`,
    keyAgeDays,
    daysUntilExpiry,
    decidedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Rotation plan
// ---------------------------------------------------------------------------

export interface RotationStep {
  /** Sequence number (1-based). */
  order: number;
  action: string;
  responsible: string;
  /** Whether this step must be completed before the next step begins. */
  blocking: boolean;
  /** References to runbooks or contract addresses. */
  references?: string[];
}

export interface RotationPlan {
  keyId: string;
  trigger: RotationTrigger;
  generatedAt: string;
  steps: RotationStep[];
  /** Whether a second approver is required before execution. */
  requiresTwoPersonIntegrity: boolean;
  /** Any post-rotation verification checks that must pass. */
  verificationChecks: string[];
}

/**
 * Build a concrete rotation action plan for a key, given the trigger.
 *
 * The plan is constructed from the key's category and the provided trigger.
 * Callers render this for operator runbooks or automated tooling.
 */
export function buildRotationPlan(
  key: KeyRecord,
  trigger: RotationTrigger,
  now: string
): RotationPlan {
  const requiresTPI =
    trigger === "confirmed_compromise" ||
    trigger === "suspected_compromise" ||
    trigger === "emergency_response" ||
    !key.emergencyProcedure.singleApprover;

  const steps = buildStepsForCategory(key.category, trigger);

  return {
    keyId: key.id,
    trigger,
    generatedAt: now,
    steps,
    requiresTwoPersonIntegrity: requiresTPI,
    verificationChecks: buildVerificationChecks(key.category),
  };
}

function buildStepsForCategory(
  category: KeyCategory,
  trigger: RotationTrigger
): RotationStep[] {
  switch (category) {
    case "tee_enclave":
      return [
        {
          order: 1,
          action:
            "Rebuild the enclave image with updated code; the new image generates a fresh key pair at boot.",
          responsible: "Platform / DevOps",
          blocking: true,
          references: ["docs/security/tee-attestation-service.md"],
        },
        {
          order: 2,
          action:
            "Retrieve the new enclave image's PCR (code measurement) hash from the build output.",
          responsible: "Platform / DevOps",
          blocking: true,
        },
        {
          order: 3,
          action:
            "Call `contracts/registry.register_tee_hash` with the new code hash from an authorised admin key.",
          responsible: "Contract Admin",
          blocking: true,
          references: ["docs/api/CONTRACTS.md"],
        },
        {
          order: 4,
          action:
            "Keep the old code hash in the registry until all in-flight verification jobs using it have completed.",
          responsible: "Platform / DevOps",
          blocking: false,
        },
        {
          order: 5,
          action:
            "Remove the old code hash from the registry once no in-flight jobs reference it.",
          responsible: "Contract Admin",
          blocking: true,
        },
        {
          order: 6,
          action:
            "Verify that new verification jobs complete successfully with the new enclave code hash.",
          responsible: "QA / Platform",
          blocking: true,
        },
      ];

    case "stellar_deployer":
      return [
        {
          order: 1,
          action:
            trigger === "confirmed_compromise" ||
            trigger === "suspected_compromise"
              ? "IMMEDIATE: Revoke the compromised key from all secrets managers and CI secrets NOW before proceeding."
              : "Schedule a maintenance window for the rotation.",
          responsible: "Platform Admin",
          blocking: true,
        },
        {
          order: 2,
          action:
            "Generate a new Stellar deployer key: `stellar keys generate new-deployer --network testnet` (use hardware wallet for mainnet).",
          responsible: "Platform Admin",
          blocking: true,
          references: ["docs/deployment.md"],
        },
        {
          order: 3,
          action:
            "Transfer admin authority on `contracts/registry` by calling `set_admin` with the new key (once the admin-check gap is closed — see deployment.md#contract-initialization).",
          responsible: "Contract Admin",
          blocking: true,
          references: [
            "docs/deployment.md#contract-initialization",
            "docs/api/CONTRACTS.md",
          ],
        },
        {
          order: 4,
          action:
            "Update GitHub Environment secrets (`STELLAR_SECRET`, related) with the new key material.",
          responsible: "Platform Admin",
          blocking: true,
          references: ["docs/deployment/ci-cd-pipeline.md"],
        },
        {
          order: 5,
          action:
            "Confirm the next CI/CD deployment pipeline run succeeds with the new key.",
          responsible: "Platform Admin",
          blocking: true,
        },
        {
          order: 6,
          action:
            "Destroy / revoke the old key from all storage locations (local keystore, secrets manager, hardware wallet).",
          responsible: "Platform Admin",
          blocking: false,
        },
      ];

    case "oracle_provider":
      return [
        {
          order: 1,
          action:
            "Generate a new Ed25519 key pair for the oracle provider node.",
          responsible: "Oracle Operator",
          blocking: true,
        },
        {
          order: 2,
          action:
            "Call `contracts/oracle.update_provider_key` (or re-register with `register_provider`) to associate the new public key with the provider address.",
          responsible: "Oracle Operator / Contract Admin",
          blocking: true,
          references: ["docs/api/CONTRACTS.md"],
        },
        {
          order: 3,
          action:
            "Deploy the updated oracle node binary that uses the new signing key.",
          responsible: "Oracle Operator",
          blocking: true,
        },
        {
          order: 4,
          action:
            "Allow in-flight attestations signed with the old key to drain (default TTL: 100 ledgers).",
          responsible: "Oracle Operator",
          blocking: false,
        },
        {
          order: 5,
          action:
            "Remove the old public key from `contracts/registry` after the drain window.",
          responsible: "Contract Admin",
          blocking: true,
        },
        {
          order: 6,
          action:
            "Monitor oracle trust score for the provider; confirm it remains above the `rotation_required` threshold.",
          responsible: "Platform / QA",
          blocking: false,
        },
      ];

    case "api_key":
      return [
        {
          order: 1,
          action:
            "User initiates rotation via the key management UI (Settings → API Keys → Rotate) or API endpoint.",
          responsible: "End User",
          blocking: true,
        },
        {
          order: 2,
          action:
            "The platform generates a new API key and displays it to the user exactly once (one-time reveal).",
          responsible: "Platform",
          blocking: true,
          references: ["frontend/components/APIKeyManagement.tsx"],
        },
        {
          order: 3,
          action:
            "User records the new key securely (e.g. in a secrets manager).",
          responsible: "End User",
          blocking: true,
        },
        {
          order: 4,
          action:
            "Revoke the old key; the audit log records the rotation event with timestamp and trigger.",
          responsible: "Platform",
          blocking: true,
        },
      ];

    case "ci_cd":
      return [
        {
          order: 1,
          action:
            "Rotate the credential at its source (e.g. regenerate a GHCR PAT in GitHub → Settings → Developer settings; rotate the SSH deploy key pair on the server).",
          responsible: "Platform Admin",
          blocking: true,
          references: ["docs/deployment/ci-cd-pipeline.md"],
        },
        {
          order: 2,
          action:
            "Update the GitHub Environment secret with the new credential value.",
          responsible: "Platform Admin",
          blocking: true,
        },
        {
          order: 3,
          action:
            "Trigger a test deployment run and confirm it succeeds with the new credential.",
          responsible: "Platform Admin",
          blocking: true,
        },
        {
          order: 4,
          action:
            "Invalidate / delete the old credential from its source system.",
          responsible: "Platform Admin",
          blocking: false,
        },
      ];
  }
}

function buildVerificationChecks(category: KeyCategory): string[] {
  const common = [
    "Confirm no errors appear in the audit log for the key ID within 15 minutes of rotation completion.",
    "Confirm the key's `status` has been updated to `active` in the key registry.",
  ];

  switch (category) {
    case "tee_enclave":
      return [
        ...common,
        "Submit a test verification job and confirm it reaches `minted` status using the new enclave code hash.",
        "Confirm `contracts/registry.is_tee_hash_approved` returns true for the new hash and false for the old hash.",
      ];
    case "stellar_deployer":
      return [
        ...common,
        "Run a smoke-test deployment to testnet using the new key.",
        "Confirm no transactions can be signed with the old key (test revocation).",
      ];
    case "oracle_provider":
      return [
        ...common,
        "Submit a test attestation signed with the new provider key; confirm it passes `contracts/oracle.verify_attestation`.",
        "Monitor provider SLA score for at least one verification cycle post-rotation.",
      ];
    case "api_key":
      return [
        ...common,
        "Make a test API call with the new key; confirm it returns 200.",
        "Make a test API call with the old key; confirm it returns 401.",
      ];
    case "ci_cd":
      return [
        ...common,
        "Confirm the deployment pipeline succeeds end-to-end with the new credential.",
        "Confirm the old credential is rejected (e.g. attempt a manual `docker push` with it).",
      ];
  }
}

// ---------------------------------------------------------------------------
// Revocation event
// ---------------------------------------------------------------------------

/**
 * A stamped, immutable record of a key revocation event.
 * Feed this into the audit trail (see `frontend/lib/security/auditLogger.ts`).
 */
export interface KeyRevocationEvent {
  eventId: string;
  keyId: string;
  category: KeyCategory;
  reason: RevocationReason;
  /** Operator-supplied context note. */
  note: string;
  /** Identifier of the person or system that triggered the revocation. */
  revokedBy: string;
  revokedAt: string;
  /** Whether this was an emergency / break-glass revocation. */
  emergency: boolean;
  /** Identifier of the successor key, if one exists. */
  successorKeyId?: string;
}

/**
 * Build a standardised revocation event record.
 *
 * The `eventId` is generated deterministically from `keyId + revokedAt` to
 * avoid duplicate entries when the same event is processed more than once.
 */
export function buildRevocationEvent(params: {
  keyId: string;
  category: KeyCategory;
  reason: RevocationReason;
  note: string;
  revokedBy: string;
  revokedAt: string;
  successorKeyId?: string;
}): KeyRevocationEvent {
  const { keyId, category, reason, note, revokedBy, revokedAt, successorKeyId } =
    params;

  // Simple deterministic ID: sha256 not available without crypto; use a
  // concatenation that is unique enough for in-process deduplication.
  const eventId = `rev-${keyId}-${new Date(revokedAt).getTime()}`;

  const emergency =
    reason === "key_compromise" || reason === "emergency_response";

  return {
    eventId,
    keyId,
    category,
    reason,
    note,
    revokedBy,
    revokedAt,
    emergency,
    successorKeyId,
  };
}

// ---------------------------------------------------------------------------
// Emergency revocation gate
// ---------------------------------------------------------------------------

export interface EmergencyRevocationRequest {
  key: KeyRecord;
  requestedBy: string;
  approvedBy?: string;
  justification: string;
  now: string;
}

export type EmergencyRevocationGateOutcome =
  | "approved_single" // Single approver sufficient; proceed
  | "requires_second_approver" // Key requires 2PI; awaiting approval
  | "already_revoked" // Nothing to do
  | "missing_justification"; // Justification field empty

export interface EmergencyRevocationGateDecision {
  outcome: EmergencyRevocationGateOutcome;
  reason: string;
  decidedAt: string;
  procedure: EmergencyProcedure;
}

/**
 * Gate an emergency revocation request.
 *
 * Returns a structured decision that operators (or automated runbooks) can
 * act on immediately without consulting prose documentation.
 */
export function evaluateEmergencyRevocation(
  request: EmergencyRevocationRequest
): EmergencyRevocationGateDecision {
  const { key, requestedBy: _requestedBy, approvedBy, justification, now } =
    request;

  if (!justification || justification.trim().length === 0) {
    return {
      outcome: "missing_justification",
      reason:
        "Emergency revocation requires a non-empty justification. Provide context before proceeding.",
      decidedAt: now,
      procedure: key.emergencyProcedure,
    };
  }

  if (key.status === "revoked" || key.status === "expired") {
    return {
      outcome: "already_revoked",
      reason: `Key ${key.id} is already ${key.status}. No action needed.`,
      decidedAt: now,
      procedure: key.emergencyProcedure,
    };
  }

  const requiresTPI = !key.emergencyProcedure.singleApprover;

  if (requiresTPI && !approvedBy) {
    return {
      outcome: "requires_second_approver",
      reason: `Key category "${key.category}" requires two-person integrity for emergency revocation. Obtain a second approval before proceeding.`,
      decidedAt: now,
      procedure: key.emergencyProcedure,
    };
  }

  return {
    outcome: "approved_single",
    reason: `Emergency revocation of key ${key.id} approved. Execute the procedure steps in order.`,
    decidedAt: now,
    procedure: key.emergencyProcedure,
  };
}

// ---------------------------------------------------------------------------
// Default emergency procedures
// ---------------------------------------------------------------------------

/**
 * Default emergency procedures keyed by key category.  Operators may
 * override these by passing a custom `emergencyProcedure` in the `KeyRecord`.
 */
export const DEFAULT_EMERGENCY_PROCEDURES: Record<
  KeyCategory,
  EmergencyProcedure
> = {
  tee_enclave: {
    title: "TEE Enclave Key Emergency Revocation",
    steps: [
      "Stop accepting new verification jobs immediately (set oracle circuit-breaker).",
      "Rebuild the enclave image; the new boot generates a fresh key pair.",
      "Register the new code hash in `contracts/registry`.",
      "Remove the compromised code hash from `contracts/registry`.",
      "Audit all attestations signed with the old key; invalidate if necessary.",
      "Resume job acceptance after verification that the new enclave is healthy.",
    ],
    owner: "Platform / Security",
    singleApprover: false,
    references: [
      "docs/security/tee-attestation-service.md",
      "docs/security/key-management.md",
    ],
  },
  stellar_deployer: {
    title: "Stellar Deployer / Admin Key Emergency Revocation",
    steps: [
      "Remove the key from all secrets managers immediately.",
      "Delete / invalidate the local `stellar keys` identity.",
      "Revoke the GitHub Actions secret referencing this key.",
      "Generate a new deployer key (hardware wallet for mainnet).",
      "Re-establish admin authority on all contracts using the new key.",
      "Audit recent contract writes for unauthorised operations.",
    ],
    owner: "Platform Admin",
    singleApprover: false,
    references: [
      "docs/deployment.md",
      "docs/deployment/ci-cd-pipeline.md",
      "docs/security/key-management.md",
    ],
  },
  oracle_provider: {
    title: "Oracle Provider Signing Key Emergency Revocation",
    steps: [
      "Suspend the provider immediately via `contracts/oracle.suspend_provider`.",
      "Remove the provider's public key from `contracts/registry`.",
      "Audit all recent attestations from the provider for signs of forgery.",
      "Generate a new key pair on the oracle node.",
      "Re-register the provider with the new public key.",
      "Unsuspend the provider after verification.",
    ],
    owner: "Oracle Operator / Platform Security",
    singleApprover: false,
    references: [
      "docs/security/tee-attestation-service.md",
      "docs/security/verifier-network-threat-model.md",
    ],
  },
  api_key: {
    title: "Application API Key Emergency Revocation",
    steps: [
      "Navigate to Settings → API Keys in the StellarVeriphy UI.",
      "Click Revoke next to the compromised key.",
      "Confirm revocation; the key is immediately invalidated.",
      "Generate a new key if continued API access is required.",
      "Update the consuming system with the new key.",
    ],
    owner: "End User / Platform Support",
    singleApprover: true,
    references: ["frontend/components/APIKeyManagement.tsx"],
  },
  ci_cd: {
    title: "CI/CD Deployment Credential Emergency Revocation",
    steps: [
      "Revoke the credential at its source (GitHub PAT, SSH key, etc.) immediately.",
      "Remove the GitHub Actions secret.",
      "Audit recent deployment runs for unauthorised pushes.",
      "Generate a new credential from the source system.",
      "Update the GitHub Environment secret.",
      "Trigger a test deployment to confirm recovery.",
    ],
    owner: "Platform Admin",
    singleApprover: false,
    references: ["docs/deployment/ci-cd-pipeline.md"],
  },
};

// ---------------------------------------------------------------------------
// Key lifecycle summary
// ---------------------------------------------------------------------------

/**
 * Summary of key lifecycle state for a collection of keys.
 * Useful for operator dashboards and health checks.
 */
export interface KeyLifecycleSummary {
  totalKeys: number;
  activeKeys: number;
  rotationPendingKeys: number;
  revokedKeys: number;
  expiredKeys: number;
  /** Keys flagged as requiring immediate rotation (overdue or expiring soon). */
  immediateActionKeys: string[];
  generatedAt: string;
}

/**
 * Compute a lifecycle summary for a set of key records.
 */
export function summariseKeyLifecycle(
  keys: KeyRecord[],
  now: string
): KeyLifecycleSummary {
  const immediateActionKeys: string[] = [];
  let activeKeys = 0;
  let rotationPendingKeys = 0;
  let revokedKeys = 0;
  let expiredKeys = 0;

  for (const key of keys) {
    switch (key.status) {
      case "active":
        activeKeys++;
        break;
      case "rotation_pending":
        rotationPendingKeys++;
        break;
      case "revoked":
        revokedKeys++;
        break;
      case "expired":
        expiredKeys++;
        break;
    }

    const decision = evaluateKeyRotationPolicy({ key, now });
    if (
      decision.outcome === "immediate_rotation" ||
      decision.outcome === "rotation_required"
    ) {
      immediateActionKeys.push(key.id);
    }
  }

  return {
    totalKeys: keys.length,
    activeKeys,
    rotationPendingKeys,
    revokedKeys,
    expiredKeys,
    immediateActionKeys,
    generatedAt: now,
  };
}
