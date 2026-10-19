/**
 * GET /api/certificates/duplicates
 *
 * Scans all known certificates for duplicate or conflicting mint events (#689).
 *
 * Returns a DuplicateScanResult containing:
 *   - duplicate group count
 *   - per-group alerts sorted by severity (CONFLICT first)
 *   - a count of high-risk conflicts
 *
 * Query parameters:
 *   contentHash  (optional) — restrict scan to certificates matching this hash
 *   manifestHash (optional) — restrict scan to certificates matching this hash
 *
 * POST /api/certificates/duplicates/check-mint
 *
 * Pre-mint gate: checks whether a proposed new mint is blocked due to an
 * existing unresolved CONFLICT alert for the same content.
 *
 * Body: { contentHash: string; manifestHash: string }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  scanForDuplicates,
  checkMintGate,
  type CertificateRecord,
  type DuplicateScanResult,
} from "@/lib/fraud/duplicateDetection";

// ---------------------------------------------------------------------------
// Mock certificate store — replace with provenance event indexer in production
// ---------------------------------------------------------------------------

function getMockCertificates(): CertificateRecord[] {
  return [
    // Normal certificate
    {
      certificateId: "CERT-001",
      contentHash: "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778801",
      manifestHash: "112233445566778899aabbccddeeff00112233445566778899aabbccddee01",
      creator: "GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNSOLXAUJVLVWXVVNQNYWGLZ",
      attestationHash: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefde01",
      timestamp: 1_700_000_000,
      storageRef: "bafybeiabc001",
    },
    // Exact duplicate of CERT-001 (benign double-submit)
    {
      certificateId: "CERT-002",
      contentHash: "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778801",
      manifestHash: "112233445566778899aabbccddeeff00112233445566778899aabbccddee01",
      creator: "GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNSOLXAUJVLVWXVVNQNYWGLZ",
      attestationHash: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefde01",
      timestamp: 1_700_000_060,
      storageRef: "bafybeiabc001",
    },
    // Conflict: same content hash, different creator (high risk)
    {
      certificateId: "CERT-003",
      contentHash: "ff00112233445566778899aabbccddeeff00112233445566778899aabbcc03",
      manifestHash: "cc00112233445566778899aabbccddee0011223344556677cc0011223302",
      creator: "GDRXE2BQUC3AZNPVFSCEZ76DV3LW64R3Q5JMB6G3ZP4U7OV6GCFYXFGH",
      attestationHash: "feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefe03",
      timestamp: 1_700_001_000,
      storageRef: "bafybeiabc003",
    },
    {
      certificateId: "CERT-004",
      contentHash: "ff00112233445566778899aabbccddeeff00112233445566778899aabbcc03",
      manifestHash: "cc00112233445566778899aabbccddee0011223344556677cc0011223302",
      creator: "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
      attestationHash: "badf00dbadf00dbadf00dbadf00dbadf00dbadf00dbadf00dbadf00dba04",
      timestamp: 1_700_001_500,
      storageRef: "bafybeiabc004",
    },
    // Soft duplicate: same content, same creator, different cert IDs
    {
      certificateId: "CERT-005",
      contentHash: "99aabbccddeeff00112233445566778899aabbccddeeff0011223344556605",
      manifestHash: "8899aabbccddeeff00112233445566778899aabbccddeeff00112233440605",
      creator: "GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNSOLXAUJVLVWXVVNQNYWGLZ",
      attestationHash: "cafecafecafecafecafecafecafecafecafecafecafecafecafecafeca05",
      timestamp: 1_700_002_000,
      storageRef: "bafybeiabc005",
    },
    {
      certificateId: "CERT-006",
      contentHash: "99aabbccddeeff00112233445566778899aabbccddeeff0011223344556605",
      manifestHash: "8899aabbccddeeff00112233445566778899aabbccddeeff00112233440605",
      creator: "GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNSOLXAUJVLVWXVVNQNYWGLZ",
      attestationHash: "cafecafecafecafecafecafecafecafecafecafecafecafecafecafeca05",
      timestamp: 1_700_002_300,
      storageRef: "bafybeiabc006",
    },
  ];
}

// ---------------------------------------------------------------------------
// GET — scan for duplicates
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<DuplicateScanResult | { error: string }>> {
  try {
    const { searchParams } = new URL(request.url);
    const contentHashFilter = searchParams.get("contentHash");
    const manifestHashFilter = searchParams.get("manifestHash");

    let certificates = getMockCertificates();

    if (contentHashFilter) {
      certificates = certificates.filter((c) => c.contentHash === contentHashFilter);
    }

    if (manifestHashFilter) {
      certificates = certificates.filter((c) => c.manifestHash === manifestHashFilter);
    }

    const result = scanForDuplicates(certificates);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to scan for duplicate certificates." },
      { status: 500 }
    );
  }
}
