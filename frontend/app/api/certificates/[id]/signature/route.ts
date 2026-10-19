/**
 * GET  /api/certificates/[id]/signature  — read the stored manifest signature
 * POST /api/certificates/[id]/signature  — submit a signed manifest for oracle verification
 *
 * In production the POST handler would:
 * 1. Re-verify the Ed25519 signature off-chain against the Stellar registry.
 * 2. Call provenance_client.store_manifest_signature(...) on-chain via the oracle keypair.
 *
 * Currently returns mock data so the ManifestSigningPanel can exercise the
 * full flow without a live network.
 */

import { NextResponse } from "next/server";

interface SignatureRequestBody {
  manifestHash: string;
  signature: string;
  signerPublicKey: string;
  signedAt: string;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: "Missing certificate ID." }, { status: 400 });

  // In production: query provenance contract for ManifestSignatureRecord
  // For now return null (not yet signed) to let the UI show the sign button
  return NextResponse.json({ certificateId: id, signature: null });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: "Missing certificate ID." }, { status: 400 });

  let body: SignatureRequestBody;
  try {
    body = (await req.json()) as SignatureRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { manifestHash, signature, signerPublicKey, signedAt } = body;

  if (!manifestHash || !signature || !signerPublicKey || !signedAt) {
    return NextResponse.json(
      { error: "manifestHash, signature, signerPublicKey, and signedAt are required." },
      { status: 400 },
    );
  }

  // Basic format guards
  if (!/^[a-f0-9]{64}$/.test(manifestHash)) {
    return NextResponse.json({ error: "manifestHash must be a 64-char hex SHA-256 digest." }, { status: 400 });
  }
  if (!signerPublicKey.startsWith("G") || signerPublicKey.length < 56) {
    return NextResponse.json({ error: "signerPublicKey must be a Stellar G... address." }, { status: 400 });
  }

  // In production: verify Ed25519 signature then call store_manifest_signature on-chain
  return NextResponse.json({
    success: true,
    certificateId: id,
    manifestHash,
    signerPublicKey,
    storedAt: new Date().toISOString(),
    message: "Signature accepted and will be stored on-chain by the oracle.",
  });
}
