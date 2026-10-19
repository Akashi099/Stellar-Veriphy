/**
 * GET /api/v1/users/:address/verifications/export
 *
 * Exports the account's verification history (#785). Only the account owner
 * or an admin may export it (docs/api/verification-history-export.md).
 *
 * Query: format=json|csv (default json), from, to (ISO 8601), type (repeatable).
 */
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { defineRoute } from "@/lib/api/handler";
import type { FieldError } from "@/lib/api/types";
import { requireActor } from "@/lib/server/auth";
import { logOperationalEvent } from "@/lib/server/observability";
import { assertCanAccessUser } from "@/lib/server/users";
import {
  buildVerificationHistoryExport,
  historyExportToCsv,
  type HistoryEventType,
} from "@/lib/server/verification-history-export";
import { STELLAR_ADDRESS_PATTERN } from "@/lib/validation/user";

type Params = { address: string };

const EVENT_TYPES: readonly HistoryEventType[] = [
  "upload_registered",
  "upload_session_started",
  "upload_session_completed",
  "upload_session_aborted",
  "upload_session_expired",
  "verification_job_queued",
  "verification_job_started",
  "verification_job_completed",
  "verification_job_failed",
  "verification_record_created",
  "verification_status_changed",
];

function readDate(params: URLSearchParams, field: string, errors: FieldError[]): Date | undefined {
  const raw = params.get(field);
  if (raw === null) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    errors.push({ field, code: "invalid_format", message: `${field} must be an ISO 8601 date.` });
    return undefined;
  }
  return date;
}

export const GET = defineRoute<Params>("1", async (req, { params, requestId }) => {
  const actor = requireActor(req);
  if (!STELLAR_ADDRESS_PATTERN.test(params.address)) throw new ApiError("NOT_FOUND", { message: "User not found." });
  assertCanAccessUser(actor, params.address);

  const search = new URL(req.url).searchParams;
  const errors: FieldError[] = [];
  const format = search.get("format") ?? "json";
  if (format !== "json" && format !== "csv") {
    errors.push({ field: "format", code: "invalid_format", message: "format must be json or csv." });
  }
  const from = readDate(search, "from", errors);
  const to = readDate(search, "to", errors);
  if (from && to && from > to) errors.push({ field: "from", code: "invalid_format", message: "from must be before to." });
  const requestedTypes = search.getAll("type");
  const unknownTypes = requestedTypes.filter((t) => !EVENT_TYPES.includes(t as HistoryEventType));
  if (unknownTypes.length > 0) {
    errors.push({ field: "type", code: "invalid_format", message: `Unknown event type(s): ${unknownTypes.join(", ")}.` });
  }
  if (errors.length > 0) throw ApiError.validation(errors);

  const history = await buildVerificationHistoryExport(params.address, {
    from,
    to,
    types: requestedTypes.length > 0 ? new Set(requestedTypes as HistoryEventType[]) : undefined,
  });

  logOperationalEvent("info", "verification_history.exported", {
    requestId,
    route: "GET /api/v1/users/[address]/verifications/export",
    operation: "export_verification_history",
    status: 200,
    actor: actor.subject,
    details: { format, events: history.summary.totalEvents, byAdmin: actor.subject !== params.address },
  });

  const stamp = history.generatedAt.slice(0, 10);
  const filename = `verification-history-${params.address.slice(0, 8)}-${stamp}.${format}`;
  const headers = {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "X-Export-Schema-Version": String(history.schemaVersion),
  };

  if (format === "csv") {
    return new NextResponse(historyExportToCsv(history), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    });
  }
  return NextResponse.json({ data: history }, { headers });
});
