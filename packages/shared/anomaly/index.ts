/**
 * packages/shared/anomaly/index.ts
 *
 * Anomaly detection for suspicious oracle activity. (#685)
 *
 * This module defines the signal types, detection rules, and alerting model
 * that identify abnormal oracle behaviour — repeated failed attestations,
 * unexpected output volume, inconsistent signatures, or operational drift.
 *
 * ## Design goals
 *
 * - **Actionable alerts** – every `AnomalyAlert` carries a severity, a
 *   human-readable description, and a recommended operator action.
 * - **Distinguishable from benign outliers** – detection rules use configurable
 *   thresholds and time windows so scheduled maintenance windows and known
 *   traffic spikes do not produce false positives.
 * - **Documented and understandable** – rule IDs map to entries in
 *   `docs/security/` so operators can look up context for any alert.
 * - **Historical review** – `AnomalyAlert` records are designed to be stored
 *   and queried; the `AnomalyAlertStore` interface defines the minimal
 *   persistence contract.
 *
 * ## Detection rules (built-in)
 *
 * | Rule ID                      | Signal                                         | Severity |
 * |------------------------------|------------------------------------------------|----------|
 * | `failed_attestation_rate`    | Attestation failure rate > threshold           | high     |
 * | `unexpected_output_volume`   | Output count deviates from baseline            | medium   |
 * | `signature_inconsistency`    | Signature validation failures above threshold  | critical |
 * | `provider_silence`           | No activity from provider within window        | high     |
 * | `burst_submission`           | Submission rate spike above normal             | medium   |
 * | `attestation_reuse`          | Same attestation hash submitted > once         | critical |
 *
 * @module shared/anomaly
 */

// ---------------------------------------------------------------------------
// Oracle activity snapshot
// ---------------------------------------------------------------------------

/**
 * A point-in-time snapshot of an oracle provider's activity.
 * Collected by the oracle worker / monitoring layer and passed to
 * `detectAnomalies`.
 */
export interface OracleActivitySnapshot {
  /** Oracle provider identifier (matches `OracleProvider.address`). */
  providerId: string;
  /**
   * Unix timestamp (seconds) of the start of the observation window.
   * The window ends at the current time.
   */
  windowStartSec: number;
  /** Number of attestation attempts in this window. */
  attestationAttempts: number;
  /** Number of attestation failures (includes timeouts). */
  attestationFailures: number;
  /** Number of certificates minted from this provider's attestations. */
  outputCount: number;
  /** Baseline output count per window (derived from 7-day rolling average). */
  baselineOutputCount: number;
  /** Number of signature validation failures encountered by verifiers. */
  signatureValidationFailures: number;
  /** Unix timestamp (seconds) of the provider's last recorded activity. */
  lastActivitySec: number;
  /** Number of verification submissions received in this window. */
  submissionCount: number;
  /** Baseline submission count per window. */
  baselineSubmissionCount: number;
  /**
   * Set of attestation hashes seen in this window.
   * Used to detect reuse of the same attestation across different verifications.
   */
  attestationHashes: string[];
  /**
   * If `true`, this provider is currently in a declared maintenance window.
   * Maintenance windows suppress all alerts except `signature_inconsistency`
   * and `attestation_reuse`.
   */
  inMaintenanceWindow: boolean;
}

// ---------------------------------------------------------------------------
// Anomaly severity
// ---------------------------------------------------------------------------

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

// ---------------------------------------------------------------------------
// Anomaly alert
// ---------------------------------------------------------------------------

/**
 * An alert produced by the anomaly detection engine.
 */
export interface AnomalyAlert {
  /** Unique alert identifier. */
  id: string;
  /** The rule that triggered this alert. */
  ruleId: AnomalyRuleId;
  /** The oracle provider this alert pertains to. */
  providerId: string;
  severity: AnomalySeverity;
  /** Human-readable description of the anomaly. */
  description: string;
  /** Recommended operator action. */
  recommendedAction: string;
  /**
   * Structured evidence: key/value pairs extracted from the snapshot that
   * support the anomaly finding.
   */
  evidence: Record<string, string | number | boolean>;
  /** ISO 8601 timestamp when this alert was generated. */
  generatedAt: string;
  /**
   * Whether this alert has been acknowledged by an operator.
   * Set to `true` via `AnomalyAlertStore.acknowledge`.
   */
  acknowledged: boolean;
}

// ---------------------------------------------------------------------------
// Detection rule identifiers
// ---------------------------------------------------------------------------

export type AnomalyRuleId =
  | "failed_attestation_rate"
  | "unexpected_output_volume"
  | "signature_inconsistency"
  | "provider_silence"
  | "burst_submission"
  | "attestation_reuse";

// ---------------------------------------------------------------------------
// Detection configuration
// ---------------------------------------------------------------------------

/**
 * Tunable thresholds for the built-in detection rules.
 * All fields have conservative production-safe defaults.
 */
export interface AnomalyDetectionConfig {
  /**
   * Attestation failure rate (0–1) above which `failed_attestation_rate`
   * fires.  Default: 0.2 (20%).
   */
  failedAttestationRateThreshold: number;
  /**
   * Multiplier above the baseline output count that triggers
   * `unexpected_output_volume`.  Default: 3.0 (300% of baseline).
   */
  outputVolumeMultiplier: number;
  /**
   * Number of signature validation failures that triggers
   * `signature_inconsistency`.  Default: 3.
   */
  signatureFailureCount: number;
  /**
   * Seconds of inactivity before `provider_silence` fires.  Default: 3600
   * (1 hour).
   */
  silenceWindowSec: number;
  /**
   * Multiplier above the baseline submission count that triggers
   * `burst_submission`.  Default: 5.0.
   */
  burstSubmissionMultiplier: number;
  /**
   * If `true`, maintenance-window providers still fire `signature_inconsistency`
   * and `attestation_reuse`.  Default: `true`.
   */
  alertDuringMaintenance: boolean;
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyDetectionConfig = {
  failedAttestationRateThreshold: 0.2,
  outputVolumeMultiplier: 3.0,
  signatureFailureCount: 3,
  silenceWindowSec: 3600,
  burstSubmissionMultiplier: 5.0,
  alertDuringMaintenance: true,
};

// ---------------------------------------------------------------------------
// Anomaly detection engine
// ---------------------------------------------------------------------------

/**
 * Evaluate a provider snapshot against all built-in rules.
 *
 * This is a pure function.  It does not write to any store; the caller is
 * responsible for persisting the returned alerts.
 *
 * @param snapshot - Activity snapshot for one oracle provider.
 * @param cfg - Detection thresholds (defaults if omitted).
 * @returns Array of `AnomalyAlert` items (empty when no anomalies detected).
 */
export function detectAnomalies(
  snapshot: OracleActivitySnapshot,
  cfg: AnomalyDetectionConfig = DEFAULT_ANOMALY_CONFIG
): AnomalyAlert[] {
  const alerts: AnomalyAlert[] = [];
  const now = new Date().toISOString();
  const inMaintenance = snapshot.inMaintenanceWindow;

  // ------------------------------------------------------------------
  // Rule: failed_attestation_rate
  // ------------------------------------------------------------------
  if (!inMaintenance && snapshot.attestationAttempts > 0) {
    const rate = snapshot.attestationFailures / snapshot.attestationAttempts;
    if (rate >= cfg.failedAttestationRateThreshold) {
      alerts.push(
        makeAlert({
          id: genId("far", snapshot.providerId),
          ruleId: "failed_attestation_rate",
          providerId: snapshot.providerId,
          severity: rate >= 0.5 ? "high" : "medium",
          description:
            `Provider "${snapshot.providerId}" has a ${pct(rate)} attestation failure rate ` +
            `(${snapshot.attestationFailures}/${snapshot.attestationAttempts} attempts).`,
          recommendedAction:
            "Investigate oracle worker logs for authentication or network errors. " +
            "Verify the provider's TEE code hash is still approved in the registry contract. " +
            "Consider temporarily suspending this provider via the oracle router.",
          evidence: {
            failureRate: rate,
            attestationAttempts: snapshot.attestationAttempts,
            attestationFailures: snapshot.attestationFailures,
            threshold: cfg.failedAttestationRateThreshold,
          },
          generatedAt: now,
        })
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule: unexpected_output_volume
  // ------------------------------------------------------------------
  if (!inMaintenance && snapshot.baselineOutputCount > 0) {
    const ratio = snapshot.outputCount / snapshot.baselineOutputCount;
    if (ratio >= cfg.outputVolumeMultiplier) {
      alerts.push(
        makeAlert({
          id: genId("uov", snapshot.providerId),
          ruleId: "unexpected_output_volume",
          providerId: snapshot.providerId,
          severity: "medium",
          description:
            `Provider "${snapshot.providerId}" emitted ${snapshot.outputCount} certificates this window, ` +
            `${ratio.toFixed(1)}× the baseline of ${snapshot.baselineOutputCount}.`,
          recommendedAction:
            "Review oracle job submissions for signs of replay attacks or misconfigured batch jobs. " +
            "Cross-check output hashes against the provenance contract for legitimacy.",
          evidence: {
            outputCount: snapshot.outputCount,
            baselineOutputCount: snapshot.baselineOutputCount,
            ratio,
            threshold: cfg.outputVolumeMultiplier,
          },
          generatedAt: now,
        })
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule: signature_inconsistency  (fires even during maintenance)
  // ------------------------------------------------------------------
  if (snapshot.signatureValidationFailures >= cfg.signatureFailureCount) {
    alerts.push(
      makeAlert({
        id: genId("sig", snapshot.providerId),
        ruleId: "signature_inconsistency",
        providerId: snapshot.providerId,
        severity: "critical",
        description:
          `Provider "${snapshot.providerId}" produced ${snapshot.signatureValidationFailures} ` +
          `signature validation failure(s) this window. This may indicate key compromise or ` +
          `TEE code drift.`,
        recommendedAction:
          "Immediately suspend this provider via the oracle router. " +
          "Audit recent attestations from this provider against the registry contract. " +
          "Initiate key rotation and re-register the updated TEE code hash if confirmed compromised.",
        evidence: {
          signatureValidationFailures: snapshot.signatureValidationFailures,
          threshold: cfg.signatureFailureCount,
        },
        generatedAt: now,
      })
    );
  }

  // ------------------------------------------------------------------
  // Rule: provider_silence
  // ------------------------------------------------------------------
  if (!inMaintenance) {
    const nowSec = Math.floor(Date.now() / 1000);
    const silenceSec = nowSec - snapshot.lastActivitySec;
    if (silenceSec >= cfg.silenceWindowSec) {
      alerts.push(
        makeAlert({
          id: genId("sil", snapshot.providerId),
          ruleId: "provider_silence",
          providerId: snapshot.providerId,
          severity: "high",
          description:
            `Provider "${snapshot.providerId}" has been silent for ${Math.floor(silenceSec / 60)} min ` +
            `(last activity: ${new Date(snapshot.lastActivitySec * 1000).toISOString()}).`,
          recommendedAction:
            "Verify the oracle worker process is running and reachable. " +
            "Check for network isolation between the worker and the Stellar RPC endpoint. " +
            "If the provider cannot be reached, route traffic to an alternative provider.",
          evidence: {
            silenceSec,
            lastActivityAt: new Date(snapshot.lastActivitySec * 1000).toISOString(),
            threshold: cfg.silenceWindowSec,
          },
          generatedAt: now,
        })
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule: burst_submission
  // ------------------------------------------------------------------
  if (!inMaintenance && snapshot.baselineSubmissionCount > 0) {
    const ratio = snapshot.submissionCount / snapshot.baselineSubmissionCount;
    if (ratio >= cfg.burstSubmissionMultiplier) {
      alerts.push(
        makeAlert({
          id: genId("bst", snapshot.providerId),
          ruleId: "burst_submission",
          providerId: snapshot.providerId,
          severity: "medium",
          description:
            `Provider "${snapshot.providerId}" received ${snapshot.submissionCount} submissions this window, ` +
            `${ratio.toFixed(1)}× the baseline of ${snapshot.baselineSubmissionCount}. ` +
            `Possible replay or DoS attempt.`,
          recommendedAction:
            "Check the origin of recent submission requests for suspicious patterns. " +
            "Apply rate limiting to the /api/verify/submit endpoint if not already in place. " +
            "Review the audit log for any coordinated submission activity.",
          evidence: {
            submissionCount: snapshot.submissionCount,
            baselineSubmissionCount: snapshot.baselineSubmissionCount,
            ratio,
            threshold: cfg.burstSubmissionMultiplier,
          },
          generatedAt: now,
        })
      );
    }
  }

  // ------------------------------------------------------------------
  // Rule: attestation_reuse  (fires even during maintenance)
  // ------------------------------------------------------------------
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const hash of snapshot.attestationHashes) {
    if (seen.has(hash)) {
      duplicates.add(hash);
    }
    seen.add(hash);
  }
  if (duplicates.size > 0) {
    alerts.push(
      makeAlert({
        id: genId("reu", snapshot.providerId),
        ruleId: "attestation_reuse",
        providerId: snapshot.providerId,
        severity: "critical",
        description:
          `Provider "${snapshot.providerId}" submitted ${duplicates.size} duplicate attestation hash(es) ` +
          `within a single window. Attestation replay is a serious integrity violation.`,
        recommendedAction:
          "Reject all submissions carrying a duplicated attestation hash. " +
          "Suspend this provider immediately pending investigation. " +
          "Audit the provenance contract for certificates minted with the reused hash(es).",
        evidence: {
          duplicateHashCount: duplicates.size,
          duplicateHashes: Array.from(duplicates).join(", "),
        },
        generatedAt: now,
      })
    );
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Alert store interface
// ---------------------------------------------------------------------------

/**
 * Minimal persistence contract for anomaly alerts.
 * Implementations can use in-memory, database, or external alerting systems.
 */
export interface AnomalyAlertStore {
  /** Persist one or more alerts. */
  save(alerts: AnomalyAlert[]): Promise<void>;
  /** Return all unacknowledged alerts, optionally filtered by provider. */
  listPending(options?: { providerId?: string; severity?: AnomalySeverity }): Promise<AnomalyAlert[]>;
  /** Mark an alert as acknowledged by an operator. */
  acknowledge(alertId: string, acknowledgedBy: string): Promise<void>;
  /** Return historical alerts within a time range (ISO 8601). */
  queryHistory(options: { from: string; to: string; providerId?: string }): Promise<AnomalyAlert[]>;
}

// ---------------------------------------------------------------------------
// In-memory alert store (for testing / development)
// ---------------------------------------------------------------------------

export class InMemoryAnomalyAlertStore implements AnomalyAlertStore {
  private readonly alerts = new Map<string, AnomalyAlert>();

  async save(alerts: AnomalyAlert[]): Promise<void> {
    for (const alert of alerts) {
      this.alerts.set(alert.id, alert);
    }
  }

  async listPending(options?: {
    providerId?: string;
    severity?: AnomalySeverity;
  }): Promise<AnomalyAlert[]> {
    return Array.from(this.alerts.values()).filter((a) => {
      if (a.acknowledged) return false;
      if (options?.providerId && a.providerId !== options.providerId) return false;
      if (options?.severity && a.severity !== options.severity) return false;
      return true;
    });
  }

  async acknowledge(alertId: string, acknowledgedBy: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) return;
    this.alerts.set(alertId, {
      ...alert,
      acknowledged: true,
      evidence: { ...alert.evidence, acknowledgedBy },
    });
  }

  async queryHistory(options: {
    from: string;
    to: string;
    providerId?: string;
  }): Promise<AnomalyAlert[]> {
    const from = new Date(options.from).getTime();
    const to = new Date(options.to).getTime();
    return Array.from(this.alerts.values()).filter((a) => {
      const t = new Date(a.generatedAt).getTime();
      if (t < from || t > to) return false;
      if (options.providerId && a.providerId !== options.providerId) return false;
      return true;
    });
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function makeAlert(params: Omit<AnomalyAlert, "acknowledged">): AnomalyAlert {
  return { ...params, acknowledged: false };
}

function genId(prefix: string, providerId: string): string {
  return `${prefix}-${providerId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
