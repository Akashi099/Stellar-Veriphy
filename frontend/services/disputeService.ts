/**
 * disputeService.ts
 *
 * Service layer for the content dispute and governance workflow.
 *
 * Two distinct dispute tracks exist in StellarVeriphy:
 *
 *   1. **Provider disputes** (on-chain) — filed by a requester against an
 *      oracle provider via `oracle.file_dispute`. Concerns verification
 *      quality — e.g. the provider produced an incorrect attestation.
 *      Managed by the oracle contract; surfaced here for read-only display.
 *
 *   2. **Content disputes** (off-chain queue) — filed by anyone against a
 *      published provenance certificate. Concerns the content itself —
 *      e.g. the certificate was minted for fraudulent media. Managed by
 *      the admin moderation queue and resolved by an operator.
 *
 * This service covers both tracks. Content disputes go through the
 * `/api/disputes` route; provider disputes go through `/api/oracles/disputes`.
 */

import type {
  DisputeEvidence,
  DisputeRecord,
  DisputeAuditEntry,
  RaiseDisputeRequest,
  DisputeResolutionRequest,
} from "@/types/dispute";
import type { ApiResponse } from "@stellarveriphy/shared/types";

// ---------------------------------------------------------------------------
// Content dispute operations
// ---------------------------------------------------------------------------

/**
 * Raise a new content dispute against a provenance certificate.
 * Returns the created {@link DisputeRecord}.
 */
export async function raiseContentDispute(
  req: RaiseDisputeRequest,
): Promise<ApiResponse<DisputeRecord>> {
  try {
    const res = await fetch("/api/disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    const data: ApiResponse<DisputeRecord> = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Fetch a single content dispute by its ID.
 */
export async function getContentDispute(
  disputeId: string,
): Promise<ApiResponse<DisputeRecord>> {
  try {
    const res = await fetch(`/api/disputes/${disputeId}`);
    const data: ApiResponse<DisputeRecord> = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Fetch all content disputes for a specific certificate.
 */
export async function getDisputesForCertificate(
  certificateId: string,
): Promise<ApiResponse<DisputeRecord[]>> {
  try {
    const res = await fetch(
      `/api/disputes?certificateId=${encodeURIComponent(certificateId)}`,
    );
    const data: ApiResponse<DisputeRecord[]> = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Attach structured evidence to an existing open dispute.
 */
export async function attachEvidence(
  disputeId: string,
  evidence: DisputeEvidence,
): Promise<ApiResponse<DisputeRecord>> {
  try {
    const res = await fetch(`/api/disputes/${disputeId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evidence),
    });
    const data: ApiResponse<DisputeRecord> = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Admin: resolve or dismiss a content dispute.
 */
export async function resolveContentDispute(
  disputeId: string,
  resolution: DisputeResolutionRequest,
): Promise<ApiResponse<DisputeRecord>> {
  try {
    const res = await fetch(`/api/disputes/${disputeId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resolution),
    });
    const data: ApiResponse<DisputeRecord> = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Fetch the full audit trail for a dispute (every status transition and action).
 */
export async function getDisputeAuditTrail(
  disputeId: string,
): Promise<ApiResponse<DisputeAuditEntry[]>> {
  try {
    const res = await fetch(`/api/disputes/${disputeId}/audit`);
    const data: ApiResponse<DisputeAuditEntry[]> = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
