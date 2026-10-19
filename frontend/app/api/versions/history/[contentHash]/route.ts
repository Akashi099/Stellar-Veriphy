import type { ApiResponse, VersionHistory, ContentVersion } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

function getStoredVersions(): ContentVersion[] {
  if (typeof globalThis !== "undefined" && "versions" in globalThis) {
    return (globalThis as unknown as Record<string, unknown>).versions as ContentVersion[];
  }
  return [];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { contentHash: string } },
): Promise<NextResponse<ApiResponse<VersionHistory>>> {
  try {
    const versions = getStoredVersions();
    const contentVersions = versions.filter((v) => v.contentHash === params.contentHash);

    if (contentVersions.length === 0) {
      return NextResponse.json(
        { success: false, error: "No versions found for this content" },
        { status: 404 },
      );
    }

    const history: VersionHistory = {
      id: `history_${Date.now()}`,
      contentHash: params.contentHash,
      versions: contentVersions.sort((a, b) => b.versionNumber - a.versionNumber),
      totalVersions: contentVersions.length,
      createdAt: Math.min(...contentVersions.map((v) => v.createdAt)),
      updatedAt: Math.max(...contentVersions.map((v) => v.createdAt)),
    };

    return NextResponse.json({ success: true, data: history });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch version history" },
      { status: 500 },
    );
  }
}
