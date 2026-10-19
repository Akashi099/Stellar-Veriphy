/**
 * POST /api/versions/rollback
 *
 * Rolls an asset back to a previous version and persists an immutable
 * RollbackMetadata record for auditability (#658).
 */
import type { ApiResponse, ContentVersion, RollbackMetadata } from "@stellarveriphy/shared";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ifMatchFailed, versionEtag, versionLockKey, withKeyLock } from "@/lib/server/write-concurrency";

// ---------------------------------------------------------------------------
// In-memory stores (replaced by a real DB in production)
// ---------------------------------------------------------------------------

function getStoredVersions(): ContentVersion[] {
  if (typeof globalThis !== "undefined" && "versions" in globalThis) {
    return (globalThis as unknown as Record<string, unknown>).versions as ContentVersion[];
  }
  return [];
}

function setStoredVersions(versions: ContentVersion[]) {
  if (typeof globalThis !== "undefined") {
    (globalThis as unknown as Record<string, ContentVersion[]>).versions = versions;
  }
}

function getRollbackHistory(): RollbackMetadata[] {
  if (typeof globalThis !== "undefined" && "rollbackHistory" in globalThis) {
    return (globalThis as unknown as Record<string, unknown>).rollbackHistory as RollbackMetadata[];
  }
  return [];
}

function appendRollbackRecord(record: RollbackMetadata) {
  const history = getRollbackHistory();
  history.push(record);
  if (typeof globalThis !== "undefined") {
    (globalThis as unknown as Record<string, RollbackMetadata[]>).rollbackHistory = history;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

interface RollbackRequestBody {
  contentHash: string;
  versionId: string;
  initiatedBy?: string;
  reason?: string;
  notes?: string;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<{ version: ContentVersion; rollback: RollbackMetadata }>>> {
  try {
    const body = (await request.json()) as RollbackRequestBody;

    if (!body.contentHash || !body.versionId) {
      return NextResponse.json(
        { success: false, error: "contentHash and versionId are required." },
        { status: 400 },
      );
    }

    // Same lock as POST /api/versions: a rollback and a save for one manifest
    // never interleave, and If-Match rejects a rollback based on a stale read (#786).
    const outcome = await withKeyLock(versionLockKey(body.contentHash), async () => {
      const versions = getStoredVersions();

      const targetVersion = versions.find((v) => v.id === body.versionId);
      if (!targetVersion || targetVersion.contentHash !== body.contentHash) {
        return { error: { status: 404, message: "Version not found for this content." } } as const;
      }

      const currentVersion = versions.find(
        (v) => v.contentHash === body.contentHash && v.isCurrentVersion,
      );

      if (ifMatchFailed(request, versionEtag(currentVersion))) {
        return {
          error: {
            status: 409,
            message: currentVersion
              ? `This manifest changed since you last read it; the current version is ${currentVersion.id}. Re-read and retry with If-Match: "${currentVersion.id}".`
              : "This manifest has no current version; retry without If-Match.",
            current: currentVersion,
          },
        } as const;
      }

      if (currentVersion?.id === body.versionId) {
        return { error: { status: 409, message: "Target version is already the current version.", current: currentVersion } } as const;
      }

      const id = `version_${randomUUID()}`;
      // Demote the active version
      if (currentVersion) {
        currentVersion.isCurrentVersion = false;
        currentVersion.nextVersionId = id;
      }

      // Create a new version entry representing the restored state
      const newVersion: ContentVersion = {
        id,
        versionNumber:
          Math.max(0, ...versions.filter((v) => v.contentHash === body.contentHash).map((v) => v.versionNumber)) + 1,
        contentHash: body.contentHash,
        manifestHash: targetVersion.manifestHash,
        creator: body.initiatedBy ?? "unknown",
        createdAt: Date.now(),
        changeLog: `Rolled back to version ${targetVersion.versionNumber} (${targetVersion.id})`,
        previousVersionId: currentVersion?.id,
        isCurrentVersion: true,
      };

      versions.push(newVersion);
      setStoredVersions(versions);

      // Persist an immutable rollback record for auditability
      const rollbackRecord: RollbackMetadata = {
        id: `rollback_${randomUUID()}`,
        contentHash: body.contentHash,
        fromVersionId: currentVersion?.id ?? "unknown",
        fromVersionNumber: currentVersion?.versionNumber ?? 0,
        toVersionId: targetVersion.id,
        toVersionNumber: targetVersion.versionNumber,
        initiatedBy: body.initiatedBy ?? "unknown",
        initiatedAt: new Date().toISOString(),
        reason: (body.reason as RollbackMetadata["reason"]) ?? "other",
        notes: body.notes,
        targetManifestHash: targetVersion.manifestHash,
      };

      appendRollbackRecord(rollbackRecord);
      return { newVersion, rollbackRecord } as const;
    });

    if ("error" in outcome) {
      const { status, message } = outcome.error;
      const current = "current" in outcome.error ? outcome.error.current : undefined;
      const etag = versionEtag(current);
      return NextResponse.json(
        { success: false, error: message },
        { status, headers: etag ? { ETag: etag } : undefined },
      );
    }
    const { newVersion, rollbackRecord } = outcome;

    return NextResponse.json({
      success: true,
      data: { version: newVersion, rollback: rollbackRecord },
    }, { headers: { ETag: versionEtag(newVersion)! } });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to perform rollback." },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/versions/rollback?contentHash=<hash>
// Returns the rollback history for an asset.
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<RollbackMetadata[]>>> {
  try {
    const { searchParams } = new URL(request.url);
    const contentHash = searchParams.get("contentHash");

    const history = getRollbackHistory();
    const filtered = contentHash
      ? history.filter((r) => r.contentHash === contentHash)
      : history;

    return NextResponse.json({ success: true, data: filtered });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch rollback history." },
      { status: 500 },
    );
  }
}
