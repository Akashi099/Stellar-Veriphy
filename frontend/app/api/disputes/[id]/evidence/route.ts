/**
 * POST /api/disputes/[id]/evidence — attach a structured evidence item
 */

import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@stellarveriphy/shared/types";
import type { DisputeEvidence, DisputeRecord } from "@/types/dispute";
import { appendAuditEntry } from "../../route";

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

export async function POST(
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

  const prev = store[idx]!;

  // Only allow evidence on open or under_review disputes
  if (prev.status !== "open" && prev.status !== "under_review" && prev.status !== "evidence_requested") {
    return NextResponse.json(
      { success: false, error: "Evidence can only be attached to open, under-review, or evidence-requested disputes." },
      { status: 409 },
    );
  }

  let body: DisputeEvidence;
  try {
    body = (await request.json()) as DisputeEvidence;
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON." }, { status: 400 });
  }

  if (!body.type || !body.description?.trim()) {
    return NextResponse.json(
      { success: false, error: "type and description are required." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const newEv: DisputeEvidence = {
    ...body,
    id: makeId("ev"),
    attachedAt: now,
  };

  const updated: DisputeRecord = {
    ...prev,
    evidence: [...prev.evidence, newEv],
    updatedAt: now,
  };
  store[idx] = updated;

  appendAuditEntry({
    id: makeId("aud"),
    disputeId: params.id,
    action: "evidence_attached",
    actor: body.attachedBy ?? "reporter",
    timestamp: now,
    description: `Evidence item attached: "${body.type.replace(/_/g, " ")}" — ${body.description.trim()}`,
  });

  return NextResponse.json({ success: true, data: updated }, { status: 201 });
}
