/**
 * Attestation Result Verification Pipeline (#649)
 *
 * Validates attestation results before they influence final trust decisions.
 * Checks integrity, provenance, and mismatch conditions. Suspicious results
 * are flagged and never silently accepted.
 */

import type { AttestationEvidence, ApiResponse } from "@stellarveriphy/shared";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttestationStatus =
  | "valid"
  | "integrity_failure"
  | "mismatch"
  | "suspicious"
  | "rejected";

export interface AttestationCheckResult {
  /** Overall pipeline outcome. */
  status: AttestationStatus;
  /** Human-readable explanation for operators and the UI. */
  message: string;
  /** Individual check outcomes for detailed display. */
  checks: AttestationChecks;
  /** The original evidence that was evaluated. */
  evidence: AttestationEvidence;
  /** ISO 8601 timestamp of when the pipeline ran. */
  evaluatedAt: string;
  /** Risk score 0–100; ≥70 is flagged suspicious. */
  riskScore: number;
}

export interface AttestationChecks {
  signatureValid: boolean;
  teeHashApproved: boolean;
  contentHashMatches: boolean;
  creatorAuthorized: boolean;
  enclaveIdentified: boolean;
  noMismatch: boolean;
}

export interface PipelineAuditEntry {
  certificateId?: string;
  jobId: string;
  status: AttestationStatus;
  riskScore: number;
  evaluatedAt: string;
  details: string;
}

// ---------------------------------------------------------------------------
// Integrity checks
// ---------------------------------------------------------------------------

function checkSignature(evidence: AttestationEvidence): boolean {
  return evidence.attestationValid === true;
}

function checkTeeHash(evidence: AttestationEvidence): boolean {
  return evidence.teeCodeHashApproved === true;
}

function checkContentHash(evidence: AttestationEvidence): boolean {
  return evidence.contentHashMatches === true;
}

function checkCreatorAuth(evidence: AttestationEvidence): boolean {
  return evidence.creatorSigned === true;
}

function checkEnclaveIdentified(evidence: AttestationEvidence): boolean {
  return typeof evidence.enclave === "string" && evidence.enclave.trim().length > 0;
}

/**
 * Detects internal consistency issues — e.g. teeHash field present but
 * attestationHash is empty, which would indicate a tampered payload.
 */
function checkNoMismatch(evidence: AttestationEvidence): boolean {
  const hasAttestationHash =
    typeof evidence.attestationHash === "string" && evidence.attestationHash.length > 0;
  const hasTeeHash =
    typeof evidence.teeCodeHash === "string" && evidence.teeCodeHash.length > 0;

  // Both attestation fields must be populated or both absent together
  if (hasAttestationHash !== hasTeeHash) return false;

  // If the attestation claims to be valid but the hash is empty, that is a mismatch
  if (evidence.attestationValid && !hasAttestationHash) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Risk scoring
// ---------------------------------------------------------------------------

function computeRiskScore(checks: AttestationChecks): number {
  const weights: Record<keyof AttestationChecks, number> = {
    signatureValid: 30,
    teeHashApproved: 25,
    contentHashMatches: 20,
    creatorAuthorized: 15,
    enclaveIdentified: 5,
    noMismatch: 5,
  };

  let risk = 0;
  for (const [key, weight] of Object.entries(weights) as [keyof AttestationChecks, number][]) {
    if (!checks[key]) risk += weight;
  }
  return risk;
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

/**
 * Run the full attestation verification pipeline on a single evidence object.
 *
 * The pipeline never throws — it always returns a structured result so that
 * callers can make an informed trust decision rather than catching exceptions.
 */
export function runAttestationPipeline(evidence: AttestationEvidence): AttestationCheckResult {
  const evaluatedAt = new Date().toISOString();

  const checks: AttestationChecks = {
    signatureValid: checkSignature(evidence),
    teeHashApproved: checkTeeHash(evidence),
    contentHashMatches: checkContentHash(evidence),
    creatorAuthorized: checkCreatorAuth(evidence),
    enclaveIdentified: checkEnclaveIdentified(evidence),
    noMismatch: checkNoMismatch(evidence),
  };

  const riskScore = computeRiskScore(checks);

  let status: AttestationStatus;
  let message: string;

  if (!checks.noMismatch) {
    status = "mismatch";
    message =
      "Attestation fields are internally inconsistent. The payload may have been tampered with.";
  } else if (!checks.signatureValid) {
    status = "integrity_failure";
    message = "Attestation signature is invalid. The result cannot be trusted.";
  } else if (!checks.teeHashApproved) {
    status = "rejected";
    message =
      "TEE code hash is not in the approved registry. The enclave binary is untrusted.";
  } else if (!checks.contentHashMatches) {
    status = "integrity_failure";
    message =
      "Content hash computed inside the TEE does not match the manifest. The media may have been altered.";
  } else if (!checks.creatorAuthorized) {
    status = "suspicious";
    message =
      "Creator did not sign the verification request. Origin cannot be fully confirmed.";
  } else if (riskScore >= 70) {
    status = "suspicious";
    message = `High cumulative risk score (${riskScore}/100). Manual review recommended.`;
  } else {
    status = "valid";
    message = "All attestation checks passed. The result is trusted.";
  }

  const result: AttestationCheckResult = {
    status,
    message,
    checks,
    evidence,
    evaluatedAt,
    riskScore,
  };

  // Emit a structured log entry so operators can monitor from their log tooling
  const level =
    status === "valid" ? "info" : status === "suspicious" ? "warn" : "error";
  logger[level](`[attestation-pipeline] status=${status} risk=${riskScore}`, {
    status,
    riskScore,
    checks,
    evaluatedAt,
  });

  return result;
}

// ---------------------------------------------------------------------------
// API wrapper
// ---------------------------------------------------------------------------

/**
 * POST /api/attestation/validate — submit evidence to the pipeline via HTTP.
 */
export async function validateAttestationRemote(
  evidence: AttestationEvidence,
): Promise<ApiResponse<AttestationCheckResult>> {
  try {
    const response = await fetch("/api/attestation/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence }),
    });
    return response.json() as Promise<ApiResponse<AttestationCheckResult>>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during attestation validation",
    };
  }
}
