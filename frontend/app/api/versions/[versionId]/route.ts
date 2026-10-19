import type { ApiResponse, ContentVersion } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

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
  _request: NextRequest,
  { params }: { params: { versionId: string } },
): Promise<NextResponse<ApiResponse<ContentVersion>>> {
  try {
    const versions = getStoredVersions();
    const version = versions.find((v) => v.id === params.versionId);

    if (!version) {
      return NextResponse.json({ success: false, error: "Version not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: version });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch version" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { versionId: string } },
): Promise<NextResponse<ApiResponse<ContentVersion>>> {
  try {
    const body = await request.json() as { changeLog?: string };
    const versions = getStoredVersions();
    const versionIndex = versions.findIndex((v) => v.id === params.versionId);

    if (versionIndex === -1) {
      return NextResponse.json({ success: false, error: "Version not found" }, { status: 404 });
    }

    if (body.changeLog) {
      versions[versionIndex].changeLog = body.changeLog;
    }

    setStoredVersions(versions);

    return NextResponse.json({ success: true, data: versions[versionIndex] });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update version" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { versionId: string } },
): Promise<NextResponse<ApiResponse<void>>> {
  try {
    const versions = getStoredVersions();
    const filteredVersions = versions.filter((v) => v.id !== params.versionId);

    if (filteredVersions.length === versions.length) {
      return NextResponse.json({ success: false, error: "Version not found" }, { status: 404 });
    }

    setStoredVersions(filteredVersions);

    return NextResponse.json({ success: true, data: undefined });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to delete version" },
      { status: 500 },
    );
  }
}
