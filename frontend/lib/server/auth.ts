import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { authenticateAccessToken, isSessionToken } from "./auth-sessions";

export type Role = "admin" | "moderator" | "user";

export interface Actor {
  // For "user" actors this is their Stellar address.
  subject: string;
  role: Role;
}

const ROLES = new Set<Role>(["admin", "moderator", "user"]);

interface TokenEntry extends Actor {
  digest: Buffer;
}

let cachedTokens: { source: string; entries: TokenEntry[] } | null = null;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// Interim bearer-token auth until wallet-signature sessions land. Tokens are
// configured as API_TOKENS="token:role:subject,token:role:subject".
function loadTokens(): TokenEntry[] {
  const source = process.env.API_TOKENS ?? "";
  if (cachedTokens?.source === source) return cachedTokens.entries;

  const entries: TokenEntry[] = [];
  for (const item of source.split(",")) {
    const [token, role, subject] = item.trim().split(":");
    if (!token || !subject || !ROLES.has(role as Role)) continue;
    entries.push({ digest: digest(token), role: role as Role, subject });
  }
  cachedTokens = { source, entries };
  return entries;
}

export function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  const match = header ? /^Bearer\s+(.+)$/i.exec(header) : null;
  return match ? match[1].trim() : null;
}

// Static API_TOKENS only; session access tokens are resolved in requireActor.
function getTokenActor(raw: string): Actor | null {
  const presented = digest(raw);
  let found: Actor | null = null;
  for (const entry of loadTokens()) {
    // Compare every entry so timing doesn't reveal which token matched.
    if (timingSafeEqual(entry.digest, presented) && !found) {
      found = { subject: entry.subject, role: entry.role };
    }
  }
  return found;
}

export function getActor(req: NextRequest): Actor | null {
  const raw = bearerToken(req);
  if (!raw) return null;
  if (!isSessionToken(raw)) return getTokenActor(raw);
  try {
    return authenticateAccessToken(raw).actor;
  } catch {
    return null;
  }
}

// Throws UNAUTHENTICATED when no credentials are sent, and a SESSION_* error
// (expired, revoked, invalid) when a session token is sent but can't be used.
export function requireActor(req: NextRequest, allowedRoles?: readonly Role[]): Actor {
  const raw = bearerToken(req);
  if (!raw) throw new ApiError("UNAUTHENTICATED");
  const actor = isSessionToken(raw) ? authenticateAccessToken(raw).actor : getTokenActor(raw);
  if (!actor) throw new ApiError("UNAUTHENTICATED");
  if (allowedRoles && !allowedRoles.includes(actor.role)) throw new ApiError("FORBIDDEN");
  return actor;
}

// Throws FORBIDDEN when the actor's role is not in `roles`. Centralizes role
// checks so every sensitive screen/route denies access the same way.
export function assertRole(actor: Actor, roles: readonly Role[]): Actor {
  if (!roles.includes(actor.role)) throw new ApiError("FORBIDDEN");
  return actor;
}

// Convenience guard for admin-only surfaces.
export function requireAdmin(req: NextRequest): Actor {
  return assertRole(requireActor(req), ["admin"]);
}

export type GuardResult =
  | { ok: true; actor: Actor }
  | { ok: false; response: NextResponse };

// Route-handler guard: resolves the actor and enforces `roles`, returning a
// standard 401/403 JSON response instead of throwing so handlers can simply
// `if (!guard.ok) return guard.response;`.
export function guardRoute(req: NextRequest, roles: readonly Role[]): GuardResult {
  try {
    return { ok: true, actor: assertRole(requireActor(req), roles) };
  } catch (error) {
    if (error instanceof ApiError) {
      const status = error.code === "FORBIDDEN" ? 403 : 401;
      return {
        ok: false,
        response: NextResponse.json(
          { error: { code: error.code, message: error.message } },
          { status },
        ),
      };
    }
    throw error;
  }
}

// Admin-only variant of guardRoute for sensitive admin route handlers.
export function guardAdminRoute(req: NextRequest): GuardResult {
  return guardRoute(req, ["admin"]);
}
