/**
 * certificateRegenerationService.ts
 *
 * Implements the provenance certificate regeneration flow (#653).
 *
 * Design principles:
 * - The original on-chain certificate is NEVER deleted; it remains auditable.
 * - A regeneration creates a NEW certificate that references the previous one
 *   via `predecessorId`, forming an auditable chain.
 * - Regeneration is only permitted under well-defined conditions checked by
 *   `evaluateRegenerationEligibility`.
 * - Every regeneration request is logged as a `certificate_renewed` provenance
 *   event so maintainers can review the full lifecycle.
 */

import type { ProvenanceCert } from "@stellarveriphy/shared/types";
import type { ApiResponse } from "@stellarveriphy/shared/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Reasons a certificate may be legitimately regenerated. */
export type RegenerationReason =
  | "metadata_updated"          // Creator changed manifest metadata
  | "storage_ref_changed"       // Content moved to a new storage location
  | "attestation_refresh"       // TEE attestation has expired and must be renewed
  | "creator_key_rotation"      // Creator rotated their Stellar signing key
  | "correction";               // Maintainer-approved factual correction

/** Human-readable labels used in the review UI. */
export const REGENERATION_REASON_LABELS: Record<RegenerationReason, string> = {
  metadata_updated: "Metadata updated",
  storage_ref_changed: "Storage reference changed",
  attestation_refresh: "Attestation refresh required",
  creator_key_rotation: "Creator key rotation",
  correction: "Maintainer-approved correction",
};

/** Reasons that block regeneration. */
export type RegenerationBlocker =
  | "certificate_revoked"
  | "wallet_not_connected"
  | "not_certificate_owner"
  | "already_pending"
  | "insufficient_review_approval";

export interface RegenerationEligibility {
  eligible: boolean;
  blockers: RegenerationBlocker[];
  warnings: string[];
}

export interface RegenerationRequest {
  certificateId: string;
  reason: RegenerationReason;
  /** Updated manifest hash if metadata changed; null otherwise. */
  newManifestHash: string | null;
  /** Updated storage reference if content was moved; null otherwise. */
  newStorageRef: string | null;
  /** Free-form note for the audit record (displayed to maintainers). */
  reviewNote: string;
  /** Stellar public key of the requester (must be the certificate owner). */
  requesterKey: string;
}

export interface RegenerationResult {
  /** The newly minted certificate that supersedes the original. */
  newCertificate: ProvenanceCert & { predecessorId: string };
  /** ID of the original certificate preserved for historical auditing. */
  predecessorId: string;
  /** ISO 8601 timestamp of the regeneration. */
  regeneratedAt: string;
  /** Stellar transaction hash for the new mint. */
  txHash: string;
}

export interface RegenerationHistoryEntry {
  certificateId: string;
  predecessorId: string;
  reason: RegenerationReason;
  reviewNote: string;
  regeneratedAt: string;
  requesterKey: string;
  txHash: string;
}

// ---------------------------------------------------------------------------
// Eligibility check
// ---------------------------------------------------------------------------

/**
 * Evaluates whether a certificate is eligible for regeneration.
 *
 * @param cert - The current certificate record.
 * @param connectedKey - The Stellar public key of the connected wallet.
 * @param hasPendingRegeneration - Whether a regeneration is already in progress.
 * @param isMaintainerApproved - Whether a maintainer has signed off (required for "correction").
 * @param reason - The requested regeneration reason.
 */
export function evaluateRegenerationEligibility(
  cert: ProvenanceCert & { status?: string },
  connectedKey: string | null,
  hasPendingRegeneration: boolean,
  isMaintainerApproved: boolean,
  reason: RegenerationReason,
): RegenerationEligibility {
  const blockers: RegenerationBlocker[] = [];
  const warnings: string[] = [];

  if (cert.status === "revoked") {
    blockers.push("certificate_revoked");
  }

  if (!connectedKey) {
    blockers.push("wallet_not_connected");
  } else if (connectedKey !== cert.creator && connectedKey !== cert.owner) {
    blockers.push("not_certificate_owner");
  }

  if (hasPendingRegeneration) {
    blockers.push("already_pending");
  }

  if (reason === "correction" && !isMaintainerApproved) {
    blockers.push("insufficient_review_approval");
  }

  // Non-blocking warnings
  if (reason === "creator_key_rotation") {
    warnings.push(
      "Key rotation regeneration changes the on-chain creator field. Ensure your old key has been properly retired.",
    );
  }

  if (reason === "attestation_refresh") {
    warnings.push(
      "The existing attestation hash will be replaced. Both old and new attestation records remain auditable on-chain.",
    );
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Regeneration request submission
// ---------------------------------------------------------------------------

/**
 * Submits a certificate regeneration request to the backend API.
 *
 * The backend will:
 *  1. Re-run the TEE attestation pipeline with the updated manifest/storage ref.
 *  2. Mint a new Soroban ProvenanceCert with `predecessor_id` set.
 *  3. Emit a `certificate_renewed` provenance event linking old → new.
 *  4. Return the new certificate details.
 */
export async function submitRegenerationRequest(
  request: RegenerationRequest,
): Promise<ApiResponse<RegenerationResult>> {
  try {
    const response = await fetch("/api/certificates/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        success: false,
        error: (body as { error?: string }).error ?? `HTTP ${response.status}: Regeneration request failed`,
      };
    }

    const data = await response.json();
    return { success: true, data: data as RegenerationResult };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error during regeneration request",
    };
  }
}

// ---------------------------------------------------------------------------
// Regeneration history
// ---------------------------------------------------------------------------

/**
 * Fetches the full regeneration chain for a certificate (i.e. all predecessors
 * and successors in the lineage). Sorted oldest → newest.
 */
export async function fetchRegenerationHistory(
  certificateId: string,
): Promise<ApiResponse<RegenerationHistoryEntry[]>> {
  try {
    const response = await fetch(
      `/api/certificates/${encodeURIComponent(certificateId)}/regeneration-history`,
    );

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: Could not fetch regeneration history`,
      };
    }

    const data = await response.json();
    return { success: true, data: data as RegenerationHistoryEntry[] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

// ---------------------------------------------------------------------------
// Blocker and warning label helpers (for display in the UI)
// ---------------------------------------------------------------------------

export const BLOCKER_MESSAGES: Record<RegenerationBlocker, string> = {
  certificate_revoked:
    "This certificate has been revoked and cannot be regenerated.",
  wallet_not_connected:
    "Connect your wallet to proceed. You must be the certificate owner.",
  not_certificate_owner:
    "Your connected wallet is not the owner of this certificate.",
  already_pending:
    "A regeneration for this certificate is already in progress. Wait for it to complete.",
  insufficient_review_approval:
    "Factual corrections require maintainer approval before regeneration can proceed.",
};
