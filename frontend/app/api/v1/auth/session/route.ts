/**
 * POST   /api/v1/auth/session  — login: exchange an API credential for a session
 * GET    /api/v1/auth/session  — current session state for the presented access token
 * DELETE /api/v1/auth/session  — logout: revoke the current session
 *
 * Lifecycle and expiry rules: docs/security/auth-session-refresh.md (#783).
 */
import { ApiError } from "@/lib/api/errors";
import { defineRoute, ok } from "@/lib/api/handler";
import { bearerToken, requireActor } from "@/lib/server/auth";
import { authenticateAccessToken, createSession, isSessionToken, revokeSession } from "@/lib/server/auth-sessions";

const NO_STORE = { "Cache-Control": "no-store" };

function requireSessionToken(raw: string | null): string {
  if (!raw) throw new ApiError("UNAUTHENTICATED");
  if (!isSessionToken(raw)) throw new ApiError("SESSION_INVALID", { message: "Send the session access token." });
  return raw;
}

export const POST = defineRoute("1", async (req) => {
  // A session can't mint another session; that would sidestep the absolute lifetime.
  const raw = bearerToken(req);
  if (raw && isSessionToken(raw)) {
    throw new ApiError("BAD_REQUEST", { message: "Use /api/v1/auth/session/refresh to renew an existing session." });
  }
  const actor = requireActor(req);
  return ok(createSession(actor), { status: 201, headers: NO_STORE });
});

export const GET = defineRoute("1", async (req) => {
  const { session } = authenticateAccessToken(requireSessionToken(bearerToken(req)));
  return ok(session, { headers: NO_STORE });
});

export const DELETE = defineRoute("1", async (req) => {
  const { session } = authenticateAccessToken(requireSessionToken(bearerToken(req)));
  return ok(revokeSession(session.sessionId, "logout") ?? session, { headers: NO_STORE });
});
