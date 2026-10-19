/**
 * GET  /api/tokens  — list API tokens (never returns secrets or digests)
 * POST /api/tokens  — issue a new token; the plaintext secret is returned once
 *
 * Requires an admin-surface token with `tokens:manage`. The very first admin
 * token can be issued with the `x-bootstrap-secret` header matching
 * `API_TOKEN_BOOTSTRAP_SECRET` while no admin token exists (#670).
 */
import {
  API_TOKEN_SCOPES,
  API_TOKEN_SURFACES,
  ApiTokenPolicyError,
  issueApiToken,
  timingSafeEqualHex,
  toPublicApiToken,
  type ApiTokenScope,
  type ApiTokenSurface,
} from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

import { apiTokenRepository, auditTokenEvent, requireApiToken } from "@/lib/security/apiTokenStore";

export const dynamic = "force-dynamic";

function isBootstrap(request: NextRequest): boolean {
  const expected = process.env.API_TOKEN_BOOTSTRAP_SECRET;
  const provided = request.headers.get("x-bootstrap-secret");
  if (!expected || !provided) return false;
  const hasAdminToken = apiTokenRepository
    .list()
    .some((t) => t.surface === "admin" && !t.revokedAt && Date.parse(t.expiresAt) > Date.now());
  return !hasAdminToken && timingSafeEqualHex(expected, provided);
}

export async function GET(request: NextRequest) {
  const guard = await requireApiToken(request, "tokens:manage", "admin");
  if (!guard.ok) return guard.response;

  const owner = new URL(request.url).searchParams.get("owner") ?? undefined;
  const now = new Date();
  return NextResponse.json(
    { success: true, data: apiTokenRepository.list(owner).map((t) => toPublicApiToken(t, now)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

interface IssueBody {
  name?: string;
  owner?: string;
  surface?: string;
  scopes?: string[];
  ttlDays?: number;
  allowedOrigins?: string[];
}

export async function POST(request: NextRequest) {
  const bootstrap = isBootstrap(request);
  const guard = bootstrap ? ({ ok: true, actor: "bootstrap" } as const) : await requireApiToken(request, "tokens:manage", "admin");
  if (!guard.ok) return guard.response;

  let body: IssueBody;
  try {
    body = (await request.json()) as IssueBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.surface || !API_TOKEN_SURFACES.includes(body.surface as ApiTokenSurface)) {
    return NextResponse.json(
      { success: false, error: `surface must be one of: ${API_TOKEN_SURFACES.join(", ")}.` },
      { status: 422 },
    );
  }
  if (bootstrap && body.surface !== "admin") {
    return NextResponse.json({ success: false, error: "Bootstrap may only issue an admin token." }, { status: 403 });
  }
  const unknownScopes = (body.scopes ?? []).filter((s) => !API_TOKEN_SCOPES.includes(s as ApiTokenScope));
  if (unknownScopes.length > 0) {
    return NextResponse.json({ success: false, error: `Unknown scopes: ${unknownScopes.join(", ")}.` }, { status: 422 });
  }
  const owner = body.owner?.trim() || guard.actor;
  if (!owner) {
    return NextResponse.json({ success: false, error: "owner is required." }, { status: 422 });
  }

  try {
    const { record, secret } = await issueApiToken({
      name: body.name ?? "",
      owner,
      surface: body.surface as ApiTokenSurface,
      scopes: (body.scopes ?? []) as ApiTokenScope[],
      ttlDays: body.ttlDays,
      allowedOrigins: body.allowedOrigins,
    });
    apiTokenRepository.save(record);
    auditTokenEvent("api_token_issued", record, guard.actor, { bootstrap });

    return NextResponse.json(
      { success: true, data: { token: toPublicApiToken(record), secret } },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof ApiTokenPolicyError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 422 });
    }
    throw err;
  }
}
