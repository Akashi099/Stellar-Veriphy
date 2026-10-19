/**
 * complianceAuditTrail.ts
 *
 * Legal and compliance audit trail for provenance events (#688).
 *
 * PURPOSE
 * -------
 * Records compliance-relevant actions tied to provenance events — retention
 * decisions, deletion requests, access disclosures, ownership disputes, and
 * policy changes. This trail is distinct from the security audit log
 * (`frontend/lib/security/auditLogger.ts`), which tracks system/admin actions.
 *
 * The compliance trail is concerned with legal obligations:
 *   - GDPR / CCPA data subject rights actions (access, erasure, portability)
 *   - Data retention milestones (scheduled deletion, retention extension)
 *   - Content dispute handling (DMCA takedowns, ownership challenges)
 *   - Policy change acknowledgments affecting stored provenance records
 *   - Third-party disclosure events
 *
 * SENSITIVE DATA POLICY
 * ----------------------
 * Compliance records must not contain:
 *   - Private keys or wallet credentials
 *   - Unredacted personal data (use pseudonymous identifiers or hashes)
 *   - Internal API keys or session tokens
 *
 * Records should contain:
 *   - Stable identifiers (certificate IDs, job IDs, content hashes)
 *   - Action type and legal basis
 *   - Actor pseudonym or hashed identifier
 *   - Short reason codes consistent with documented policy
 *   - Timestamps and chain-hash for tamper evidence
 *
 * STORAGE
 * -------
 * Entries are stored in `localStorage` for the browser-only implementation.
 * In a production deployment with server-side record keeping, this module
 * should be backed by an append-only database and the `writeEntries` /
 * `readEntries` functions replaced accordingly.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComplianceActionType =
  | "data_access_request"        // GDPR Art. 15 / CCPA "right to know"
  | "erasure_request"            // GDPR Art. 17 / CCPA "right to delete" (off-chain only)
  | "portability_export"         // GDPR Art. 20 data portability
  | "retention_milestone"        // Scheduled retention window reached
  | "retention_extended"         // Retention period extended with documented reason
  | "content_dispute_opened"     // Ownership or authenticity dispute raised
  | "content_dispute_resolved"   // Dispute closed with documented outcome
  | "third_party_disclosure"     // Data shared with a third party (legal basis documented)
  | "policy_change"              // Policy update applied to stored records
  | "dmca_notice"                // DMCA takedown notice received
  | "dmca_counter_notice"        // DMCA counter-notice filed
  | "consent_withdrawn"          // Data subject withdrew processing consent
  | "audit_review"               // Internal or external audit review recorded
  | "other";

export type ComplianceLegalBasis =
  | "legal_obligation"           // Processing required by applicable law
  | "legitimate_interest"        // Documented legitimate interest (with balancing test)
  | "data_subject_request"       // Explicit request from the data subject
  | "contractual_obligation"     // Required to fulfil a contract
  | "consent"                    // Data subject gave explicit consent
  | "public_interest"            // Processing in the public interest
  | "not_applicable";            // No personal data involved (purely on-chain content)

export type ComplianceSeverity = "routine" | "notable" | "high";

export interface ComplianceAuditEntry {
  id: string;
  /** ISO 8601 timestamp when the action was recorded. */
  timestamp: string;
  /** Type of compliance action. */
  actionType: ComplianceActionType;
  /** Legal basis for the action. */
  legalBasis: ComplianceLegalBasis;
  /** Pseudonymous actor identifier (e.g. hashed wallet address or role name). */
  actor: string;
  /**
   * Optional certificate, job, or content identifier affected.
   * Use stable IDs — never raw personal data.
   */
  entityId?: string;
  entityType?: "certificate" | "job" | "content" | "account" | "policy";
  /** Brief reason code or summary (max ~200 chars, no secrets or PII). */
  reason: string;
  /** Outcome of the action (e.g. "completed", "rejected", "pending review"). */
  outcome: string;
  severity: ComplianceSeverity;
  /** SHA-256 chain hash for tamper evidence (same scheme as auditLogger.ts). */
  previousHash: string;
  chainHash: string;
}

export interface ComplianceAuditSummary {
  totalEntries: number;
  byActionType: Record<string, number>;
  byLegalBasis: Record<string, number>;
  bySeverity: Record<string, number>;
  tamperProof: boolean;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STORAGE_KEY = "sv_compliance_audit";
/** Retention window for compliance audit entries (years). */
export const COMPLIANCE_RETENTION_YEARS = 7;

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

async function hashValue(value: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return Buffer.from(value).toString("base64");
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `cpl-${crypto.randomUUID()}`;
  }
  return `cpl-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function readEntries(): ComplianceAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ComplianceAuditEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: ComplianceAuditEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// ---------------------------------------------------------------------------
// ComplianceAuditTrail class
// ---------------------------------------------------------------------------

class ComplianceAuditTrail {
  private entries: ComplianceAuditEntry[] = [];

  constructor() {
    this.entries = readEntries();
  }

  /**
   * Records a compliance-relevant action in the audit trail.
   *
   * The entry is prepended (newest first) and a chain hash is computed to
   * provide tamper evidence. The chain hash links each entry to its predecessor
   * using the same scheme as `frontend/lib/security/auditLogger.ts`.
   */
  async record(params: {
    actionType: ComplianceActionType;
    legalBasis: ComplianceLegalBasis;
    actor: string;
    entityId?: string;
    entityType?: ComplianceAuditEntry["entityType"];
    reason: string;
    outcome: string;
    severity?: ComplianceSeverity;
  }): Promise<ComplianceAuditEntry> {
    const previousHash = this.entries[0]?.chainHash ?? "genesis";

    const entry: ComplianceAuditEntry = {
      id: createId(),
      timestamp: new Date().toISOString(),
      actionType: params.actionType,
      legalBasis: params.legalBasis,
      actor: params.actor,
      entityId: params.entityId,
      entityType: params.entityType,
      reason: params.reason,
      outcome: params.outcome,
      severity: params.severity ?? "routine",
      previousHash,
      chainHash: "",
    };

    entry.chainHash = await hashValue(
      [
        entry.previousHash,
        entry.timestamp,
        entry.actor,
        entry.actionType,
        entry.legalBasis,
        entry.entityId ?? "",
        entry.reason,
        entry.outcome,
        entry.severity,
      ].join("|")
    );

    this.entries = [entry, ...this.entries];
    writeEntries(this.entries);
    return entry;
  }

  /**
   * Returns all entries in descending timestamp order.
   */
  getEntries(filters?: {
    actionType?: ComplianceActionType;
    legalBasis?: ComplianceLegalBasis;
    severity?: ComplianceSeverity;
    entityId?: string;
  }): ComplianceAuditEntry[] {
    let result = [...this.entries].sort((a, b) =>
      a.timestamp < b.timestamp ? 1 : -1
    );

    if (filters?.actionType) {
      result = result.filter((e) => e.actionType === filters.actionType);
    }
    if (filters?.legalBasis) {
      result = result.filter((e) => e.legalBasis === filters.legalBasis);
    }
    if (filters?.severity) {
      result = result.filter((e) => e.severity === filters.severity);
    }
    if (filters?.entityId) {
      result = result.filter((e) => e.entityId === filters.entityId);
    }

    return result;
  }

  /**
   * Returns a summary of the audit trail for review dashboards.
   */
  getSummary(): ComplianceAuditSummary {
    const byActionType: Record<string, number> = {};
    const byLegalBasis: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const entry of this.entries) {
      byActionType[entry.actionType] = (byActionType[entry.actionType] ?? 0) + 1;
      byLegalBasis[entry.legalBasis] = (byLegalBasis[entry.legalBasis] ?? 0) + 1;
      bySeverity[entry.severity] = (bySeverity[entry.severity] ?? 0) + 1;
    }

    const tamperProof = this.entries.every((entry, index) => {
      if (index === 0) return true;
      const prev = this.entries[index - 1];
      return Boolean(prev && entry.previousHash === prev.chainHash);
    });

    return {
      totalEntries: this.entries.length,
      byActionType,
      byLegalBasis,
      bySeverity,
      tamperProof,
    };
  }

  /**
   * Exports all entries as a structured JSON string suitable for legal review
   * or regulatory submission. Includes summary and retention metadata.
   */
  exportForReview(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        retentionYears: COMPLIANCE_RETENTION_YEARS,
        summary: this.getSummary(),
        entries: this.getEntries(),
      },
      null,
      2
    );
  }

  /**
   * Prunes entries older than COMPLIANCE_RETENTION_YEARS.
   *
   * IMPORTANT: For legal compliance, pruning should only occur after
   * confirming that the data is no longer required by any applicable
   * regulation or ongoing dispute. This method is a safety valve for
   * very old records, not a routine operation.
   */
  pruneExpiredEntries(): void {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - COMPLIANCE_RETENTION_YEARS);

    const retained = this.entries.filter((entry) => {
      const stamp = new Date(entry.timestamp);
      return Number.isFinite(stamp.getTime()) && stamp >= cutoff;
    });

    if (retained.length !== this.entries.length) {
      this.entries = retained;
      writeEntries(this.entries);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const complianceAuditTrail = new ComplianceAuditTrail();
