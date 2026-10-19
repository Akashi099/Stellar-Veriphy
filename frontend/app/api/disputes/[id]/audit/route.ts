/**
 * GET /api/disputes/[id]/audit — fetch the full ordered audit trail for a dispute
 */

import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@stellarveriphy/shared/types";
import type { DisputeAuditEntry } from "@/types/dispute";
import { getAuditStore } from "../../route";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse<ApiResponse<DisputeAuditEntry[]>>> {
  const entries = getAuditStore()
    .filter((e) => e.disputeId === params.id)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return NextResponse.json({ success: true, data: entries });
}
