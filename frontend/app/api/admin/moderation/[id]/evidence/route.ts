/**
 * GET  /api/admin/moderation/[id]/evidence  — build the evidence package for a dispute
 * POST /api/admin/moderation/[id]/evidence  — attach a new evidence item
 *
 * The package bundles every file, manifest, hash, attestation, link and comment
 * attached to the dispute, runs integrity checks, and returns a package hash
 * that can be anchored on-chain (oracle `anchor_dispute_evidence`) (#671).
 * Every package build and item submission is written to the audit log.
 */
import {
  buildEvidencePackage,
  evidencePackageAuditEntries,
  legacyEvidenceToItems,
  summarizeEvidencePackage,
  validateEvidenceItem,
  type ApiResponse,
  type AuditLogEntry,
  type DisputeEvidenceItem,
  type DisputeEvidencePackage,
  type EvidencePackageSummary,
  type ModerationQueueItem,
} from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

import { requireApiToken, type GuardResult } from "@/lib/security/apiTokenStore";
import { recordModerationAudit, type ModerationAuditAction } from "@/lib/server/moderation-audit";
import { logOperationalEvent, requestIdFrom } from "@/lib/server/observability";

export const dynamic = "force-dynamic";

type Globals = {
  moderationQueue?: ModerationQueueItem[];
  disputeEvidence?: Record<string, DisputeEvidenceItem[]>;
  auditLogs?: AuditLogEntry[];
};
const globals = globalThis as unknown as Globals;

function findDispute(id: string) {
  return (globals.moderationQueue ?? []).find((i) => i.id === id);
}

function evidenceFor(id: string): DisputeEvidenceItem[] {
  globals.disputeEvidence ??= {};
  globals.disputeEvidence[id] ??= [];
  return globals.disputeEvidence[id];
}

function writeAudit(entries: Array<Omit<AuditLogEntry, "id" | "timestamp" | "actor">>, actor: string) {
  globals.auditLogs ??= [];
  const now = Date.now();
  entries.forEach((entry, i) =>
    globals.auditLogs!.push({ ...entry, id: `log_${now}_${i}`, actor, timestamp: now }),
  );
}

function roleOf(guard: Extract<GuardResult, { ok: true }>): string {
  return guard.record ? `${guard.record.surface}_token` : "unverified";
}

async function auditRefused(request: NextRequest, id: string, action: ModerationAuditAction, status: number) {
  await recordModerationAudit({
    actor: request.headers.get("x-actor") ?? "unauthenticated",
    actorRole: "unknown",
    action,
    targetId: id,
    outcome: status === 404 ? "not_found" : "denied",
    reason: `HTTP ${status}`,
    requestId: requestIdFrom(request),
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse<{ package: DisputeEvidencePackage; summary: EvidencePackageSummary }>>> {
  const { id } = await params;
  const guard = await requireApiToken(request, "moderation:read", "admin");
  if (!guard.ok) {
    await auditRefused(request, id, "evidence_package_viewed", guard.response.status);
    return guard.response as NextResponse<ApiResponse<never>>;
  }

  const dispute = findDispute(id);
  if (!dispute) {
    await auditRefused(request, id, "evidence_package_viewed", 404);
    return NextResponse.json({ success: false, error: "Dispute not found." }, { status: 404 });
  }

  const onChain = new URL(request.url).searchParams.get("onChainDisputeId");
  const pkg = await buildEvidencePackage({
    dispute,
    items: [...legacyEvidenceToItems(dispute), ...evidenceFor(id)],
    createdBy: guard.actor,
    onChainDisputeId: onChain && /^\d+$/.test(onChain) ? Number(onChain) : undefined,
  });

  writeAudit(
    [
      {
        entityType: "dispute_evidence",
        entityId: id,
        action: "evidence_package_viewed",
        details: { packageId: pkg.packageId, packageHash: pkg.packageHash },
      },
    ],
    guard.actor,
  );
  await recordModerationAudit({
    actor: guard.actor,
    actorRole: roleOf(guard),
    action: "evidence_package_viewed",
    targetId: id,
    assetId: dispute.assetId,
    contentHash: dispute.contentHash,
    outcome: "success",
    requestId: requestIdFrom(request),
  });

  return NextResponse.json(
    { success: true, data: { package: pkg, summary: summarizeEvidencePackage(pkg) } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse<{ item: DisputeEvidenceItem; packageHash: string }>>> {
  const requestId = requestIdFrom(request);
  const { id } = await params;
  const guard = await requireApiToken(request, "moderation:write", "admin");
  if (!guard.ok) {
    await auditRefused(request, id, "evidence_added", guard.response.status);
    return guard.response as NextResponse<ApiResponse<never>>;
  }

  const dispute = findDispute(id);
  if (!dispute) {
    await auditRefused(request, id, "evidence_added", 404);
    return NextResponse.json({ success: false, error: "Dispute not found." }, { status: 404 });
  }

  let body: Partial<DisputeEvidenceItem>;
  try {
    body = (await request.json()) as Partial<DisputeEvidenceItem>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const item: DisputeEvidenceItem = {
    ...body,
    id: `${id}-ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    submittedAt: new Date().toISOString(),
    submittedBy: body.submittedBy?.trim() || guard.actor,
    submitterRole: body.submitterRole ?? "reviewer",
    sha256: body.sha256?.trim().toLowerCase().replace(/^0x/, ""),
  } as DisputeEvidenceItem;

  const problems = validateEvidenceItem(item);
  if (problems.length > 0) {
    await recordModerationAudit({
      actor: guard.actor,
      actorRole: roleOf(guard),
      action: "evidence_added",
      targetId: id,
      assetId: dispute.assetId,
      contentHash: dispute.contentHash,
      outcome: "invalid",
      reason: problems.join("; "),
      requestId,
    });
    return NextResponse.json({ success: false, error: problems.join("; ") }, { status: 422 });
  }

  evidenceFor(id).push(item);

  const pkg = await buildEvidencePackage({
    dispute,
    items: [...legacyEvidenceToItems(dispute), ...evidenceFor(id)],
    createdBy: guard.actor,
  });
  const itemAudit = evidencePackageAuditEntries(pkg).find(
    (e) => e.action === "evidence_item_packaged" && e.details.itemId === item.id,
  );
  writeAudit(
    [
      {
        entityType: "dispute_evidence",
        entityId: id,
        action: "evidence_item_added",
        details: { ...itemAudit?.details, packageHash: pkg.packageHash },
      },
    ],
    guard.actor,
  );

  await recordModerationAudit({
    actor: guard.actor,
    actorRole: roleOf(guard),
    action: "evidence_added",
    targetId: id,
    assetId: dispute.assetId,
    contentHash: dispute.contentHash,
    outcome: "success",
    changes: { evidence: { from: null, to: { itemId: item.id, kind: item.kind, packageHash: pkg.packageHash } } },
    requestId,
  });

  logOperationalEvent("info", "dispute_evidence.item_added", {
    requestId,
    route: "/api/admin/moderation/[id]/evidence",
    operation: "add_evidence",
    status: 201,
    actor: guard.actor,
    contentHash: dispute.contentHash,
    details: { disputeId: id, kind: item.kind },
  });

  return NextResponse.json({ success: true, data: { item, packageHash: pkg.packageHash } }, { status: 201 });
}
