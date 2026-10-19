/**
 * POST /api/attestation/validate
 *
 * Runs the attestation result verification pipeline and returns the
 * structured outcome. Suspicious or invalid results are flagged in the
 * response and never silently accepted.
 */
import { NextRequest, NextResponse } from "next/server";

import type { AttestationEvidence } from "@stellarveriphy/shared";
import type { ApiResponse, AttestationCheckResult } from "@/services/attestationPipelineService";
import { runAttestationPipeline } from "@/services/attestationPipelineService";
import { logOperationalEvent, requestIdFrom } from "@/lib/server/observability";

function isAttestationEvidence(obj: unknown): obj is AttestationEvidence {
  if (typeof obj !== "object" || obj === null) return false;
  const e = obj as Record<string, unknown>;
  return (
    typeof e["enclave"] === "string" &&
    typeof e["attestationHash"] === "string" &&
    typeof e["attestationValid"] === "boolean" &&
    typeof e["teeCodeHash"] === "string" &&
    typeof e["teeCodeHashApproved"] === "boolean" &&
    typeof e["contentHashMatches"] === "boolean" &&
    typeof e["creatorSigned"] === "boolean"
  );
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<AttestationCheckResult>>> {
  const requestId = requestIdFrom(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Malformed JSON payload." },
      { status: 400 },
    );
  }

  const evidence =
    body && typeof body === "object" && "evidence" in body
      ? (body as Record<string, unknown>)["evidence"]
      : undefined;

  if (!isAttestationEvidence(evidence)) {
    logOperationalEvent("warn", "attestation_validate.rejected", {
      requestId,
      route: "POST /api/attestation/validate",
      status: 400,
      reason: "invalid_evidence_shape",
    });
    return NextResponse.json(
      {
        success: false,
        error:
          "Request body must include an `evidence` object with all required attestation fields.",
      },
      { status: 400 },
    );
  }

  const result = runAttestationPipeline(evidence);

  logOperationalEvent(
    result.status === "valid" ? "info" : "warn",
    "attestation_validate.completed",
    {
      requestId,
      route: "POST /api/attestation/validate",
      status: 200,
      attestationStatus: result.status,
      riskScore: result.riskScore,
    },
  );

  return NextResponse.json({ success: true, data: result });
}
