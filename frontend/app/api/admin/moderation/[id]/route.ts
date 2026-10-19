/**
 * GET   /api/admin/moderation/[id]  — fetch a single moderation item
 * PATCH /api/admin/moderation/[id]  — update status, assign reviewer, add notes
 *
 * Every PATCH attempt, applied or refused, is written to the moderation audit
 * log with the actor, target, outcome and reason (#784).
 */
import type { ApiResponse, ModerationQueueItem } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";
import { requireApiToken } from "@/lib/security/apiTokenStore";
import { recordModerationAudit, type ModerationAuditAction } from "@/lib/server/moderation-audit";
import { logOperationalEvent, requestIdFrom } from "@/lib/server/observability";

function getQueue(): ModerationQueueItem[] {
  if (typeof globalThis !== "undefined" && "moderationQueue" in globalThis) {
    return (globalThis as unknown as Record<string, unknown>)
      .moderationQueue as ModerationQueueItem[];
  }
  return [];
}

function setQueue(queue: ModerationQueueItem[]) {
  if (typeof globalThis !== "undefined") {
    (globalThis as unknown as Record<string, ModerationQueueItem[]>).moderationQueue = queue;
  }
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse<ModerationQueueItem>>> {
  const { id } = await params;
  const item = getQueue().find((i) => i.id === id);
  if (!item) {
    return NextResponse.json({ success: false, error: "Moderation item not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: item });
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

interface PatchBody {
  status?: ModerationQueueItem["status"];
  assignedTo?: string;
  reviewNotes?: string;
  /** Pass the reviewer address to append to the escalation chain. */
  escalateTo?: string;
  /** Why the moderator took this action; stored in the audit log. */
  reason?: string;
}

// Picks the audit action that best describes a patch; status changes win.
function auditActionFor(patch: PatchBody): ModerationAuditAction {
  if (patch.escalateTo) return "escalated";
  if (patch.status) return "status_changed";
  if (patch.assignedTo !== undefined) return "assigned";
  return "review_notes_updated";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse<ModerationQueueItem>>> {
  const requestId = requestIdFrom(request);
  const { id } = await params;

  const guard = await requireApiToken(request, "moderation:write", "admin");
  if (!guard.ok) {
    await recordModerationAudit({
      actor: request.headers.get("x-actor") ?? "unauthenticated",
      actorRole: "unknown",
      action: "status_changed",
      targetId: id,
      outcome: "denied",
      reason: `HTTP ${guard.response.status}`,
      requestId,
    });
    return guard.response as NextResponse<ApiResponse<never>>;
  }
  const actorRole = guard.record ? `${guard.record.surface}_token` : "unverified";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON." }, { status: 400 });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: "Request body must be a JSON object." }, { status: 400 });
  }

  const patch = body as PatchBody;
  const action = auditActionFor(patch);
  const reason = typeof patch.reason === "string" ? patch.reason : patch.reviewNotes;

  const queue = getQueue();
  const idx = queue.findIndex((i) => i.id === id);
  if (idx === -1) {
    await recordModerationAudit({ actor: guard.actor, actorRole, action, targetId: id, outcome: "not_found", reason, requestId });
    return NextResponse.json({ success: false, error: "Moderation item not found." }, { status: 404 });
  }

  const before = queue[idx]!;
  const item = { ...before };

  if (patch.status) {
    item.status = patch.status;
    if (patch.status === "resolved" || patch.status === "approved" || patch.status === "rejected") {
      item.resolvedAt = new Date().toISOString();
    }
  }

  if (patch.assignedTo !== undefined) item.assignedTo = patch.assignedTo;
  if (patch.reviewNotes !== undefined) item.reviewNotes = patch.reviewNotes;

  if (patch.escalateTo) {
    item.status = "escalated";
    item.escalationChain = [...(item.escalationChain ?? []), patch.escalateTo];
  }

  item.updatedAt = new Date().toISOString();
  queue[idx] = item;
  setQueue(queue);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of ["status", "assignedTo", "reviewNotes", "escalationChain", "resolvedAt"] as const) {
    if (JSON.stringify(before[field]) !== JSON.stringify(item[field])) {
      changes[field] = { from: before[field] ?? null, to: item[field] ?? null };
    }
  }
  await recordModerationAudit({
    actor: guard.actor,
    actorRole,
    action,
    targetId: id,
    assetId: item.assetId,
    contentHash: item.contentHash,
    outcome: "success",
    reason,
    changes,
    requestId,
  });

  logOperationalEvent("info", "moderation_queue.item_updated", {
    requestId,
    itemId: id,
    newStatus: item.status,
  });

  return NextResponse.json({ success: true, data: item });
}
