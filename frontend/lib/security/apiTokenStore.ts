/**
 * Server-side API token store and request guard (#670).
 *
 * Tokens are persisted by secret digest only. The in-memory store mirrors the
 * other admin route handlers (globalThis-backed) and is replaced by a database
 * table in production — the `ApiTokenRepository` interface is the seam.
 *
 * Enforcement is controlled by `API_TOKEN_ENFORCEMENT`:
 *   - "off"     — guard is a no-op (local development)
 *   - "monitor" — invalid/missing tokens are logged but allowed (rollout phase)
 *   - "enforce" — invalid/missing tokens are rejected (default in production)
 * This lets operators turn enforcement on without downtime.
 */
import {
  authorizeApiToken,
  type ApiTokenRecord,
  type ApiTokenScope,
  type ApiTokenSurface,
  type AuditLogEntry,
} from "@stellarveriphy/shared";
import { NextResponse, type NextRequest } from "next/server";

import { logOperationalEvent } from "@/lib/server/observability";

export interface ApiTokenRepository {
  list(owner?: string): ApiTokenRecord[];
  get(id: string): ApiTokenRecord | undefined;
  findBySecretHash(secretHash: string): ApiTokenRecord | undefined;
  save(record: ApiTokenRecord): void;
}

type TokenGlobals = { apiTokens?: Map<string, ApiTokenRecord>; auditLogs?: AuditLogEntry[] };
const globals = globalThis as unknown as TokenGlobals;

function tokens(): Map<string, ApiTokenRecord> {
  globals.apiTokens ??= new Map();
  return globals.apiTokens;
}

export const apiTokenRepository: ApiTokenRepository = {
  list(owner) {
    const all = Array.from(tokens().values());
    return (owner ? all.filter((t) => t.owner === owner) : all).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  },
  get(id) {
    return tokens().get(id);
  },
  findBySecretHash(secretHash) {
    for (const record of tokens().values()) {
      if (record.secretHash === secretHash) return record;
    }
    return undefined;
  },
  save(record) {
    tokens().set(record.id, record);
  },
};

/** Appends a token lifecycle event to the shared audit log. Never logs secrets. */
export function auditTokenEvent(action: string, record: ApiTokenRecord, actor: string, extra?: Record<string, unknown>) {
  globals.auditLogs ??= [];
  globals.auditLogs.push({
    id: `log_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    entityType: "api_token",
    entityId: record.id,
    action,
    actor,
    details: {
      surface: record.surface,
      scopes: record.scopes,
      displayPrefix: record.displayPrefix,
      expiresAt: record.expiresAt,
      ...extra,
    },
    timestamp: Date.now(),
  });
}

type EnforcementMode = "off" | "monitor" | "enforce";

function enforcementMode(): EnforcementMode {
  const mode = process.env.API_TOKEN_ENFORCEMENT;
  if (mode === "off" || mode === "monitor" || mode === "enforce") return mode;
  return process.env.NODE_ENV === "production" ? "enforce" : "off";
}

function bearer(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return request.headers.get("x-api-key");
}

export type GuardResult = { ok: true; record?: ApiTokenRecord; actor: string } | { ok: false; response: NextResponse };

/**
 * Validates the request's API token for a scope (and optionally a surface).
 * Updates `lastUsedAt` on success. Warns clients via `X-Token-Status` when
 * the token is expiring or in its rotation grace window.
 */
export async function requireApiToken(
  request: NextRequest,
  scope: ApiTokenScope,
  surface?: ApiTokenSurface,
): Promise<GuardResult> {
  const mode = enforcementMode();
  if (mode === "off") return { ok: true, actor: request.headers.get("x-actor") ?? "anonymous" };

  const result = await authorizeApiToken({
    secret: bearer(request),
    lookup: (hash) => apiTokenRepository.findBySecretHash(hash),
    requiredScope: scope,
    surface,
    origin: request.headers.get("origin"),
  });

  if (result.ok) {
    apiTokenRepository.save({ ...result.record, lastUsedAt: new Date().toISOString() });
    return { ok: true, record: result.record, actor: result.record.owner };
  }

  logOperationalEvent("warn", "api_token.denied", {
    route: new URL(request.url).pathname,
    operation: scope,
    status: result.httpStatus,
    reason: result.reason,
    details: { mode },
  });

  if (mode === "monitor") return { ok: true, actor: "unauthenticated" };

  return {
    ok: false,
    response: NextResponse.json(
      { success: false, error: `API token rejected: ${result.reason}.` },
      {
        status: result.httpStatus,
        headers: result.httpStatus === 401 ? { "WWW-Authenticate": 'Bearer realm="stellarveriphy"' } : undefined,
      },
    ),
  };
}
