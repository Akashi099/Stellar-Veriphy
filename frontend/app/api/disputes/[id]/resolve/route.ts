/**
 * POST /api/disputes/[id]/resolve — resolve or dismiss a dispute (admin)
 */

import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@stellarveriphy/shared/types";
import type {
  DisputeRecord,
  DisputeResolutionRequest,
  DisputeStatus,
} from "@/types/dispute";
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

const OUTCOME_TO_STATUS: Record<string, DisputeStatus> = {
  upheld: "resolved_upheld",
  rejected: "resolved_rejected",
  inconclusive: "resolved_inconclusive",
  dismissed: "dismissed",
};

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

  // Cannot re-resolve a finalized dispute
  const finalStatuses: DisputeStatus[] = [
    "resolved_upheld",
    "resolved_rejected",
    "resolved_inconclusive",
    "dismissed",
  ];
  if (finalStatuses.includes(prev.status)) {
    return NextResponse.json(
      { success: false, error: "This dispute has already been resolved." },
      { status: 409 },
    );
  }

  let body: DisputeResolutionRequest;
  try {
    body = (await request.json()) as DisputeResolutionRequest;
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON." }, { status: 400 });
  }

  if (!body.outcome) {
    return NextResponse.json({ success: false, error: "outcome is required." }, { status: 400 });
  }
  if (!body.resolutionSummary?.trim()) {
    return NextResponse.json(
      { success: false, error: "resolutionSummary is required." },
      { status: 400 },
    );
  }
  if (body.outcome === "upheld" && !body.onChainAction) {
    return NextResponse.json(
      { success: false, error: "onChainAction is required when outcome is upheld." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const newStatus: DisputeStatus = OUTCOME_TO_STATUS[body.outcome] ?? "resolved_inconclusive";

  const updated: DisputeRecord = {
    ...prev,
    status: newStatus,
    resolvedAt: now,
    updatedAt: now,
    resolutionOutcome: body.outcome,
    resolutionSummary: body.resolutionSummary.trim(),
    reviewNotes: body.reviewNotes ?? prev.reviewNotes,
    onChainTxHash: body.onChainTxHash,
  };
  store[idx] = updated;

  appendAuditEntry({
    id: makeId("aud"),
    disputeId: params.id,
    action: "resolved",
    actor: prev.assignedTo ?? "operator",
    timestamp: now,
    description: `Dispute resolved as "${body.outcome}". ${body.onChainAction ? `On-chain action: ${body.onChainAction}.` : "No on-chain action."} ${body.onChainTxHash ? `Tx: ${body.onChainTxHash}` : ""}`.trim(),
    previousStatus: prev.status,
    newStatus,
  });

  return NextResponse.json({ success: true, data: updated });
}
