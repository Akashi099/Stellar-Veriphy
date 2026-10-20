/**
 * GET  /api/admin/moderation        — list queue items (filterable by status; paginated)
 * POST /api/admin/moderation        — create a new moderation item
 */
import {
  paginate,
  parsePaginationParams,
  type ApiResponse,
  type ModerationQueueItem,
  type ModerationQueueSummary,
} from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/server/admin-guard";
import { legacyValidationError } from "@/lib/server/http";
import { recordModerationAudit } from "@/lib/server/moderation-audit";
import { logOperationalEvent, requestIdFrom } from "@/lib/server/observability";
import { validateModerationItem } from "@/lib/server/validators";

// ---------------------------------------------------------------------------
// In-memory store (replaced by a DB in production)
// ---------------------------------------------------------------------------

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

function buildSummary(queue: ModerationQueueItem[]): ModerationQueueSummary {
  const today = new Date().toISOString().slice(0, 10);
  return {
    total: queue.length,
    pending: queue.filter((i) => i.status === "pending").length,
    underReview: queue.filter((i) => i.status === "under_review").length,
    escalated: queue.filter((i) => i.status === "escalated").length,
    resolvedToday: queue.filter(
      (i) => i.resolvedAt && i.resolvedAt.startsWith(today),
    ).length,
  };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<{ items: ModerationQueueItem[]; summary: ModerationQueueSummary }>>> {
  const denied = await guardAdminRoute(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const pageParams = parsePaginationParams(searchParams);
  if (!pageParams.ok) return legacyValidationError(pageParams.errors);
  const status = searchParams.get("status");
  const trigger = searchParams.get("trigger");

  let items = getQueue();

  if (status) items = items.filter((i) => i.status === status);
  if (trigger) items = items.filter((i) => i.trigger === trigger);

  // Newest first
  items = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const page = paginate(items, pageParams.value);
  return NextResponse.json({
    success: true,
    data: { items: page.items, summary: buildSummary(getQueue()) },
    pagination: page.pagination,
  });
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<ModerationQueueItem>>> {
  const denied = await guardAdminRoute(request);
  if (denied) return denied;

  const requestId = requestIdFrom(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON." }, { status: 400 });
  }

  const validation = validateModerationItem(body);
  if (!validation.ok) return legacyValidationError(validation.errors);
  const b = validation.value;

  const now = new Date().toISOString();
  const newItem: ModerationQueueItem = {
    id: `mod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    assetId: b.assetId,
    contentHash: b.contentHash,
    status: "pending",
    trigger: b.trigger,
    summary: b.summary,
    reportedBy: b.reportedBy,
    creatorAddress: b.creatorAddress,
    evidence: b.evidence,
    createdAt: now,
    updatedAt: now,
    escalationChain: [],
  };

  const queue = getQueue();
  queue.push(newItem);
  setQueue(queue);

  await recordModerationAudit({
    actor: b.reportedBy,
    actorRole: "reporter",
    action: "item_created",
    targetId: newItem.id,
    assetId: newItem.assetId,
    contentHash: newItem.contentHash,
    outcome: "success",
    reason: b.summary,
    changes: { status: { from: null, to: newItem.status }, trigger: { from: null, to: newItem.trigger } },
    requestId,
  });

  logOperationalEvent("info", "moderation_queue.item_created", {
    requestId,
    assetId: b.assetId,
    trigger: b.trigger,
  });

  return NextResponse.json({ success: true, data: newItem }, { status: 201 });
}
