import type { ApiResponse, UsageTrends } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<UsageTrends>>> {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") || "month") as "day" | "week" | "month" | "year";

    const trendData = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      verifications: Math.floor(Math.random() * 100) + 20,
      uniqueUsers: Math.floor(Math.random() * 50) + 10,
      successfulCertificates: Math.floor(Math.random() * 90) + 10,
    }));

    const trends: UsageTrends = {
      period,
      data: trendData,
    };

    return NextResponse.json({ success: true, data: trends });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch trends" },
      { status: 500 },
    );
  }
}
