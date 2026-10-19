import type { ApiResponse, UserAnalytics } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<ApiResponse<UserAnalytics>>> {
  try {
    const userAnalytics: UserAnalytics = {
      totalUsers: 896,
      activeUsers: 432,
      newUsersThisMonth: 145,
      verificationsByUser: [
        {
          publicKey: "GBXYZ123456789ABCDEF012345678901234567890",
          verificationCount: 67,
          successfulVerifications: 64,
        },
        {
          publicKey: "GCABC987654321FEDCBA098765432109876543210",
          verificationCount: 54,
          successfulVerifications: 51,
        },
        {
          publicKey: "GDDEF456789012345ABCDEF012345678901234567",
          verificationCount: 48,
          successfulVerifications: 45,
        },
        {
          publicKey: "GEGHI789012345678FEDCBA987654321098765432",
          verificationCount: 42,
          successfulVerifications: 40,
        },
        {
          publicKey: "GHJKL012345678901234567890123456789012345",
          verificationCount: 38,
          successfulVerifications: 36,
        },
      ],
    };

    return NextResponse.json({ success: true, data: userAnalytics });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch user analytics" },
      { status: 500 },
    );
  }
}
