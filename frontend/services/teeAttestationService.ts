import { auditLogger } from "../lib/security/auditLogger";

export type AttestationVerificationResult = {
  requestId: string;
  contentHash: string;
  manifestHash: string;
  verificationResult: "passed" | "failed" | "inconclusive";
  providerAddress: string;
  teeHash: string;
  signature: string;
  attestedAt: number;
};

export const AttestationError = {
  MalformedDocument: "MalformedDocument",
  InvalidCertificateChain: "InvalidCertificateChain",
  UnauthorizedEnclaveImage: "UnauthorizedEnclaveImage",
  PayloadMismatch: "PayloadMismatch",
  TimestampOutOfRange: "TimestampOutOfRange",
  InvalidSignature: "InvalidSignature",
} as const;

export type AttestationErrorCode = (typeof AttestationError)[keyof typeof AttestationError];

export class AttestationVerificationError extends Error {
  constructor(
    public readonly code: AttestationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AttestationVerificationError";
  }
}

interface AttestationPayload {
  request_id: string;
  content_hash: string;
  manifest_hash: string;
  verification_result: "passed" | "failed" | "inconclusive";
  provider_address: string;
  timestamp: number;
}

interface NitroAttestationDocument {
  pcrs: Record<string, string>;
  certificate: string;
  cabundle: string[];
  public_key: string;
  user_data: string;
  nonce?: string;
  timestamp: number;
}

const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

async function parseCborDocument(raw: Uint8Array): Promise<NitroAttestationDocument> {
  if (raw.length < 10) {
    throw new AttestationVerificationError(
      AttestationError.MalformedDocument,
      "Attestation document too short to be valid CBOR"
    );
  }

  try {
    const text = new TextDecoder().decode(raw);
    const parsed = JSON.parse(text) as NitroAttestationDocument;
    if (!parsed.pcrs || !parsed.certificate || !parsed.public_key) {
      throw new Error("missing required fields");
    }
    return parsed;
  } catch {
    throw new AttestationVerificationError(
      AttestationError.MalformedDocument,
      "Failed to parse attestation document structure"
    );
  }
}

async function verifyCertificateChain(doc: NitroAttestationDocument): Promise<void> {
  if (!doc.cabundle || doc.cabundle.length === 0) {
    throw new AttestationVerificationError(
      AttestationError.InvalidCertificateChain,
      "No certificate chain present in attestation document"
    );
  }

  for (const cert of doc.cabundle) {
    if (!cert || cert.length < 100) {
      throw new AttestationVerificationError(
        AttestationError.InvalidCertificateChain,
        "Certificate chain contains invalid or empty certificate entry"
      );
    }
  }
}

function validatePcr(
  doc: NitroAttestationDocument,
  approvedTeeHashes: string[]
): string {
  const pcr0 = doc.pcrs["0"];
  if (!pcr0) {
    throw new AttestationVerificationError(
      AttestationError.UnauthorizedEnclaveImage,
      "PCR0 (enclave image hash) missing from attestation document"
    );
  }

  const normalized = pcr0.toLowerCase().replace(/\s/g, "");
  const isApproved = approvedTeeHashes.some(
    (h) => h.toLowerCase().replace(/\s/g, "") === normalized
  );

  if (!isApproved) {
    throw new AttestationVerificationError(
      AttestationError.UnauthorizedEnclaveImage,
      `PCR0 value ${pcr0} is not in the approved TEE code hash list`
    );
  }

  return normalized;
}

function extractAndBindPayload(
  doc: NitroAttestationDocument,
  expectedContentHash: string,
  expectedManifestHash: string
): AttestationPayload {
  let payload: AttestationPayload;
  try {
    const decoded = atob(doc.user_data);
    payload = JSON.parse(decoded) as AttestationPayload;
  } catch {
    throw new AttestationVerificationError(
      AttestationError.MalformedDocument,
      "Failed to decode or parse user_data payload from attestation"
    );
  }

  const required = ["request_id", "content_hash", "manifest_hash", "verification_result", "provider_address", "timestamp"];
  for (const field of required) {
    if (!(field in payload)) {
      throw new AttestationVerificationError(
        AttestationError.MalformedDocument,
        `Required payload field missing: ${field}`
      );
    }
  }

  if (payload.content_hash !== expectedContentHash) {
    throw new AttestationVerificationError(
      AttestationError.PayloadMismatch,
      `Attestation content_hash ${payload.content_hash} does not match expected ${expectedContentHash}`
    );
  }

  if (payload.manifest_hash !== expectedManifestHash) {
    throw new AttestationVerificationError(
      AttestationError.PayloadMismatch,
      `Attestation manifest_hash ${payload.manifest_hash} does not match expected ${expectedManifestHash}`
    );
  }

  const now = Date.now();
  const attestationMs = payload.timestamp * 1000;
  if (Math.abs(now - attestationMs) > CLOCK_SKEW_TOLERANCE_MS) {
    throw new AttestationVerificationError(
      AttestationError.TimestampOutOfRange,
      `Attestation timestamp ${payload.timestamp} is outside the ±5 minute acceptance window`
    );
  }

  return payload;
}

async function verifySignature(
  publicKeyHex: string,
  payloadBytes: Uint8Array,
  signatureHex: string
): Promise<void> {
  const toBytes = (hex: string): Uint8Array => {
    const clean = hex.replace(/\s/g, "");
    const arr = new Uint8Array(clean.length / 2);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return arr;
  };

  try {
    const pubKeyBytes = toBytes(publicKeyHex);
    const sigBytes = toBytes(signatureHex);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      pubKeyBytes,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const valid = await crypto.subtle.verify("Ed25519", cryptoKey, sigBytes, payloadBytes);
    if (!valid) {
      throw new AttestationVerificationError(
        AttestationError.InvalidSignature,
        "Ed25519 signature verification failed"
      );
    }
  } catch (err) {
    if (err instanceof AttestationVerificationError) throw err;
    throw new AttestationVerificationError(
      AttestationError.InvalidSignature,
      `Signature verification threw an unexpected error: ${String(err)}`
    );
  }
}

export async function verifyAttestation(params: {
  rawDocument: Uint8Array;
  expectedContentHash: string;
  expectedManifestHash: string;
  approvedTeeHashes: string[];
  providerSignatureHex: string;
}): Promise<AttestationVerificationResult> {
  const {
    rawDocument,
    expectedContentHash,
    expectedManifestHash,
    approvedTeeHashes,
    providerSignatureHex,
  } = params;

  const logFailure = async (code: AttestationErrorCode, message: string): Promise<void> => {
    await auditLogger.logEvent({
      actor: "tee-attestation-service",
      category: "system",
      action: "attestation_failed",
      severity: "critical",
      details: `code=${code} message=${message}`,
    });
  };

  let doc: NitroAttestationDocument;
  try {
    doc = await parseCborDocument(rawDocument);
  } catch (err) {
    const e = err as AttestationVerificationError;
    await logFailure(e.code, e.message);
    throw err;
  }

  try {
    await verifyCertificateChain(doc);
  } catch (err) {
    const e = err as AttestationVerificationError;
    await logFailure(e.code, e.message);
    throw err;
  }

  let teeHash: string;
  try {
    teeHash = validatePcr(doc, approvedTeeHashes);
  } catch (err) {
    const e = err as AttestationVerificationError;
    await logFailure(e.code, e.message);
    throw err;
  }

  let payload: AttestationPayload;
  try {
    payload = extractAndBindPayload(doc, expectedContentHash, expectedManifestHash);
  } catch (err) {
    const e = err as AttestationVerificationError;
    const severity = e.code === AttestationError.TimestampOutOfRange ? "warning" : "critical";
    await auditLogger.logEvent({
      actor: "tee-attestation-service",
      category: "system",
      action: "attestation_failed",
      severity,
      details: `code=${e.code} message=${e.message}`,
    });
    throw err;
  }

  try {
    const payloadBytes = new TextEncoder().encode(
      JSON.stringify({ content_hash: payload.content_hash, manifest_hash: payload.manifest_hash, request_id: payload.request_id })
    );
    await verifySignature(doc.public_key, payloadBytes, providerSignatureHex);
  } catch (err) {
    const e = err as AttestationVerificationError;
    await logFailure(e.code, e.message);
    throw err;
  }

  await auditLogger.logEvent({
    actor: "tee-attestation-service",
    category: "system",
    action: "attestation_verified",
    severity: "info",
    details: `request_id=${payload.request_id} result=${payload.verification_result} provider=${payload.provider_address}`,
  });

  return {
    requestId: payload.request_id,
    contentHash: payload.content_hash,
    manifestHash: payload.manifest_hash,
    verificationResult: payload.verification_result,
    providerAddress: payload.provider_address,
    teeHash,
    signature: providerSignatureHex,
    attestedAt: payload.timestamp,
  };
}
