/**
 * POST /api/v1/auth/session/refresh { refreshToken }
 *
 * Rotates the session's access and refresh tokens. The access token does not
 * need to be valid; the refresh token alone authorises renewal (#783).
 */
import { ApiError } from "@/lib/api/errors";
import { defineRoute, ok, readJsonBody, requireObject } from "@/lib/api/handler";
import { refreshSession } from "@/lib/server/auth-sessions";

export const POST = defineRoute("1", async (req) => {
  const { refreshToken } = requireObject(await readJsonBody(req));
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    throw ApiError.validation([{ field: "refreshToken", code: "required", message: "refreshToken is required." }]);
  }
  return ok(refreshSession(refreshToken), { headers: { "Cache-Control": "no-store" } });
});
