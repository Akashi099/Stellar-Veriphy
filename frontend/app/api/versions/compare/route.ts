import type { ApiResponse, VersionComparison, ContentVersion } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

function getStoredVersions(): ContentVersion[] {
  if (typeof globalThis !== "undefined" && "versions" in globalThis) {
    return (globalThis as unknown as Record<string, unknown>).versions as ContentVersion[];
  }
  return [];
}

function flatten(value: unknown, prefix = ""): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return prefix ? { [prefix]: value } : {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
    (acc, [key, entry]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
        Object.assign(acc, flatten(entry, path));
      } else {
        acc[path] = entry;
      }
      return acc;
    },
    {},
  );
}

function compareVersions(versionA: ContentVersion, versionB: ContentVersion) {
  const a = flatten(versionA);
  const b = flatten(versionB);
  const fields = new Set([...Object.keys(a), ...Object.keys(b)]);

  return [...fields]
    .sort()
    .filter((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]))
    .map((field) => {
      const changeType = a[field] === undefined ? "added" : b[field] === undefined ? "removed" : "modified";
      return {
        field,
        oldValue: a[field],
        newValue: b[field],
        changeType,
      } as const;
    });
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<VersionComparison>>> {
  try {
    const { searchParams } = new URL(request.url);
    const versionAId = searchParams.get("versionA");
    const versionBId = searchParams.get("versionB");

    if (!versionAId || !versionBId) {
      return NextResponse.json(
        { success: false, error: "Both versionA and versionB are required" },
        { status: 400 },
      );
    }

    const versions = getStoredVersions();
    const versionA = versions.find((v) => v.id === versionAId);
    const versionB = versions.find((v) => v.id === versionBId);

    if (!versionA || !versionB) {
      return NextResponse.json(
        { success: false, error: "One or both versions not found" },
        { status: 404 },
      );
    }

    const comparison: VersionComparison = {
      versionA,
      versionB,
      differences: compareVersions(versionA, versionB),
    };

    return NextResponse.json({ success: true, data: comparison });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to compare versions" },
      { status: 500 },
    );
  }
}
