/**
 * duplicateDetection.ts
 *
 * Fraud detection for duplicate or conflicting provenance certificate minting (#689).
 *
 * DESIGN
 * ------
 * A "duplicate mint" means two or more on-chain certificates reference the
 * same content asset (identified by content hash or manifest hash) but carry
 * different certificate IDs, creators, or attestation proofs.
 *
 * A "conflicting mint" is a stricter condition: the certificates agree on the
 * content but disagree on fields that should be immutable (creator identity,
 * original timestamp, attestation proof hash).
 *
 * DETECTION APPROACH
 * ------------------
 * 1. Index certificates by content hash (from the manifest) and manifest hash.
 * 2. Group certificates that share either hash.
 * 3. For each group with more than one member, classify the relationship:
 *    - EXACT_DUPLICATE   — all fields match; benign (e.g. double-submit).
 *    - SOFT_DUPLICATE    — same content, different certificate ID but same creator.
 *    - CONFLICT          — same content, different creator or attestation proof.
 * 4. Emit a DuplicateAlert for each group above the threshold.
 *
 * TESTABILITY
 * -----------
 * All detection logic is in pure functions. The module exports individual
 * steps so unit tests can exercise each stage independently.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DuplicateClassification =
  | "EXACT_DUPLICATE"   // Same content, same creator, same attestation — benign double-submit
  | "SOFT_DUPLICATE"    // Same content hash, same creator, different cert ID — needs review
  | "CONFLICT"          // Same content hash, different creator or attestation — high risk
  | "UNKNOWN";

export type AlertSeverity = "info" | "warning" | "critical";

export interface CertificateRecord {
  certificateId: string;
  contentHash: string;
  manifestHash: string;
  creator: string;
  attestationHash: string;
  timestamp: number;
  storageRef: string;
}

export interface DuplicateGroup {
  /** The content hash or manifest hash that links these certificates. */
  sharedKey: string;
  keyType: "contentHash" | "manifestHash";
  certificates: CertificateRecord[];
  classification: DuplicateClassification;
}

export interface DuplicateAlert {
  id: string;
  group: DuplicateGroup;
  severity: AlertSeverity;
  /** Human-readable explanation for governance review. */
  description: string;
  /** The certificate IDs involved in the conflict. */
  involvedCertificateIds: string[];
  /** Whether this conflict should block new mints for the same content. */
  blockNewMints: boolean;
  detectedAt: string;
}

export interface DuplicateScanResult {
  scannedCount: number;
  duplicateGroupCount: number;
  alerts: DuplicateAlert[];
  highRiskCount: number;
  scannedAt: string;
}

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

/**
 * Classifies the relationship between a group of certificates that share a
 * common content hash or manifest hash.
 */
export function classifyGroup(group: CertificateRecord[]): DuplicateClassification {
  if (group.length <= 1) return "UNKNOWN";

  const firstCert = group[0];
  if (!firstCert) return "UNKNOWN";

  const allSameCreator = group.every((c) => c.creator === firstCert.creator);
  const allSameAttestation = group.every((c) => c.attestationHash === firstCert.attestationHash);
  const allSameContentHash = group.every((c) => c.contentHash === firstCert.contentHash);
  const allSameManifestHash = group.every((c) => c.manifestHash === firstCert.manifestHash);

  // Exact duplicate: everything matches (benign double-submit)
  if (
    allSameCreator &&
    allSameAttestation &&
    allSameContentHash &&
    allSameManifestHash
  ) {
    return "EXACT_DUPLICATE";
  }

  // Conflicting: different creator or different attestation on same content
  if (!allSameCreator || !allSameAttestation) {
    return "CONFLICT";
  }

  // Soft duplicate: same creator and attestation, same content, different cert IDs
  return "SOFT_DUPLICATE";
}

/**
 * Maps a DuplicateClassification to an alert severity.
 */
export function classificationToSeverity(
  classification: DuplicateClassification
): AlertSeverity {
  switch (classification) {
    case "EXACT_DUPLICATE":
      return "info";
    case "SOFT_DUPLICATE":
      return "warning";
    case "CONFLICT":
      return "critical";
    default:
      return "warning";
  }
}

/**
 * Generates a human-readable description for a duplicate group.
 */
export function buildAlertDescription(group: DuplicateGroup): string {
  const ids = group.certificates.map((c) => c.certificateId).join(", ");
  switch (group.classification) {
    case "EXACT_DUPLICATE":
      return (
        `${group.certificates.length} certificates share identical content, creator, and ` +
        `attestation (${ids}). This is likely a benign double-submit. ` +
        "No immediate action is required, but the duplicate record should be noted."
      );
    case "SOFT_DUPLICATE":
      return (
        `${group.certificates.length} certificates share the same content and creator but ` +
        `have different certificate IDs (${ids}). This may indicate a retry after a network ` +
        "error. Verify whether one of these should be revoked."
      );
    case "CONFLICT":
      return (
        `${group.certificates.length} certificates share the same content hash but have ` +
        `conflicting creator identities or attestation proofs (${ids}). ` +
        "This is a high-risk integrity signal. Do not accept new mints for this content until " +
        "a governance review has resolved the conflict."
      );
    default:
      return `Unclassified duplicate group involving certificates: ${ids}.`;
  }
}

// ---------------------------------------------------------------------------
// Indexing and grouping
// ---------------------------------------------------------------------------

/**
 * Groups an array of certificates by content hash and manifest hash,
 * returning only groups that contain more than one certificate.
 */
export function groupDuplicates(
  certificates: CertificateRecord[]
): DuplicateGroup[] {
  const byContentHash = new Map<string, CertificateRecord[]>();
  const byManifestHash = new Map<string, CertificateRecord[]>();

  for (const cert of certificates) {
    if (!byContentHash.has(cert.contentHash)) {
      byContentHash.set(cert.contentHash, []);
    }
    byContentHash.get(cert.contentHash)!.push(cert);

    if (!byManifestHash.has(cert.manifestHash)) {
      byManifestHash.set(cert.manifestHash, []);
    }
    byManifestHash.get(cert.manifestHash)!.push(cert);
  }

  const groups: DuplicateGroup[] = [];

  for (const [contentHash, certs] of byContentHash.entries()) {
    if (certs.length > 1) {
      const classification = classifyGroup(certs);
      groups.push({
        sharedKey: contentHash,
        keyType: "contentHash",
        certificates: certs,
        classification,
      });
    }
  }

  for (const [manifestHash, certs] of byManifestHash.entries()) {
    if (certs.length > 1) {
      // Only add if not already captured by content hash grouping
      const alreadyCaptured = groups.some((g) =>
        g.certificates.every((c) => certs.some((mc) => mc.certificateId === c.certificateId))
      );
      if (!alreadyCaptured) {
        const classification = classifyGroup(certs);
        groups.push({
          sharedKey: manifestHash,
          keyType: "manifestHash",
          certificates: certs,
          classification,
        });
      }
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Alert generation
// ---------------------------------------------------------------------------

function generateAlertId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `dup-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `dup-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Converts a duplicate group into a DuplicateAlert.
 */
export function buildAlert(group: DuplicateGroup): DuplicateAlert {
  const severity = classificationToSeverity(group.classification);
  return {
    id: generateAlertId(),
    group,
    severity,
    description: buildAlertDescription(group),
    involvedCertificateIds: group.certificates.map((c) => c.certificateId),
    blockNewMints: group.classification === "CONFLICT",
    detectedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main scan entry point
// ---------------------------------------------------------------------------

/**
 * Scans a set of certificate records for duplicates and conflicts.
 *
 * Returns a DuplicateScanResult containing all alerts sorted by severity
 * (CONFLICT first, then SOFT_DUPLICATE, then EXACT_DUPLICATE).
 *
 * In production, `certificates` is sourced from a Soroban event indexer
 * (`packages/shared/indexing/sorobanEventIndexer.ts`) that tracks all
 * `certificate_minted` events from `contracts/provenance`.
 */
export function scanForDuplicates(
  certificates: CertificateRecord[]
): DuplicateScanResult {
  const scannedAt = new Date().toISOString();
  const groups = groupDuplicates(certificates);
  const alerts = groups.map((g) => buildAlert(g));

  const severityOrder: Record<AlertSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  const sortedAlerts = alerts.sort(
    (a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99)
  );

  return {
    scannedCount: certificates.length,
    duplicateGroupCount: groups.length,
    alerts: sortedAlerts,
    highRiskCount: sortedAlerts.filter((a) => a.severity === "critical").length,
    scannedAt,
  };
}

// ---------------------------------------------------------------------------
// New-mint gate
// ---------------------------------------------------------------------------

/**
 * Checks whether a new mint for the given content hash and manifest hash
 * is blocked due to an existing unresolved CONFLICT alert.
 *
 * Call this before invoking `provenance.mint_certificate` to prevent
 * new conflicting records from being added.
 *
 * Returns `{ blocked: false }` if the mint is clear to proceed, or
 * `{ blocked: true, reason }` if an existing conflict must be resolved first.
 */
export function checkMintGate(
  contentHash: string,
  manifestHash: string,
  existingAlerts: DuplicateAlert[]
): { blocked: boolean; reason?: string } {
  const blockingAlert = existingAlerts.find(
    (alert) =>
      alert.blockNewMints &&
      (alert.group.certificates.some(
        (c) => c.contentHash === contentHash || c.manifestHash === manifestHash
      ))
  );

  if (blockingAlert) {
    return {
      blocked: true,
      reason:
        `A conflict alert (${blockingAlert.id}) is active for this content. ` +
        "New mints are blocked until the conflict is resolved by a governance review. " +
        `Involved certificates: ${blockingAlert.involvedCertificateIds.join(", ")}.`,
    };
  }

  return { blocked: false };
}
