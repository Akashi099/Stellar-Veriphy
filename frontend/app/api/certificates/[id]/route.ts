import type { ApiResponse, CertificateDetails } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

function getStoredCertificates(): CertificateDetails[] {
  if (typeof globalThis !== "undefined" && "certificates" in globalThis) {
    return (globalThis as unknown as Record<string, unknown>).certificates as CertificateDetails[];
  }
  return [];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<ApiResponse<CertificateDetails>>> {
  try {
    const certificates = getStoredCertificates();
    const certificate = certificates.find((c) => c.id === params.id);

    if (!certificate) {
      return NextResponse.json({ success: false, error: "Certificate not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: certificate });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch certificate" },
      { status: 500 }
    );
  }
}
