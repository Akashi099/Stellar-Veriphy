/**
 * dispute.ts
 *
 * Frontend types for the content dispute and governance workflow.
 *
 * These types mirror the on-chain oracle `Dispute` struct for provider
 * disputes, and extend `ModerationQueueItem` for content disputes with
 * structured evidence, audit entries, and resolution details.
 *
 * Two tracks:
 *   - ContentDispute  — off-chain admin queue for disputed content records
 *   - ProviderDispute — on-chain oracle dispute (read-only mirror here)
 */

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/** Categories of evidence that can be attached to a dispute. */
export type EvidenceType =
  | "hash_mismatch"        // the recorded hash doesn't match the claimed original
  | "attestation_invalid"  // TEE attestation document fails validation
  | "duplicate_content"    // same content certified under a different certificate
  | "creator_identity"     // the claimed creator address is not who they say they are
  | "legal_request"        // takedown or legal hold request with reference number
  | "media_manipulation"   // visual or forensic evidence of manipulation
  | "on_chain_reference"   // link to a Stellar transaction or event
  | "external_reference"   // URL to an external source supporting the dispute
  | "other";

/**
 * A single structured evidence item attached to a dispute.
 * Replaces the plain `string[]` used in ModerationQueueItem.
 */
export interface DisputeEvidence {
  /** Unique evidence item identifier (generated server-side). */
  id?: string;
  /** Category of the evidence. */
  type: EvidenceType;
  /** Human-readable description of what this evidence shows. */
  description: string;
  /**
   * For hash-based evidence: the hex hash value.
   * For on-chain evidence: the transaction hash or contract event ID.
   * For external references: the URL.
   */
  reference?: string;
  /** ISO 8601 timestamp when this evidence was attached. */
  attachedAt?: string;
  /** Stellar address of the party who attached this evidence. */
  attachedBy?: string;
}

// ---------------------------------------------------------------------------
// Dispute status and resolution
// ---------------------------------------------------------------------------

/** Lifecycle status of a content dispute. */
export type DisputeStatus =
  | "open"          // newly raised, awaiting review
  | "under_review"  // an operator has claimed it
  | "evidence_requested" // operator asked disputing party for more info
  | "resolved_upheld"   // dispute upheld — content record updated/revoked
  | "resolved_rejected" // dispute rejected — original record stands
  | "resolved_inconclusive" // no clear outcome; operator notes explain
  | "dismissed";    // frivolous or duplicate; no further action

/** How a dispute was finally resolved. */
export type DisputeResolutionOutcome =
  | "upheld"          // the dispute was valid; action taken
  | "rejected"        // the dispute was not supported by evidence
  | "inconclusive"    // insufficient evidence for a definitive outcome
  | "dismissed";      // frivolous, duplicate, or out of scope

/** Why the content was originally disputed. */
export type DisputeTrigger =
  | "incorrect_attestation"  // attestation hash/proof is wrong or forged
  | "fraudulent_content"     // the content itself is fraudulent
  | "copyright_violation"    // content violates copyright
  | "legal_requirement"      // legal/regulatory removal request
  | "creator_request"        // the original creator wants the record corrected
  | "duplicate_record"       // same content exists under multiple certificates
  | "identity_fraud"         // the creator address was spoofed or stolen
  | "other";

// ---------------------------------------------------------------------------
// Core record types
// ---------------------------------------------------------------------------

/**
 * A content dispute record as stored and returned by the API.
 */
export interface DisputeRecord {
  /** Server-generated unique ID (e.g. `dsp_1720000000_abc12`). */
  id: string;
  /** The on-chain provenance certificate being disputed. */
  certificateId: string;
  /** SHA-256 content hash of the disputed asset. */
  contentHash: string;
  /** Current lifecycle status. */
  status: DisputeStatus;
  /** What triggered the dispute. */
  trigger: DisputeTrigger;
  /** Stellar address of the party raising the dispute (if authenticated). */
  reportedBy?: string;
  /** Human-readable summary of the concern. */
  summary: string;
  /** Structured evidence items. */
  evidence: DisputeEvidence[];
  /** ISO 8601 timestamp when the dispute was raised. */
  createdAt: string;
  /** ISO 8601 timestamp of the most recent status change. */
  updatedAt: string;
  /** Stellar address of the operator currently handling the dispute. */
  assignedTo?: string;
  /** Operator notes recorded during review. */
  reviewNotes?: string;
  /** ISO 8601 timestamp of final resolution. */
  resolvedAt?: string;
  /** How the dispute was resolved. */
  resolutionOutcome?: DisputeResolutionOutcome;
  /** Human-readable explanation of the resolution for the disputing party. */
  resolutionSummary?: string;
  /** Ordered list of operator addresses who have handled or escalated this dispute. */
  escalationChain: string[];
  /**
   * On-chain transaction hash if the resolution triggered a contract action
   * (e.g. `provenance.revoke_certificate` was called).
   */
  onChainTxHash?: string;
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

/** Action types recorded in the dispute audit trail. */
export type DisputeAuditAction =
  | "raised"
  | "evidence_attached"
  | "status_changed"
  | "assigned"
  | "escalated"
  | "note_added"
  | "evidence_requested"
  | "resolved"
  | "dismissed";

/**
 * An immutable audit entry recording a single action on a dispute.
 * The full ordered list of entries is the auditable history of the dispute.
 */
export interface DisputeAuditEntry {
  /** Unique entry ID. */
  id: string;
  /** The dispute this entry belongs to. */
  disputeId: string;
  /** What action was taken. */
  action: DisputeAuditAction;
  /** Stellar address of the operator or user who performed the action. */
  actor: string;
  /** ISO 8601 timestamp of the action. */
  timestamp: string;
  /** Human-readable description of what changed. */
  description: string;
  /** Previous status (for status_changed entries). */
  previousStatus?: DisputeStatus;
  /** New status (for status_changed entries). */
  newStatus?: DisputeStatus;
  /** Any additional structured data for this entry. */
  metadata?: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Request / response shapes
// ---------------------------------------------------------------------------

/**
 * Body for raising a new content dispute (POST /api/disputes).
 */
export interface RaiseDisputeRequest {
  /** The on-chain certificate ID being disputed. */
  certificateId: string;
  /** SHA-256 content hash of the disputed media. */
  contentHash: string;
  /** Why this is being disputed. */
  trigger: DisputeTrigger;
  /** Human-readable summary of the concern (required, max 1000 chars). */
  summary: string;
  /** Stellar address of the reporting party (optional — anonymous reports allowed). */
  reportedBy?: string;
  /** Initial evidence items (optional — more can be attached later). */
  evidence?: DisputeEvidence[];
}

/**
 * Body for resolving or dismissing a dispute (POST /api/disputes/:id/resolve).
 */
export interface DisputeResolutionRequest {
  /** How the dispute is being resolved. */
  outcome: DisputeResolutionOutcome;
  /** Plain-language explanation of the decision. */
  resolutionSummary: string;
  /** Operator notes (internal, not shown to disputing party). */
  reviewNotes?: string;
  /**
   * On-chain action taken (if any) — e.g. "revoke_certificate" or
   * "no_action". Required when outcome === "upheld".
   */
  onChainAction?: string;
  /** Transaction hash of the on-chain action, if one was taken. */
  onChainTxHash?: string;
}
