/**
 * POST /api/tokens/[id]/rotate  — issue a replacement token
 *
 * Body: { graceHours?: number, ttlDays?: number }
 * The old secret keeps working for `graceHours` (default 24) so clients can
 * be redeployed without downtime. Use `graceHours: 0` when compromised.
 */
import { ApiTokenPolicyError, rotateApiToken, toPublicApiToken } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

import { apiTokenRepository, auditTokenEvent, requireApiToken } from "@/lib/security/apiTokenStore";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiToken(request, "tokens:manage", "admin");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const current = apiTokenRepository.get(id);
  if (!current) return NextResponse.json({ success: false, error: "Token not found." }, { status: 404 });

  let body: { graceHours?: number; ttlDays?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // Body is optional.
  }

  try {
    const { previous, next } = await rotateApiToken(current, {
      graceHours: typeof body.graceHours === "number" ? body.graceHours : undefined,
      ttlDays: typeof body.ttlDays === "number" ? body.ttlDays : undefined,
    });
    apiTokenRepository.save(previous);
    apiTokenRepository.save(next.record);
    auditTokenEvent("api_token_rotated", previous, guard.actor, {
      successorId: next.record.id,
      graceUntil: previous.graceUntil,
    });
    auditTokenEvent("api_token_issued", next.record, guard.actor, { rotatedFromId: previous.id });

    return NextResponse.json(
      {
        success: true,
        data: { previous: toPublicApiToken(previous), token: toPublicApiToken(next.record), secret: next.secret },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof ApiTokenPolicyError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    throw err;
  }
}
