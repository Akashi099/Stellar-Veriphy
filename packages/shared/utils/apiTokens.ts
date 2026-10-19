/**
 * apiTokens.ts (#670)
 *
 * Lifecycle model for StellarVeriphy API tokens: issuance, expiration,
 * rotation (with an overlap grace window so clients can roll over without
 * downtime), revocation, and access segmentation by product surface and scope.
 *
 * Security properties:
 * - The plaintext secret is returned exactly once, at issuance/rotation. Only
 *   a SHA-256 digest of the secret is ever stored.
 * - Tokens are prefixed (`svk_<surface>_`) so leaked tokens are easy to
 *   recognise in logs and by secret scanners.
 * - Every token is bound to one surface; scopes outside that surface's
 *   allow-list are rejected at issuance and again at authorization time.
 * - Every token expires. The maximum lifetime is capped per surface.
 *
 * The module has no runtime imports so it works in route handlers, the
 * browser and Node scripts.
 *
 * @module packages/shared/utils/apiTokens
 */

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** Product surfaces a token can be issued for. A token is bound to exactly one. */
export const API_TOKEN_SURFACES = ["frontend", "extension", "sdk", "scripts", "admin"] as const;
export type ApiTokenSurface = (typeof API_TOKEN_SURFACES)[number];

export const API_TOKEN_SCOPES = [
  "verification:read",
  "verification:write",
  "certificates:read",
  "provenance:read",
  "provenance:export",
  "provenance:replay",
  "uploads:write",
  "oracles:read",
  "moderation:read",
  "moderation:write",
  "tokens:manage",
] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

/** Scopes each surface may ever hold. Anything outside this list is refused. */
export const SURFACE_ALLOWED_SCOPES: Record<ApiTokenSurface, readonly ApiTokenScope[]> = {
  frontend: ["verification:read", "verification:write", "certificates:read", "provenance:read", "uploads:write", "oracles:read"],
  extension: ["verification:read", "certificates:read", "provenance:read"],
  sdk: ["verification:read", "verification:write", "certificates:read", "provenance:read", "provenance:export", "uploads:write", "oracles:read"],
  scripts: ["provenance:read", "provenance:export", "provenance:replay", "oracles:read"],
  admin: ["moderation:read", "moderation:write", "oracles:read", "provenance:read", "provenance:replay", "tokens:manage"],
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default and maximum lifetimes per surface. Admin tokens are deliberately short-lived. */
export const SURFACE_TTL_DAYS: Record<ApiTokenSurface, { default: number; max: number }> = {
  frontend: { default: 30, max: 90 },
  extension: { default: 90, max: 180 },
  sdk: { default: 90, max: 365 },
  scripts: { default: 30, max: 90 },
  admin: { default: 7, max: 30 },
};

/** How long the previous secret keeps working after a rotation. */
export const DEFAULT_ROTATION_GRACE_HOURS = 24;
/** Window before expiry during which the token is reported as `expiring`. */
export const EXPIRY_WARNING_DAYS = 7;

export type ApiTokenStatus = "active" | "expiring" | "rotating" | "expired" | "revoked";

export type ApiTokenRevocationReason =
  | "user_requested"
  | "compromised"
  | "rotated"
  | "owner_removed"
  | "policy_violation";

/** Persisted token record. Never contains the plaintext secret. */
export interface ApiTokenRecord {
  id: string;
  name: string;
  /** Stellar address / user id that owns the token. */
  owner: string;
  surface: ApiTokenSurface;
  scopes: ApiTokenScope[];
  /** First characters of the secret, safe to display (e.g. `svk_sdk_3f9a…`). */
  displayPrefix: string;
  /** SHA-256 hex digest of the full secret. */
  secretHash: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt?: string;
  /** Set when this token was produced by rotating another token. */
  rotatedFromId?: string;
  /** Set on the old token once it has been rotated. */
  rotatedToId?: string;
  /** Old token keeps working until this instant after rotation. */
  graceUntil?: string;
  revokedAt?: string;
  revocationReason?: ApiTokenRevocationReason;
  /** Optional IP / origin allow-list for extra segmentation. */
  allowedOrigins?: string[];
}

export interface IssuedApiToken {
  record: ApiTokenRecord;
  /** Plaintext secret. Show once, never persist. */
  secret: string;
}

export interface IssueApiTokenInput {
  name: string;
  owner: string;
  surface: ApiTokenSurface;
  scopes: ApiTokenScope[];
  ttlDays?: number;
  allowedOrigins?: string[];
  now?: Date;
}

export class ApiTokenPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiTokenPolicyError";
  }
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 hex digest of a token secret. */
export async function hashApiTokenSecret(secret: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison for digests of equal length. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const TOKEN_PATTERN = /^svk_(frontend|extension|sdk|scripts|admin)_[0-9a-f]{64}$/;

/** Extracts the surface encoded in a secret, or null when the format is wrong. */
export function parseApiTokenSecret(secret: string): { surface: ApiTokenSurface } | null {
  const match = TOKEN_PATTERN.exec(secret.trim());
  return match ? { surface: match[1] as ApiTokenSurface } : null;
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/** Throws `ApiTokenPolicyError` if the scopes/ttl are not allowed for the surface. */
export function assertTokenPolicy(surface: ApiTokenSurface, scopes: ApiTokenScope[], ttlDays: number): void {
  if (!API_TOKEN_SURFACES.includes(surface)) {
    throw new ApiTokenPolicyError(`Unknown surface "${surface}".`);
  }
  if (scopes.length === 0) {
    throw new ApiTokenPolicyError("At least one scope is required.");
  }
  const allowed = SURFACE_ALLOWED_SCOPES[surface];
  const denied = scopes.filter((s) => !allowed.includes(s));
  if (denied.length > 0) {
    throw new ApiTokenPolicyError(`Scopes not permitted for ${surface} tokens: ${denied.join(", ")}.`);
  }
  const { max } = SURFACE_TTL_DAYS[surface];
  if (!Number.isFinite(ttlDays) || ttlDays <= 0 || ttlDays > max) {
    throw new ApiTokenPolicyError(`ttlDays must be between 1 and ${max} for ${surface} tokens.`);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle operations (pure — callers persist the returned records)
// ---------------------------------------------------------------------------

/** Issues a new token. The returned `secret` must be shown once and discarded. */
export async function issueApiToken(input: IssueApiTokenInput): Promise<IssuedApiToken> {
  const now = input.now ?? new Date();
  const ttlDays = input.ttlDays ?? SURFACE_TTL_DAYS[input.surface].default;
  const scopes = Array.from(new Set(input.scopes)).sort() as ApiTokenScope[];
  assertTokenPolicy(input.surface, scopes, ttlDays);

  const secret = `svk_${input.surface}_${randomHex(32)}`;
  const record: ApiTokenRecord = {
    id: `tok_${randomHex(8)}`,
    name: input.name.trim() || "Unnamed token",
    owner: input.owner,
    surface: input.surface,
    scopes,
    displayPrefix: `${secret.slice(0, `svk_${input.surface}_`.length + 6)}…`,
    secretHash: await hashApiTokenSecret(secret),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlDays * DAY_MS).toISOString(),
    allowedOrigins: input.allowedOrigins?.length ? input.allowedOrigins : undefined,
  };
  return { record, secret };
}

/**
 * Rotates a token: issues a replacement with the same surface/scopes and
 * keeps the old secret valid for `graceHours` so deployed clients can be
 * updated without downtime. Pass `graceHours: 0` for compromised tokens.
 */
export async function rotateApiToken(
  current: ApiTokenRecord,
  options: { graceHours?: number; ttlDays?: number; now?: Date } = {},
): Promise<{ previous: ApiTokenRecord; next: IssuedApiToken }> {
  const now = options.now ?? new Date();
  const status = getApiTokenStatus(current, now);
  if (status === "revoked" || status === "expired") {
    throw new ApiTokenPolicyError(`Cannot rotate a ${status} token; issue a new one instead.`);
  }
  if (current.rotatedToId) {
    throw new ApiTokenPolicyError("Token has already been rotated.");
  }
  const graceHours = Math.max(0, options.graceHours ?? DEFAULT_ROTATION_GRACE_HOURS);
  const next = await issueApiToken({
    name: current.name,
    owner: current.owner,
    surface: current.surface,
    scopes: current.scopes,
    ttlDays: options.ttlDays,
    allowedOrigins: current.allowedOrigins,
    now,
  });
  next.record.rotatedFromId = current.id;

  const graceEnd = new Date(Math.min(now.getTime() + graceHours * 3_600_000, Date.parse(current.expiresAt)));
  const previous: ApiTokenRecord = {
    ...current,
    rotatedToId: next.record.id,
    graceUntil: graceEnd.toISOString(),
    ...(graceHours === 0 ? { revokedAt: now.toISOString(), revocationReason: "rotated" as const } : {}),
  };
  return { previous, next };
}

/**
 * Revokes a token immediately. Idempotent, except that an already-revoked
 * token can be re-marked as `compromised` so the audit trail records it.
 */
export function revokeApiToken(
  record: ApiTokenRecord,
  reason: ApiTokenRevocationReason,
  now: Date = new Date(),
): ApiTokenRecord {
  if (record.revokedAt) {
    return reason === "compromised" ? { ...record, revocationReason: reason } : record;
  }
  return { ...record, revokedAt: now.toISOString(), revocationReason: reason };
}

export function getApiTokenStatus(record: ApiTokenRecord, now: Date = new Date()): ApiTokenStatus {
  const t = now.getTime();
  if (record.revokedAt) return "revoked";
  if (t >= Date.parse(record.expiresAt)) return "expired";
  if (record.rotatedToId) {
    return record.graceUntil && t < Date.parse(record.graceUntil) ? "rotating" : "expired";
  }
  if (Date.parse(record.expiresAt) - t <= EXPIRY_WARNING_DAYS * DAY_MS) return "expiring";
  return "active";
}

export type ApiTokenAuthorization =
  | { ok: true; record: ApiTokenRecord; status: ApiTokenStatus }
  | {
      ok: false;
      reason: "malformed" | "unknown" | "revoked" | "expired" | "wrong_surface" | "missing_scope" | "origin_denied";
      httpStatus: 401 | 403;
    };

/**
 * Checks a presented secret against its stored record. `lookup` receives the
 * secret's SHA-256 digest and returns the matching record, if any.
 */
export async function authorizeApiToken(params: {
  secret: string | null | undefined;
  lookup: (secretHash: string) => ApiTokenRecord | undefined | Promise<ApiTokenRecord | undefined>;
  requiredScope: ApiTokenScope;
  surface?: ApiTokenSurface;
  origin?: string | null;
  now?: Date;
}): Promise<ApiTokenAuthorization> {
  const secret = params.secret?.trim();
  const parsed = secret ? parseApiTokenSecret(secret) : null;
  if (!secret || !parsed) return { ok: false, reason: "malformed", httpStatus: 401 };

  const hash = await hashApiTokenSecret(secret);
  const record = await params.lookup(hash);
  if (!record || !timingSafeEqualHex(record.secretHash, hash)) {
    return { ok: false, reason: "unknown", httpStatus: 401 };
  }

  const status = getApiTokenStatus(record, params.now);
  if (status === "revoked") return { ok: false, reason: "revoked", httpStatus: 401 };
  if (status === "expired") return { ok: false, reason: "expired", httpStatus: 401 };

  if (params.surface && record.surface !== params.surface) {
    return { ok: false, reason: "wrong_surface", httpStatus: 403 };
  }
  // Re-check against the surface allow-list so a tampered record cannot escalate.
  if (
    !record.scopes.includes(params.requiredScope) ||
    !SURFACE_ALLOWED_SCOPES[record.surface].includes(params.requiredScope)
  ) {
    return { ok: false, reason: "missing_scope", httpStatus: 403 };
  }
  if (record.allowedOrigins && params.origin && !record.allowedOrigins.includes(params.origin)) {
    return { ok: false, reason: "origin_denied", httpStatus: 403 };
  }
  return { ok: true, record, status };
}

/** Strips the secret digest for API responses / UI display. */
export function toPublicApiToken(record: ApiTokenRecord, now: Date = new Date()) {
  const { secretHash: _secretHash, ...rest } = record;
  return { ...rest, status: getApiTokenStatus(record, now) };
}

export type PublicApiToken = ReturnType<typeof toPublicApiToken>;
