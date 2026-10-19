import type { ApiResponse, GeographicDistribution } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<ApiResponse<GeographicDistribution[]>>> {
  try {
    const distribution: GeographicDistribution[] = [
      {
        country: "United States",
        userCount: 345,
        verificationCount: 523,
        latitude: 37.09,
        longitude: -95.71,
      },
      {
        country: "United Kingdom",
        userCount: 128,
        verificationCount: 234,
        latitude: 55.38,
        longitude: -3.43,
      },
      {
        country: "Germany",
        userCount: 95,
        verificationCount: 156,
        latitude: 51.17,
        longitude: 10.45,
      },
      {
        country: "Japan",
        userCount: 87,
        verificationCount: 142,
        latitude: 36.2,
        longitude: 138.25,
      },
      {
        country: "India",
        userCount: 76,
        verificationCount: 134,
        latitude: 20.59,
        longitude: 78.96,
      },
      {
        country: "Brazil",
        userCount: 63,
        verificationCount: 89,
        latitude: -14.24,
        longitude: -51.93,
      },
      {
        country: "Australia",
        userCount: 54,
        verificationCount: 78,
        latitude: -25.27,
        longitude: 133.78,
      },
      {
        country: "Canada",
        userCount: 48,
        verificationCount: 65,
        latitude: 56.13,
        longitude: -106.35,
      },
    ];

    return NextResponse.json({ success: true, data: distribution });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch geographic distribution" },
      { status: 500 },
    );
  }
}
