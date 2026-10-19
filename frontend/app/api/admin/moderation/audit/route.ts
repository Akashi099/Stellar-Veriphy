/**
 * GET /api/admin/moderation/audit — query the moderation audit log (#784)
 *
 * Filters (all optional, combined with AND):
 *   actor, targetId, assetId, action, outcome, from, to (ISO 8601)
 * Pagination: page / pageSize (docs/api/pagination.md). Newest first.
 * `verify=true` also returns the hash-chain integrity check.
 *
 * Requires an admin-surface token with `moderation:read`. The log has no write
 * endpoint: entries are only created by the moderation routes themselves.
 */
import { paginate, parsePaginationParams, type ApiResponse, type FieldError } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

import { requireApiToken } from "@/lib/security/apiTokenStore";
import { legacyValidationError } from "@/lib/server/http";
import {
  queryModerationAudit,
  verifyModerationAuditChain,
  type ModerationAuditAction,
  type ModerationAuditEntry,
  type ModerationAuditIntegrity,
  type ModerationAuditOutcome,
} from "@/lib/server/moderation-audit";
import { logOperationalEvent, requestIdFrom } from "@/lib/server/observability";

export const dynamic = "force-dynamic";

const ACTIONS: readonly ModerationAuditAction[] = [
  "item_created",
  "status_changed",
  "assigned",
  "review_notes_updated",
  "escalated",
  "evidence_added",
  "evidence_package_viewed",
];
const OUTCOMES: readonly ModerationAuditOutcome[] = ["success", "denied", "not_found", "invalid"];

function oneOf<T extends string>(
  params: URLSearchParams,
  field: string,
  allowed: readonly T[],
  errors: FieldError[],
): T | undefined {
  const value = params.get(field);
  if (value === null) return undefined;
  if (allowed.includes(value as T)) return value as T;
  errors.push({ field, message: `${field} must be one of: ${allowed.join(", ")}.` });
  return undefined;
}

function date(params: URLSearchParams, field: string, errors: FieldError[]): Date | undefined {
  const value = params.get(field);
  if (value === null) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    errors.push({ field, message: `${field} must be an ISO 8601 date.` });
    return undefined;
  }
  return parsed;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<{ entries: ModerationAuditEntry[]; integrity?: ModerationAuditIntegrity }>>> {
  const guard = await requireApiToken(request, "moderation:read", "admin");
  if (!guard.ok) return guard.response as NextResponse<ApiResponse<never>>;

  const { searchParams } = new URL(request.url);
  const pageParams = parsePaginationParams(searchParams);
  if (!pageParams.ok) return legacyValidationError(pageParams.errors);

  const errors: FieldError[] = [];
  const query = {
    actor: searchParams.get("actor") ?? undefined,
    targetId: searchParams.get("targetId") ?? undefined,
    assetId: searchParams.get("assetId") ?? undefined,
    action: oneOf(searchParams, "action", ACTIONS, errors),
    outcome: oneOf(searchParams, "outcome", OUTCOMES, errors),
    from: date(searchParams, "from", errors),
    to: date(searchParams, "to", errors),
  };
  if (errors.length > 0) return legacyValidationError(errors);

  const page = paginate(await queryModerationAudit(query), pageParams.value);
  const integrity = ["1", "true"].includes(searchParams.get("verify") ?? "") ? await verifyModerationAuditChain() : undefined;

  // Reading the audit trail is itself worth a trace.
  logOperationalEvent("info", "moderation_audit.queried", {
    requestId: requestIdFrom(request),
    route: "GET /api/admin/moderation/audit",
    operation: "query_moderation_audit",
    status: 200,
    actor: guard.actor,
    details: { filters: Object.keys(query).filter((k) => query[k as keyof typeof query] !== undefined), results: page.items.length },
  });

  return NextResponse.json(
    { success: true, data: { entries: page.items, ...(integrity ? { integrity } : {}) }, pagination: page.pagination },
    { headers: { "Cache-Control": "no-store" } },
  );
}
