/**
 * certificateVerificationService.ts
 *
 * Service layer for certificate verification operations.
 * Provides methods to look up, verify, and inspect certificates on-chain.
 *
 * Architecture
 * ------------
 *  This service abstracts Soroban contract calls behind a clean API so that
 *  UI components never interact with contract ABI details directly.
 *
 *  In production each method would use a SorobanClient to invoke the
 *  Provenance contract.  For now the service uses mock data that mirrors
 *  real contract responses so the UI can be fully exercised without a
 *  live deployment.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { AttestationEvidence, ContentManifest } from "@stellarveriphy/shared/types";
import type { ProvenanceAnchor } from "@stellarveriphy/shared/types";

export type CertificateLookupMethod = "id" | "code" | "creator";

export interface CertificateLookupRequest {
  method: CertificateLookupMethod;
  value: string;
}

export interface CertificateDetails {
  id: string;
  storageRef: string;
  manifestHash: string;
  attestationHash: string;
  creator: string;
  timestamp: number;
  /** Derived status label, populated by search/list endpoints. */
  statusLabel?: string;
  /** Derived verification level, populated by search/list endpoints. */
  verificationLevel?: string;
}

export interface CertificateVerificationResult {
  certificate: CertificateDetails;
  /** Whether the certificate is currently valid (not revoked & not expired). */
  isValid: boolean;
  /** Whether the certificate has been revoked. */
  isRevoked: boolean;
  /** Whether the certificate has expired. */
  isExpired: boolean;
  /** Verification level badge (basic / standard / premium / enterprise). */
  verificationLevel: string;
  /** Human-readable status summary. */
  statusLabel: string;
  /** Current owner address. */
  owner: string;
  /** Display name if metadata is set. */
  displayName?: string;
  /** Description if metadata is set. */
  description?: string;
  /** Whether the certificate is immutably locked. */
  isLocked: boolean;
  /**
   * Attestation evidence produced by the TEE oracle.
   * Present once the oracle has run; null while pending or when the
   * certificate was minted before evidence tracking was added.
   */
  evidence: AttestationEvidence | null;
  /**
   * Content manifest associated with this certificate.
   * Present once the oracle has fetched and decoded it.
   */
  manifest: ContentManifest | null;
  /**
   * Supplemental provenance anchors attached after minting.
   * Empty array for certificates with no additional anchors.
   */
  anchors: ProvenanceAnchor[];
}

export interface CertificateSearchFilters {
  creator?: string | undefined;
  verificationLevel?: string | undefined;
  /** Filter by derived status label (Active / Revoked / Expired / Locked). */
  status?: string | undefined;
  contentType?: string | undefined;
  startTime?: number | undefined;
  endTime?: number | undefined;
  offset?: number;
  limit?: number;
}

export interface CertificateSearchResult {
  certificates: CertificateDetails[];
  total: number;
  offset: number;
  limit: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const MOCK_CERTIFICATES: Map<string, CertificateDetails> = new Map();

function seedMockData(): void {
  const now = Math.floor(Date.now() / 1000);
  const entries: CertificateDetails[] = [
    {
      id: "1",
      storageRef: "ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
      manifestHash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
      attestationHash: "f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4",
      creator: "GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNSOLXAUJVLVWXVVNQNYWGLZ",
      timestamp: now - 86400 * 3,
    },
    {
      id: "2",
      storageRef: "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
      manifestHash: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      attestationHash: "e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3",
      creator: "GDRXE2BQUC3AZNPVFSCEZ76DV3LW64R3Q5JMB6G3ZP4U7OV6GCFYXFGH",
      timestamp: now - 86400 * 7,
    },
    {
      id: "3",
      storageRef: "ipfs://QmZ4tDucesT1LJm6xT4tQgQyLNRmB6ZxYxpRHYqJqqYpZY",
      manifestHash: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
      attestationHash: "d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2",
      creator: "GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNSOLXAUJVLVWXVVNQNYWGLZ",
      timestamp: now - 86400 * 30,
    },
  ];

  entries.forEach((cert) => {
    MOCK_CERTIFICATES.set(cert.id, cert);
  });
}

seedMockData();

const VERIFICATION_CODES: Map<string, string> = new Map([
  ["ABC12345", "1"],
  ["DEF67890", "2"],
  ["GHI11111", "3"],
]);

const NOW = Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------------
// Helper: simulate contract call delay
// ---------------------------------------------------------------------------

function delay(ms = 600): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildVerificationResult(
  cert: CertificateDetails,
  id: string
): CertificateVerificationResult {
  const isRevoked = false;
  const expiresAt = cert.timestamp + 86400 * 365;
  const isExpired = NOW > expiresAt;
  const isLocked = false;

  const hasAttestation = Boolean(cert.attestationHash && cert.manifestHash && cert.storageRef);
  const verificationLevel = hasAttestation ? "Standard" : "Basic";

  let statusLabel: string;
  if (isRevoked) {
    statusLabel = "Revoked";
  } else if (isExpired) {
    statusLabel = "Expired";
  } else if (isLocked) {
    statusLabel = "Locked";
  } else {
    statusLabel = "Active";
  }

  // Build representative mock evidence so the confidence panel renders
  // with real signal data. In production this comes from the TEE oracle
  // response stored alongside the certificate.
  const evidence: AttestationEvidence = {
    enclave: "AWS Nitro Enclave",
    attestationHash: cert.attestationHash,
    attestationValid: hasAttestation,
    teeCodeHash: cert.attestationHash.slice(0, 64),
    teeCodeHashApproved: hasAttestation,
    contentHashMatches: hasAttestation,
    creatorSigned: true,
  };

  // Build a minimal mock manifest so metadata completeness can be scored.
  const manifest: ContentManifest = {
    contentHash: cert.manifestHash,
    creator: cert.creator,
    timestamp: new Date(cert.timestamp * 1000).toISOString(),
    metadata: {
      device: "Camera Model X",
      location: "48.8566,2.3522",
      aiModel: undefined,
    },
  };

  return {
    certificate: { ...cert, id },
    isValid: !isRevoked && !isExpired,
    isRevoked,
    isExpired,
    verificationLevel,
    statusLabel,
    owner: cert.creator,
    isLocked,
    evidence,
    manifest,
    // Mock a representative set of supplemental anchors so the UI renders
    // with real data. In production these come from provenance.get_anchors().
    anchors: hasAttestation
      ? [
          {
            anchorType: "Arweave" as const,
            reference: "ar://" + cert.attestationHash.slice(0, 43),
            description: "Permanent Arweave archive of the original media file.",
            anchoredAt: cert.timestamp + 3600,
          },
          {
            anchorType: "Ipfs" as const,
            reference: cert.storageRef.startsWith("ipfs://")
              ? cert.storageRef.replace("ipfs://", "")
              : cert.storageRef,
            description: "IPFS content-addressed reference for decentralised retrieval.",
            anchoredAt: cert.timestamp + 60,
          },
        ]
      : [],
  };
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Look up a certificate by its on-chain ID.
 */
export async function getCertificateById(
  id: string
): Promise<ApiResponse<CertificateVerificationResult>> {
  try {
    await delay();

    const cert = MOCK_CERTIFICATES.get(id);
    if (!cert) {
      return {
        success: false,
        error: "Certificate #".concat(id, " not found"),
      };
    }

    return {
      success: true,
      data: buildVerificationResult(cert, id),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch certificate",
    };
  }
}

/**
 * Look up a certificate using its 8-character verification code.
 */
export async function getCertificateByCode(
  code: string
): Promise<ApiResponse<CertificateVerificationResult>> {
  try {
    await delay();

    const certId = VERIFICATION_CODES.get(code.toUpperCase());
    if (!certId) {
      return {
        success: false,
        error: 'No certificate found for code "'.concat(code, '"'),
      };
    }

    const cert = MOCK_CERTIFICATES.get(certId);
    if (!cert) {
      return {
        success: false,
        error: "Certificate data not found",
      };
    }

    return {
      success: true,
      data: buildVerificationResult(cert, certId),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to verify code",
    };
  }
}

/**
 * Look up all certificates created by a given Stellar address.
 */
export async function getCertificatesByCreator(
  creator: string,
  offset = 0,
  limit = 10
): Promise<ApiResponse<CertificateSearchResult>> {
  try {
    await delay();

    const allCerts = Array.from(MOCK_CERTIFICATES.entries())
      .filter(([key, cert]) => !key.startsWith("code-") && cert.creator === creator)
      .map(([id, cert]) => ({ ...cert, id }));

    const total = allCerts.length;
    const sliced = allCerts.slice(offset, offset + limit);

    return {
      success: true,
      data: {
        certificates: sliced,
        total,
        offset,
        limit,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to search certificates",
    };
  }
}

/**
 * Search certificates with optional filters (time range, verification level, etc.)
 */
export async function searchCertificates(
  filters: CertificateSearchFilters
): Promise<ApiResponse<CertificateSearchResult>> {
  try {
    await delay(800);

    let allCerts = Array.from(MOCK_CERTIFICATES.entries())
      .filter(([key]) => !key.startsWith("code-"))
      .map(([id, cert]) => ({ ...cert, id }));

    if (filters.creator) {
      allCerts = allCerts.filter((c) => c.creator === filters.creator);
    }
    if (filters.startTime) {
      allCerts = allCerts.filter((c) => c.timestamp >= filters.startTime!);
    }
    if (filters.endTime) {
      allCerts = allCerts.filter((c) => c.timestamp <= filters.endTime!);
    }
    if (filters.verificationLevel) {
      allCerts = allCerts.filter(
        (c) => buildVerificationResult(c, c.id).verificationLevel === filters.verificationLevel
      );
    }
    if (filters.status) {
      allCerts = allCerts.filter(
        (c) => buildVerificationResult(c, c.id).statusLabel === filters.status
      );
    }

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 10;
    const total = allCerts.length;
    const sliced = allCerts.slice(offset, offset + limit).map((c) => {
      const derived = buildVerificationResult(c, c.id);
      return {
        ...c,
        statusLabel: derived.statusLabel,
        verificationLevel: derived.verificationLevel,
      };
    });

    return {
      success: true,
      data: {
        certificates: sliced,
        total,
        offset,
        limit,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to search certificates",
    };
  }
}

/**
 * Verify the authenticity of a certificate by checking its cryptographic proofs.
 */
export async function verifyCertificateAuthenticity(certificateId: string): Promise<
  ApiResponse<{
    authentic: boolean;
    hashMatch: boolean;
    signatureValid: boolean;
    details: string[];
  }>
> {
  try {
    await delay(1000);

    const cert = MOCK_CERTIFICATES.get(certificateId);
    if (!cert) {
      return {
        success: false,
        error: "Certificate not found",
      };
    }

    const details: string[] = [
      "On-chain certificate record exists and is valid",
      "Manifest hash matches stored reference",
      "Attestation hash is consistent with TEE output",
      "Certificate timestamp is within valid range",
    ];

    return {
      success: true,
      data: {
        authentic: true,
        hashMatch: true,
        signatureValid: true,
        details,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Verification failed",
    };
  }
}

/**
 * Generate a verification code for a certificate (mirrors #182 on-chain logic).
 */
export async function generateVerificationCode(
  certificateId: string
): Promise<ApiResponse<string>> {
  try {
    await delay(500);
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * 36)];
    }
    VERIFICATION_CODES.set(code, certificateId);
    return { success: true, data: code };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate code",
    };
  }
}
