import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import type { Actor } from "./auth";

// Auth sessions (#783). Login and every refresh go through the same rules so
// clients see one predictable lifecycle:
//
//   active ──refresh──▶ active (tokens rotated)
//     │                    │
//     ├── idle timeout / absolute lifetime reached ──▶ expired
//     └── logout / refresh-token reuse ──────────────▶ revoked
//
// - The access token is short-lived and never outlives the session.
// - Each refresh rotates both tokens and extends the idle window, but never
//   past the absolute lifetime fixed at login.
// - A refresh token is single-use. Presenting the previous one again within the
//   grace window means a concurrent refresh won the race (SESSION_REFRESH_SUPERSEDED);
//   after the grace window it is treated as token theft and the session is revoked.

const ACCESS_PREFIX = "sva_";
const REFRESH_PREFIX = "svr_";

function seconds(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function sessionPolicy() {
  return {
    accessTtlMs: seconds("AUTH_ACCESS_TTL_SECONDS", 15 * 60) * 1000,
    idleTtlMs: seconds("AUTH_SESSION_IDLE_SECONDS", 7 * 24 * 60 * 60) * 1000,
    maxLifetimeMs: seconds("AUTH_SESSION_MAX_SECONDS", 30 * 24 * 60 * 60) * 1000,
    reuseGraceMs: seconds("AUTH_REFRESH_REUSE_GRACE_SECONDS", 30) * 1000,
    // Clients should refresh once this much of the access token's life is left.
    refreshLeadMs: seconds("AUTH_REFRESH_LEAD_SECONDS", 60) * 1000,
  };
}

export type SessionState = "active" | "expired" | "revoked";
export type RevokeReason = "logout" | "refresh_token_reuse" | "admin";

interface SessionRecord {
  id: string;
  subject: string;
  role: Actor["role"];
  generation: number;
  accessDigest: string;
  accessExpiresAt: number;
  refreshDigest: string;
  previousRefreshDigest?: string;
  rotatedAt?: number;
  refreshExpiresAt: number;
  absoluteExpiresAt: number;
  createdAt: number;
  revokedAt?: number;
  revokeReason?: RevokeReason;
}

export interface SessionView {
  sessionId: string;
  subject: string;
  role: Actor["role"];
  state: SessionState;
  generation: number;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  absoluteExpiresAt: string;
  // When the client should call refresh; always before accessExpiresAt.
  refreshAfter: string;
  createdAt: string;
  revokeReason?: RevokeReason;
}

export interface IssuedSession {
  session: SessionView;
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
}

const globalSessions = globalThis as typeof globalThis & { __authSessions?: Map<string, SessionRecord> };

function store(): Map<string, SessionRecord> {
  globalSessions.__authSessions ??= new Map();
  return globalSessions.__authSessions;
}

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function token(prefix: string): string {
  return prefix + randomBytes(32).toString("base64url");
}

function stateOf(record: SessionRecord, now: number): SessionState {
  if (record.revokedAt !== undefined) return "revoked";
  if (now >= record.refreshExpiresAt || now >= record.absoluteExpiresAt) return "expired";
  return "active";
}

function toView(record: SessionRecord, now: number): SessionView {
  const { refreshLeadMs } = sessionPolicy();
  const refreshAfter = Math.max(record.accessExpiresAt - refreshLeadMs, now);
  return {
    sessionId: record.id,
    subject: record.subject,
    role: record.role,
    state: stateOf(record, now),
    generation: record.generation,
    accessExpiresAt: new Date(record.accessExpiresAt).toISOString(),
    refreshExpiresAt: new Date(record.refreshExpiresAt).toISOString(),
    absoluteExpiresAt: new Date(record.absoluteExpiresAt).toISOString(),
    refreshAfter: new Date(Math.min(refreshAfter, record.accessExpiresAt)).toISOString(),
    createdAt: new Date(record.createdAt).toISOString(),
    ...(record.revokeReason ? { revokeReason: record.revokeReason } : {}),
  };
}

// Issues a fresh token pair; shared by login and refresh so both follow the same expiry rules.
function rotate(record: SessionRecord, now: number): { accessToken: string; refreshToken: string } {
  const policy = sessionPolicy();
  const accessToken = token(ACCESS_PREFIX);
  const refreshToken = token(REFRESH_PREFIX);
  record.accessDigest = digest(accessToken);
  record.refreshDigest = digest(refreshToken);
  record.refreshExpiresAt = Math.min(now + policy.idleTtlMs, record.absoluteExpiresAt);
  record.accessExpiresAt = Math.min(now + policy.accessTtlMs, record.refreshExpiresAt);
  return { accessToken, refreshToken };
}

function issued(record: SessionRecord, tokens: { accessToken: string; refreshToken: string }, now: number): IssuedSession {
  return { session: toView(record, now), ...tokens, tokenType: "Bearer" };
}

function stateError(record: SessionRecord, now: number): ApiError | null {
  const state = stateOf(record, now);
  if (state === "revoked") return new ApiError("SESSION_REVOKED", { details: { reason: record.revokeReason } });
  if (state === "expired") {
    const reason = now >= record.absoluteExpiresAt ? "max_lifetime" : "idle_timeout";
    return new ApiError("SESSION_EXPIRED", { details: { reason } });
  }
  return null;
}

function purgeFinished(now: number) {
  // Keep finished sessions around briefly so clients still get a precise error, then drop them.
  const keepMs = sessionPolicy().reuseGraceMs * 10;
  for (const [id, record] of store()) {
    const endedAt = record.revokedAt ?? Math.min(record.refreshExpiresAt, record.absoluteExpiresAt);
    if (stateOf(record, now) !== "active" && now - endedAt > keepMs) store().delete(id);
  }
}

export function isSessionToken(value: string): boolean {
  return value.startsWith(ACCESS_PREFIX) || value.startsWith(REFRESH_PREFIX);
}

// Login: exchanges an already-authenticated actor for a session.
export function createSession(actor: Actor, now = Date.now()): IssuedSession {
  purgeFinished(now);
  const record: SessionRecord = {
    id: randomBytes(16).toString("hex"),
    subject: actor.subject,
    role: actor.role,
    generation: 1,
    accessDigest: "",
    accessExpiresAt: now,
    refreshDigest: "",
    refreshExpiresAt: now,
    absoluteExpiresAt: now + sessionPolicy().maxLifetimeMs,
    createdAt: now,
  };
  const tokens = rotate(record, now);
  store().set(record.id, record);
  return issued(record, tokens, now);
}

export function refreshSession(refreshToken: string, now = Date.now()): IssuedSession {
  if (!refreshToken.startsWith(REFRESH_PREFIX)) throw new ApiError("SESSION_INVALID");
  const presented = digest(refreshToken);

  for (const record of store().values()) {
    if (record.refreshDigest === presented) {
      const error = stateError(record, now);
      if (error) throw error;
      record.previousRefreshDigest = record.refreshDigest;
      record.rotatedAt = now;
      record.generation += 1;
      return issued(record, rotate(record, now), now);
    }

    if (record.previousRefreshDigest === presented) {
      const error = stateError(record, now);
      if (error) throw error;
      if (record.rotatedAt !== undefined && now - record.rotatedAt <= sessionPolicy().reuseGraceMs) {
        throw new ApiError("SESSION_REFRESH_SUPERSEDED", { details: { generation: record.generation } });
      }
      revoke(record, "refresh_token_reuse", now);
      throw new ApiError("SESSION_REVOKED", { details: { reason: "refresh_token_reuse" } });
    }
  }
  throw new ApiError("SESSION_INVALID");
}

// Resolves an access token to its actor, or throws the precise session error.
export function authenticateAccessToken(accessToken: string, now = Date.now()): { actor: Actor; session: SessionView } {
  if (!accessToken.startsWith(ACCESS_PREFIX)) throw new ApiError("SESSION_INVALID");
  const presented = digest(accessToken);
  for (const record of store().values()) {
    if (record.accessDigest !== presented) continue;
    const error = stateError(record, now);
    if (error) throw error;
    if (now >= record.accessExpiresAt) {
      throw new ApiError("SESSION_EXPIRED", { details: { reason: "access_token_expired", refreshable: true } });
    }
    return { actor: { subject: record.subject, role: record.role }, session: toView(record, now) };
  }
  throw new ApiError("SESSION_INVALID");
}

function revoke(record: SessionRecord, reason: RevokeReason, now: number) {
  if (record.revokedAt !== undefined) return;
  record.revokedAt = now;
  record.revokeReason = reason;
}

// Logout. Idempotent: revoking an already-finished session still succeeds.
export function revokeSession(sessionId: string, reason: RevokeReason = "logout", now = Date.now()): SessionView | undefined {
  const record = store().get(sessionId);
  if (!record) return undefined;
  revoke(record, reason, now);
  return toView(record, now);
}
