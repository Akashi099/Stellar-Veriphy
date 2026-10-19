/**
 * POST /api/certificates/regenerate
 *
 * Handles provenance certificate regeneration requests (#653).
 *
 * The original certificate is preserved on-chain for auditability.
 * A new certificate is minted that references the predecessor via
 * `predecessorId`, forming an auditable lineage chain.
 *
 * Request body: RegenerationRequest (see certificateRegenerationService.ts)
 * Response: RegenerationResult
 */

import { NextRequest, NextResponse } from "next/server";

import type { RegenerationResult } from "@/services/certificateRegenerationService";
import { validateRegenerationRequest } from "@/lib/server/validators";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  // Shared validation (lib/server/validators.ts): requesterKey gets a full
  // StrKey checksum check, hashes are normalized.
  const validation = validateRegenerationRequest(body);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.errors.map((e) => `${e.field}: ${e.message}`).join(" "), errors: validation.errors },
      { status: 400 },
    );
  }
  const { certificateId, newManifestHash, newStorageRef, requesterKey } = validation.value;

  // ---------------------------------------------------------------------------
  // Regeneration logic
  //
  // Production implementation wires up:
  //   1. Ownership verification via the Soroban provenance contract.
  //   2. TEE oracle re-attestation pipeline.
  //   3. A new `mint` call with `predecessor_id` set.
  //   4. A `certificate_renewed` provenance event emission.
  //
  // For the current milestone the endpoint returns a well-formed mock result
  // that exercises the full request / response contract, enabling the frontend
  // and tests to proceed while the smart-contract integration lands.
  // ---------------------------------------------------------------------------

  const now = new Date().toISOString();
  const newCertId = `${certificateId}-r${Date.now()}`;

  // Simulate processing delay representative of TEE round-trip
  await new Promise((r) => setTimeout(r, 0));

  const result: RegenerationResult = {
    newCertificate: {
      id: newCertId,
      storageRef: newStorageRef ?? `ipfs://regenerated-${certificateId}`,
      manifestHash: newManifestHash ?? `0000${certificateId.replace(/\D/g, "").padStart(60, "0")}`,
      attestationHash: `regen${Date.now().toString(16).padStart(60, "0")}`,
      creator: requesterKey,
      timestamp: Math.floor(Date.now() / 1000),
      predecessorId: certificateId,
    },
    predecessorId: certificateId,
    regeneratedAt: now,
    txHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`,
  };

  return NextResponse.json(result, { status: 201 });
}
