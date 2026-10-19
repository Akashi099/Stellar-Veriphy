import type { ApiResponse, AnalyticsReport } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

function getStoredReports(): AnalyticsReport[] {
  if (typeof globalThis !== "undefined" && "analyticsReports" in globalThis) {
    return (globalThis as unknown as Record<string, unknown>).analyticsReports as AnalyticsReport[];
  }
  return [];
}

function setStoredReports(reports: AnalyticsReport[]) {
  if (typeof globalThis !== "undefined") {
    (globalThis as unknown as Record<string, AnalyticsReport[]>).analyticsReports = reports;
  }
}

export async function GET(): Promise<NextResponse<ApiResponse<AnalyticsReport[]>>> {
  try {
    const reports = getStoredReports();
    return NextResponse.json({ success: true, data: reports });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch reports" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<AnalyticsReport>>> {
  try {
    const body = await request.json() as { period: string; format: string };
    const reports = getStoredReports();

    const newReport: AnalyticsReport = {
      id: `report_${Date.now()}`,
      generatedAt: Date.now(),
      generatedBy: "user_placeholder",
      period: body.period,
      statistics: {
        totalVerifications: 1234,
        successfulVerifications: 1150,
        failedVerifications: 84,
        successRate: 93.2,
        averageProcessingTime: 2500,
      },
      trends: {
        period: "month",
        data: Array.from({ length: 30 }, (_, i) => ({
          date: new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
          verifications: Math.floor(Math.random() * 100) + 20,
          uniqueUsers: Math.floor(Math.random() * 50) + 10,
          successfulCertificates: Math.floor(Math.random() * 90) + 10,
        })),
      },
      contentPopularity: {
        contentTypes: [
          { contentType: "image/png", count: 450, percentage: 36.5 },
          { contentType: "image/jpeg", count: 380, percentage: 30.8 },
          { contentType: "video/mp4", count: 250, percentage: 20.3 },
          { contentType: "image/webp", count: 154, percentage: 12.5 },
        ],
        topContentHashes: [
          {
            contentHash: "abc123def456789ghi012jkl345mno678pqr901stu234vwx567yza890bcde",
            verificationCount: 45,
            lastVerifiedAt: Date.now(),
          },
        ],
      },
      geographicDistribution: [
        {
          country: "United States",
          userCount: 345,
          verificationCount: 523,
          latitude: 37.09,
          longitude: -95.71,
        },
      ],
      userAnalytics: {
        totalUsers: 896,
        activeUsers: 432,
        newUsersThisMonth: 145,
        verificationsByUser: [],
      },
      format: (body.format || "json") as "pdf" | "csv" | "json",
    };

    reports.push(newReport);
    setStoredReports(reports);

    return NextResponse.json({ success: true, data: newReport }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to generate report" },
      { status: 500 },
    );
  }
}
