import type { ApiResponse, PopularContentData } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<ApiResponse<PopularContentData>>> {
  try {
    const popularContent: PopularContentData = {
      contentTypes: [
        { contentType: "image/png", count: 450, percentage: 36.5 },
        { contentType: "image/jpeg", count: 380, percentage: 30.8 },
        { contentType: "video/mp4", count: 250, percentage: 20.3 },
        { contentType: "image/webp", count: 154, percentage: 12.5 },
      ],
      topContentHashes: [
        {
          contentHash:
            "abc123def456789ghi012jkl345mno678pqr901stu234vwx567yza890bcde",
          verificationCount: 45,
          lastVerifiedAt: Date.now(),
        },
        {
          contentHash:
            "def456ghi789jkl012mno345pqr678stu901vwx234yza567bcd890efg123",
          verificationCount: 38,
          lastVerifiedAt: Date.now() - 86400000,
        },
        {
          contentHash:
            "ghi789jkl012mno345pqr678stu901vwx234yza567bcd890efg123hij456",
          verificationCount: 32,
          lastVerifiedAt: Date.now() - 172800000,
        },
      ],
    };

    return NextResponse.json({ success: true, data: popularContent });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch popular content" },
      { status: 500 },
    );
  }
}
