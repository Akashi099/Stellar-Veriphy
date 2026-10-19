import {
  paginate,
  parsePaginationParams,
  rejectUnknownFields,
  requireObject,
  sha256Field,
  textField,
  type ApiResponse,
  type ContentVersion,
  type FieldError,
} from "@stellarveriphy/shared";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { legacyValidationError } from "@/lib/server/http";
import { ifMatchFailed, versionEtag, versionLockKey, withKeyLock } from "@/lib/server/write-concurrency";

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

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<ContentVersion[]>>> {
  try {
    const { searchParams } = new URL(request.url);
    const pageParams = parsePaginationParams(searchParams);
    if (!pageParams.ok) return legacyValidationError(pageParams.errors);
    const contentHash = searchParams.get("contentHash");

    const versions = getStoredVersions();
    const filtered = contentHash
      ? versions.filter((v) => v.contentHash === contentHash)
      : versions;

    const page = paginate(filtered, pageParams.value);
    const etag = contentHash ? versionEtag(filtered.find((v) => v.isCurrentVersion)) : undefined;
    return NextResponse.json(
      { success: true, data: page.items, pagination: page.pagination },
      etag ? { headers: { ETag: etag } } : undefined,
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch versions" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<ContentVersion>>> {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Malformed JSON." }, { status: 400 });
    }
    const object = requireObject(raw);
    if (!object.ok) return legacyValidationError(object.errors);
    const errors: FieldError[] = [];
    rejectUnknownFields(object.value, ["contentHash", "manifestHash", "changeLog"], errors);
    const contentHash = sha256Field(object.value, "contentHash", { required: true }, errors);
    const manifestHash = sha256Field(object.value, "manifestHash", { required: true }, errors);
    const changeLog = textField(object.value, "changeLog", { maxLength: 2000 }, errors);
    if (errors.length > 0 || !contentHash || !manifestHash) return legacyValidationError(errors);
    const body = { contentHash, manifestHash, changeLog };

    // Read the current version and append the new one as a single step per
    // manifest, so rapid saves can't both build on the same predecessor.
    const outcome = await withKeyLock(versionLockKey(body.contentHash), async () => {
      const versions = getStoredVersions();
      const contentVersions = versions.filter((v) => v.contentHash === body.contentHash);
      const current = contentVersions.find((v) => v.isCurrentVersion) ?? contentVersions.at(-1);

      if (ifMatchFailed(request, versionEtag(current))) return { conflict: current } as const;

      const id = `version_${randomUUID()}`;
      if (current) {
        current.isCurrentVersion = false;
        current.nextVersionId = id;
      }

      const created: ContentVersion = {
        id,
        versionNumber: Math.max(0, ...contentVersions.map((v) => v.versionNumber)) + 1,
        contentHash: body.contentHash,
        manifestHash: body.manifestHash,
        creator: "user_placeholder",
        createdAt: Date.now(),
        changeLog: body.changeLog,
        previousVersionId: current?.id,
        isCurrentVersion: true,
      };

      versions.push(created);
      setStoredVersions(versions);
      return { created } as const;
    });

    if ("conflict" in outcome) {
      const current = outcome.conflict;
      return NextResponse.json(
        {
          success: false,
          error: current
            ? `This manifest changed since you last read it; the current version is ${current.id}. Re-read and retry with If-Match: "${current.id}".`
            : "This manifest has no versions yet; retry without If-Match.",
          ...(current ? { data: current } : {}),
        },
        { status: 409, headers: current ? { ETag: versionEtag(current)! } : undefined },
      );
    }
    const newVersion = outcome.created;

    return NextResponse.json({ success: true, data: newVersion }, { status: 201, headers: { ETag: versionEtag(newVersion)! } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create version" },
      { status: 500 },
    );
  }
}
