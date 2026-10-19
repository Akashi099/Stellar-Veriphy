import type { VerificationStatus } from "@stellarveriphy/shared/types";
import { ApiError } from "@/lib/api/errors";
import type { FieldError } from "@/lib/api/types";
import type { Actor, Role } from "./auth";
import { records, type StatusChange, type VerificationRecord } from "./store";

export const VERIFICATION_STATUSES: readonly VerificationStatus[] = ["pending", "processing", "certified", "failed"];

export const BULK_STATUS_MAX_RECORDS = 100;
const REASON_MAX_LENGTH = 500;

// Allowed manual transitions. Certified is terminal: revoking a certificate
// is an on-chain operation, not a status edit.
const TRANSITIONS: Record<VerificationStatus, readonly VerificationStatus[]> = {
  pending: ["processing", "failed"],
  processing: ["pending", "certified", "failed"],
  failed: ["pending"],
  certified: [],
};

// Which target statuses each role may set during review/moderation.
const ROLE_TARGETS: Record<Role, readonly VerificationStatus[]> = {
  admin: VERIFICATION_STATUSES,
  moderator: ["pending", "processing", "failed"],
  user: [],
};

export const BULK_STATUS_ROLES: readonly Role[] = ["admin", "moderator"];

export interface BulkStatusRequest {
  ids: string[];
  status: VerificationStatus;
  reason: string | null;
  atomic: boolean;
}

export type BulkItemErrorCode = "not_found" | "invalid_transition";

export type BulkItemResult =
  | { id: string; ok: true; previousStatus: VerificationStatus; status: VerificationStatus; changed: boolean }
  | { id: string; ok: false; error: { code: BulkItemErrorCode; message: string } };

export interface BulkStatusResult {
  atomic: boolean;
  summary: { requested: number; succeeded: number; failed: number; changed: number };
  results: BulkItemResult[];
}

export function parseBulkStatusRequest(body: Record<string, unknown>): BulkStatusRequest {
  const fields: FieldError[] = [];
  const allowed = new Set(["ids", "status", "reason", "atomic"]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) fields.push({ field: key, code: "unknown_field", message: `${key} is not a recognized field.` });
  }

  const { ids, status, reason, atomic } = body;

  if (ids === undefined || ids === null) {
    fields.push({ field: "ids", code: "required", message: "Record IDs are required." });
  } else if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id.trim() === "")) {
    fields.push({ field: "ids", code: "invalid_type", message: "Record IDs must be a list of non-empty strings." });
  } else if (ids.length === 0) {
    fields.push({ field: "ids", code: "required", message: "At least one record ID is required." });
  } else if (ids.length > BULK_STATUS_MAX_RECORDS) {
    fields.push({ field: "ids", code: "too_long", message: `At most ${BULK_STATUS_MAX_RECORDS} records can be updated at once.` });
  } else if (new Set(ids).size !== ids.length) {
    fields.push({ field: "ids", code: "invalid_format", message: "Record IDs must not contain duplicates." });
  }

  if (status === undefined || status === null || status === "") {
    fields.push({ field: "status", code: "required", message: "Status is required." });
  } else if (typeof status !== "string" || !VERIFICATION_STATUSES.includes(status as VerificationStatus)) {
    fields.push({ field: "status", code: "invalid_format", message: `Status must be one of: ${VERIFICATION_STATUSES.join(", ")}.` });
  }

  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (reason !== undefined && reason !== null && typeof reason !== "string") {
    fields.push({ field: "reason", code: "invalid_type", message: "Reason must be a string." });
  } else if (trimmedReason.length > REASON_MAX_LENGTH) {
    fields.push({ field: "reason", code: "too_long", message: `Reason must be at most ${REASON_MAX_LENGTH} characters.` });
  } else if (status === "failed" && trimmedReason === "") {
    fields.push({ field: "reason", code: "required", message: "Reason is required when marking records as failed." });
  }

  if (atomic !== undefined && typeof atomic !== "boolean") {
    fields.push({ field: "atomic", code: "invalid_type", message: "Atomic must be a boolean." });
  }

  if (fields.length > 0) throw ApiError.validation(fields);

  return {
    ids: (ids as string[]).map((id) => id.trim()),
    status: status as VerificationStatus,
    reason: trimmedReason || null,
    atomic: atomic === undefined ? true : (atomic as boolean),
  };
}

function evaluate(id: string, record: VerificationRecord | undefined, target: VerificationStatus): BulkItemResult {
  if (!record) {
    return { id, ok: false, error: { code: "not_found", message: "Record not found." } };
  }
  if (record.status === target) {
    return { id, ok: true, previousStatus: record.status, status: target, changed: false };
  }
  if (!TRANSITIONS[record.status].includes(target)) {
    return {
      id,
      ok: false,
      error: { code: "invalid_transition", message: `Cannot change status from ${record.status} to ${target}.` },
    };
  }
  return { id, ok: true, previousStatus: record.status, status: target, changed: true };
}

function summarize(atomic: boolean, results: BulkItemResult[]): BulkStatusResult {
  const succeeded = results.filter((r) => r.ok);
  return {
    atomic,
    summary: {
      requested: results.length,
      succeeded: succeeded.length,
      failed: results.length - succeeded.length,
      changed: succeeded.filter((r) => r.ok && r.changed).length,
    },
    results,
  };
}

export function applyBulkStatusUpdate(actor: Actor, request: BulkStatusRequest): BulkStatusResult {
  if (!ROLE_TARGETS[actor.role].includes(request.status)) {
    throw new ApiError("FORBIDDEN", {
      message: `Your role cannot set records to ${request.status}.`,
    });
  }

  const existing = records.getMany(request.ids);
  const results = request.ids.map((id) => evaluate(id, existing.get(id), request.status));
  const failed = results.some((r) => !r.ok);

  if (request.atomic && failed) {
    // Nothing is written; report exactly which items blocked the batch.
    throw new ApiError("BULK_UPDATE_REJECTED", { details: summarize(true, results) as unknown as Record<string, unknown> });
  }

  const changes: StatusChange[] = results
    .filter((r): r is Extract<BulkItemResult, { ok: true }> => r.ok && r.changed)
    .map((r) => ({ id: r.id, status: request.status, reason: request.reason, updatedBy: actor.subject }));

  if (changes.length > 0) records.applyStatusChanges(changes);

  return summarize(request.atomic, results);
}
