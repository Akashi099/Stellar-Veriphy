import type { ApiResponse, ExtensionVerificationResult } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<ExtensionVerificationResult>>> {
  try {
    const body = await request.json() as {
      contentHash: string;
      contentType: string;
      url?: string;
      metadata?: Record<string, unknown>;
    };

    const simulatedVerified = Math.random() > 0.3;

    const result: ExtensionVerificationResult = {
      contentHash: body.contentHash,
      isVerified: simulatedVerified,
      certificateId: simulatedVerified ? `cert_${Date.now()}` : undefined,
      certificateData: simulatedVerified
        ? {
            id: `cert_${Date.now()}`,
            storageRef: "ipfs://QmXxxx",
            manifestHash: body.contentHash,
            attestationHash: `att_${Date.now()}`,
            creator: "GBXYZ123456789ABCDEF012345678901234567890",
            timestamp: Math.floor(Date.now() / 1000),
          }
        : undefined,
      validationStatus: simulatedVerified ? "valid" : "not_found",
      timestamp: Date.now(),
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Verification failed" },
      { status: 500 },
    );
  }
}
