/**
 * GET   /api/disputes/[id]   — fetch a single dispute by ID
 * PATCH /api/disputes/[id]   — update status / assignee / notes (admin)
 */

import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@stellarveriphy/shared/types";
import type { DisputeRecord, DisputeStatus } from "@/types/dispute";
import { appendAuditEntry } from "../route";

declare global {
  // eslint-disable-next-line no-var
  var __disputeStore: DisputeRecord[] | undefined;
}

function getStore(): DisputeRecord[] {
  if (!globalThis.__disputeStore) globalThis.__disputeStore = [];
  return globalThis.__disputeStore;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse<ApiResponse<DisputeRecord>>> {
  const record = getStore().find((d) => d.id === params.id);
  if (!record) {
    return NextResponse.json(
      { success: false, error: `Dispute "${params.id}" not found.` },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, data: record });
}

// ---------------------------------------------------------------------------
// PATCH  (admin: update status, assignee, notes, escalation)
// ---------------------------------------------------------------------------

interface PatchBody {
  status?: DisputeStatus;
  assignedTo?: string;
  reviewNotes?: string;
  escalateTo?: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse<ApiResponse<DisputeRecord>>> {
  const store = getStore();
  const idx = store.findIndex((d) => d.id === params.id);
  if (idx === -1) {
    return NextResponse.json(
      { success: false, error: `Dispute "${params.id}" not found.` },
      { status: 404 },
    );
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON." }, { status: 400 });
  }

  const prev = store[idx]!;
  const now = new Date().toISOString();
  const updated: DisputeRecord = { ...prev, updatedAt: now };

  if (body.reviewNotes !== undefined) updated.reviewNotes = body.reviewNotes;
  if (body.assignedTo !== undefined) {
    updated.assignedTo = body.assignedTo;
    appendAuditEntry({
      id: makeId("aud"),
      disputeId: params.id,
      action: "assigned",
      actor: body.assignedTo,
      timestamp: now,
      description: `Dispute assigned to ${body.assignedTo}.`,
    });
  }
  if (body.escalateTo?.trim()) {
    updated.escalationChain = [...(prev.escalationChain ?? []), body.escalateTo.trim()];
    appendAuditEntry({
      id: makeId("aud"),
      disputeId: params.id,
      action: "escalated",
      actor: body.escalateTo.trim(),
      timestamp: now,
      description: `Dispute escalated to ${body.escalateTo.trim()}.`,
    });
  }
  if (body.status && body.status !== prev.status) {
    updated.status = body.status;
    appendAuditEntry({
      id: makeId("aud"),
      disputeId: params.id,
      action: "status_changed",
      actor: body.assignedTo ?? "operator",
      timestamp: now,
      description: `Status changed from "${prev.status}" to "${body.status}".`,
      previousStatus: prev.status,
      newStatus: body.status,
    });
  }

  store[idx] = updated;
  return NextResponse.json({ success: true, data: updated });
}
