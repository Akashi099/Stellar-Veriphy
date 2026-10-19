/**
 * GET    /api/tokens/[id]  — token metadata and lifecycle status
 * DELETE /api/tokens/[id]  — revoke immediately (body: { reason })
 */
import { revokeApiToken, toPublicApiToken, type ApiTokenRevocationReason } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

import { apiTokenRepository, auditTokenEvent, requireApiToken } from "@/lib/security/apiTokenStore";

export const dynamic = "force-dynamic";

const REASONS: ApiTokenRevocationReason[] = [
  "user_requested",
  "compromised",
  "rotated",
  "owner_removed",
  "policy_violation",
];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiToken(request, "tokens:manage", "admin");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const record = apiTokenRepository.get(id);
  if (!record) return NextResponse.json({ success: false, error: "Token not found." }, { status: 404 });
  return NextResponse.json({ success: true, data: toPublicApiToken(record) });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiToken(request, "tokens:manage", "admin");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const record = apiTokenRepository.get(id);
  if (!record) return NextResponse.json({ success: false, error: "Token not found." }, { status: 404 });

  let reason: ApiTokenRevocationReason = "user_requested";
  try {
    const body = (await request.json()) as { reason?: string };
    if (body.reason && REASONS.includes(body.reason as ApiTokenRevocationReason)) {
      reason = body.reason as ApiTokenRevocationReason;
    }
  } catch {
    // Body is optional for DELETE.
  }

  const revoked = revokeApiToken(record, reason);
  apiTokenRepository.save(revoked);

  // A compromised token usually lives in the same client config as the token
  // it replaced, so also end that predecessor's rotation grace window.
  if (reason === "compromised" && record.rotatedFromId) {
    const predecessor = apiTokenRepository.get(record.rotatedFromId);
    if (predecessor && !predecessor.revokedAt) {
      apiTokenRepository.save(revokeApiToken(predecessor, "compromised"));
      auditTokenEvent("api_token_revoked", predecessor, guard.actor, { reason, cascade: true });
    }
  }

  auditTokenEvent("api_token_revoked", revoked, guard.actor, { reason });
  return NextResponse.json({ success: true, data: toPublicApiToken(revoked) });
}
