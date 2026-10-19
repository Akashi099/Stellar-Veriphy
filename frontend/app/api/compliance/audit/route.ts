/**
 * GET /api/compliance/audit
 *
 * Returns the compliance audit trail for provenance events (#688).
 *
 * Query parameters:
 *   actionType   (optional) — filter by ComplianceActionType
 *   legalBasis   (optional) — filter by ComplianceLegalBasis
 *   severity     (optional) — filter by ComplianceSeverity (routine|notable|high)
 *   entityId     (optional) — filter entries related to a specific entity
 *   summary      (optional, boolean) — include a summary object in the response
 *
 * POST /api/compliance/audit
 *
 * Records a new compliance audit entry.
 *
 * Body:
 * {
 *   actionType: ComplianceActionType;
 *   legalBasis: ComplianceLegalBasis;
 *   actor: string;              // pseudonymous identifier — no raw PII
 *   entityId?: string;
 *   entityType?: string;
 *   reason: string;             // max 200 chars
 *   outcome: string;
 *   severity?: ComplianceSeverity;
 * }
 *
 * SENSITIVE DATA NOTE
 * -------------------
 * This API route does not accept or return private keys, credentials, raw
 * personal data, or any field that could identify an individual without
 * first being pseudonymised. Callers must hash or truncate identifiers
 * before submitting them.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  complianceAuditTrail,
  type ComplianceActionType,
  type ComplianceLegalBasis,
  type ComplianceSeverity,
  type ComplianceAuditEntry,
} from "@/lib/compliance/complianceAuditTrail";

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<
  NextResponse<
    | { entries: ComplianceAuditEntry[]; summary?: ReturnType<typeof complianceAuditTrail.getSummary> }
    | { error: string }
  >
> {
  try {
    const { searchParams } = new URL(request.url);

    const actionType = searchParams.get("actionType") as ComplianceActionType | null;
    const legalBasis = searchParams.get("legalBasis") as ComplianceLegalBasis | null;
    const severity = searchParams.get("severity") as ComplianceSeverity | null;
    const entityId = searchParams.get("entityId");
    const includeSummary = searchParams.get("summary") === "true";

    const entries = complianceAuditTrail.getEntries({
      ...(actionType ? { actionType } : {}),
      ...(legalBasis ? { legalBasis } : {}),
      ...(severity ? { severity } : {}),
      ...(entityId ? { entityId } : {}),
    });

    const response: {
      entries: ComplianceAuditEntry[];
      summary?: ReturnType<typeof complianceAuditTrail.getSummary>;
    } = { entries };

    if (includeSummary) {
      response.summary = complianceAuditTrail.getSummary();
    }

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to retrieve compliance audit trail." },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

interface ComplianceRecordBody {
  actionType: ComplianceActionType;
  legalBasis: ComplianceLegalBasis;
  actor: string;
  entityId?: string;
  entityType?: ComplianceAuditEntry["entityType"];
  reason: string;
  outcome: string;
  severity?: ComplianceSeverity;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<{ entry: ComplianceAuditEntry } | { error: string }>> {
  try {
    const body = (await request.json()) as ComplianceRecordBody;

    // Basic validation
    if (!body.actionType || !body.legalBasis || !body.actor || !body.reason || !body.outcome) {
      return NextResponse.json(
        {
          error:
            "Request body must include: actionType, legalBasis, actor, reason, and outcome.",
        },
        { status: 400 }
      );
    }

    if (body.reason.length > 200) {
      return NextResponse.json(
        { error: "reason must not exceed 200 characters." },
        { status: 400 }
      );
    }

    const entry = await complianceAuditTrail.record({
      actionType: body.actionType,
      legalBasis: body.legalBasis,
      actor: body.actor,
      entityId: body.entityId,
      entityType: body.entityType,
      reason: body.reason,
      outcome: body.outcome,
      severity: body.severity,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to record compliance audit entry." },
      { status: 500 }
    );
  }
}
