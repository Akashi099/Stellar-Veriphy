import { paginate, parsePaginationParams, type ApiResponse, type AuditLogEntry } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";
import { legacyValidationError } from "@/lib/server/http";

function getStoredAuditLogs(): AuditLogEntry[] {
  if (typeof globalThis !== "undefined" && "auditLogs" in globalThis) {
    return (globalThis as unknown as Record<string, unknown>).auditLogs as AuditLogEntry[];
  }
  return [];
}

function setStoredAuditLogs(logs: AuditLogEntry[]) {
  if (typeof globalThis !== "undefined") {
    (globalThis as unknown as Record<string, AuditLogEntry[]>).auditLogs = logs;
  }
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<AuditLogEntry[]>>> {
  try {
    const { searchParams } = new URL(request.url);
    const pageParams = parsePaginationParams(searchParams);
    if (!pageParams.ok) return legacyValidationError(pageParams.errors);
    const entityId = searchParams.get("entityId");

    const auditLogs = getStoredAuditLogs();
    const filtered = entityId ? auditLogs.filter((log) => log.entityId === entityId) : auditLogs;

    // Newest first, so page 1 is the most recent activity.
    const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp);
    const page = paginate(sorted, pageParams.value);
    return NextResponse.json({ success: true, data: page.items, pagination: page.pagination });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch audit logs" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<AuditLogEntry>>> {
  try {
    const body = await request.json() as {
      entityType: string;
      entityId: string;
      action: string;
      details?: Record<string, unknown>;
    };
    const auditLogs = getStoredAuditLogs();

    const newLog: AuditLogEntry = {
      id: `log_${Date.now()}`,
      entityType: body.entityType as AuditLogEntry["entityType"],
      entityId: body.entityId,
      action: body.action,
      actor: "user_placeholder",
      details: body.details,
      timestamp: Date.now(),
    };

    auditLogs.push(newLog);
    setStoredAuditLogs(auditLogs);

    return NextResponse.json({ success: true, data: newLog }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create audit log" },
      { status: 500 },
    );
  }
}
