/**
 * GET  /api/disputes               — list disputes (filter by certificateId, status; paginated)
 * POST /api/disputes               — raise a new content dispute
 */

import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@stellarveriphy/shared/types";
import type { DisputeAuditEntry, DisputeRecord } from "@/types/dispute";
import { legacyValidationError } from "@/lib/server/http";
import { paginate, parsePaginationParams } from "@stellarveriphy/shared";
import { validateRaiseDispute } from "@/lib/server/validators";

// ---------------------------------------------------------------------------
// In-memory store (replace with DB in production)
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __disputeStore: DisputeRecord[] | undefined;
  // eslint-disable-next-line no-var
  var __disputeAuditStore: DisputeAuditEntry[] | undefined;
}

function getStore(): DisputeRecord[] {
  if (!globalThis.__disputeStore) globalThis.__disputeStore = [];
  return globalThis.__disputeStore;
}

export function getAuditStore(): DisputeAuditEntry[] {
  if (!globalThis.__disputeAuditStore) globalThis.__disputeAuditStore = [];
  return globalThis.__disputeAuditStore;
}

export function appendAuditEntry(entry: DisputeAuditEntry): void {
  getAuditStore().push(entry);
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<DisputeRecord[]>>> {
  const { searchParams } = new URL(request.url);
  const pageParams = parsePaginationParams(searchParams);
  if (!pageParams.ok) return legacyValidationError(pageParams.errors);
  const certificateId = searchParams.get("certificateId");
  const status = searchParams.get("status");

  let items = getStore();
  if (certificateId) items = items.filter((d) => d.certificateId === certificateId);
  if (status) items = items.filter((d) => d.status === status);

  // Newest first
  items = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const page = paginate(items, pageParams.value);
  return NextResponse.json({ success: true, data: page.items, pagination: page.pagination });
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<DisputeRecord>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON." }, { status: 400 });
  }

  const validation = validateRaiseDispute(body);
  if (!validation.ok) return legacyValidationError(validation.errors);
  const b = validation.value;

  const now = new Date().toISOString();
  const disputeId = makeId("dsp");

  // Tag each evidence item with metadata
  const evidence = b.evidence.map((ev) => ({
    ...ev,
    id: makeId("ev"),
    attachedAt: now,
    attachedBy: b.reportedBy,
  }));

  const record: DisputeRecord = {
    id: disputeId,
    certificateId: b.certificateId,
    contentHash: b.contentHash,
    status: "open",
    trigger: b.trigger,
    summary: b.summary,
    reportedBy: b.reportedBy,
    evidence,
    createdAt: now,
    updatedAt: now,
    escalationChain: [],
  };

  getStore().push(record);

  // Seed the audit trail with the "raised" entry
  const auditEntry: DisputeAuditEntry = {
    id: makeId("aud"),
    disputeId,
    action: "raised",
    actor: b.reportedBy ?? "anonymous",
    timestamp: now,
    description: `Dispute raised with trigger "${b.trigger.replace(/_/g, " ")}". ${evidence.length > 0 ? `${evidence.length} evidence item(s) attached.` : "No initial evidence."}`,
  };
  appendAuditEntry(auditEntry);

  return NextResponse.json({ success: true, data: record }, { status: 201 });
}
