/**
 * GET /api/provenance/[id]/snapshots
 *
 * Returns the ordered snapshot history for a certificate.
 *
 * In production this queries the Soroban provenance contract's
 * `get_certificate_history` and `get_rollback_history` functions, then
 * assembles them into SnapshotRecord objects so the diff UI can compare any
 * two points in the certificate's lifecycle.
 *
 * For now this route returns mock data so the UI is exercisable locally
 * without a live network connection.
 */

import { NextResponse } from "next/server";
import type { SnapshotRecord } from "@stellarveriphy/shared/utils/snapshotDiff";

const MOCK_BASE_TIME = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

function buildMockSnapshots(id: string): SnapshotRecord[] {
  const creator = "GCREATOR7EXAMPLE000000000000000000000000000000000000000000000";
  const oracle = "GORACLE7EXAMPLE0000000000000000000000000000000000000000000000";

  return [
    {
      id: `${id}-snap-1`,
      certificateId: id,
      manifestHash: "a1b2c3d4e5f601234567890abcdef01234567890abcdef01234567890abcdef0",
      attestationHash: "f0e1d2c3b4a50123456789abcdef01234567890abcdef01234567890abcdef01",
      storageRef: `ipfs://QmExampleHash${id}V1`,
      creator,
      actor: oracle,
      timestamp: MOCK_BASE_TIME,
      verificationLevel: "Standard",
      revoked: false,
      metadata: { device: "Canon EOS R5", location: "New York, US" },
      tags: ["photography", "original"],
    },
    {
      id: `${id}-snap-2`,
      certificateId: id,
      manifestHash: "a1b2c3d4e5f601234567890abcdef01234567890abcdef01234567890abcdef0",
      attestationHash: "f0e1d2c3b4a50123456789abcdef01234567890abcdef01234567890abcdef01",
      storageRef: `ipfs://QmExampleHash${id}V1`,
      creator,
      actor: creator,
      timestamp: MOCK_BASE_TIME + 3600,
      verificationLevel: "Standard",
      revoked: false,
      metadata: { device: "Canon EOS R5", location: "New York, US" },
      tags: ["photography", "original", "award-finalist"],
    },
    {
      id: `${id}-snap-3`,
      certificateId: id,
      manifestHash: "b2c3d4e5f601234567890abcdef01234567890abcdef01234567890abcdef012",
      attestationHash: "e1d2c3b4a50123456789abcdef01234567890abcdef01234567890abcdef012a",
      storageRef: `ipfs://QmExampleHash${id}V2`,
      creator,
      actor: oracle,
      timestamp: MOCK_BASE_TIME + 2 * 3600,
      verificationLevel: "Premium",
      revoked: false,
      metadata: { device: "Canon EOS R5", location: "New York, US" },
      tags: ["photography", "original", "award-finalist"],
    },
  ];
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;

  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid certificate ID." }, { status: 400 });
  }

  // In production: query the Soroban provenance contract via a server-side
  // Stellar SDK call and build real SnapshotRecord objects.
  const snapshots = buildMockSnapshots(id);

  return NextResponse.json({ snapshots, certificateId: id });
}
