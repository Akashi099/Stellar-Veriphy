/**
 * snapshotDiff.ts
 *
 * Utilities for computing structured diffs between two provenance snapshots
 * (manifest hashes, metadata, attestation data, actor info, etc.).
 *
 * Used by the audit diff view to highlight what changed, when, and who made
 * the change so operators can use it for incident response or dispute resolution.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiffChangeType = "added" | "removed" | "modified" | "unchanged";

export interface DiffField {
  field: string;
  label: string;
  changeType: DiffChangeType;
  oldValue?: string | number | boolean | null;
  newValue?: string | number | boolean | null;
  /** Human-readable explanation of what this change means for audit purposes */
  explanation?: string;
}

export interface SnapshotRecord {
  id: string;
  certificateId: string;
  manifestHash: string;
  attestationHash: string;
  storageRef: string;
  creator: string;
  actor: string; // who introduced this snapshot
  timestamp: number;
  verificationLevel?: string;
  revoked?: boolean;
  revocationReason?: string;
  expiresAt?: number | null;
  metadata?: Record<string, string | undefined>;
  tags?: string[];
}

export interface SnapshotDiffResult {
  certificateId: string;
  snapshotA: SnapshotRecord;
  snapshotB: SnapshotRecord;
  fields: DiffField[];
  hasChanges: boolean;
  /** Actor who introduced the newer snapshot (snapshotB) */
  changedBy: string;
  changedAt: number;
  /** True if any security-critical field (manifest, attestation) changed */
  hasSecurityChanges: boolean;
  /** True if chain-of-custody fields changed (creator, owner, revocation) */
  hasCustodyChanges: boolean;
}

// ---------------------------------------------------------------------------
// Field metadata for labeling and explanation
// ---------------------------------------------------------------------------

const FIELD_META: Record<
  string,
  { label: string; getExplanation?: (a: unknown, b: unknown) => string }
> = {
  manifestHash: {
    label: "Manifest hash",
    getExplanation: () =>
      "The manifest hash changed, indicating the underlying content metadata was updated or replaced.",
  },
  attestationHash: {
    label: "Attestation hash",
    getExplanation: () =>
      "The attestation hash changed. This may indicate re-verification by a TEE oracle.",
  },
  storageRef: {
    label: "Storage reference",
    getExplanation: () =>
      "The storage reference changed, pointing to a different IPFS CID or Arweave URI.",
  },
  creator: {
    label: "Creator",
    getExplanation: () => "The creator address changed, which is unusual after minting.",
  },
  actor: {
    label: "Actor / operator",
    getExplanation: (a, b) =>
      `This snapshot was introduced by a different actor (${String(b)}) than the previous one (${String(a)}).`,
  },
  verificationLevel: {
    label: "Verification level",
    getExplanation: (a, b) => `Verification level upgraded from ${String(a)} to ${String(b)}.`,
  },
  revoked: {
    label: "Revocation status",
    getExplanation: (_a, b) =>
      b ? "Certificate was revoked in this snapshot." : "Revocation was cleared in this snapshot.",
  },
  revocationReason: {
    label: "Revocation reason",
    getExplanation: (_a, b) => `Revocation reason set to: ${String(b)}.`,
  },
  expiresAt: {
    label: "Expiration",
    getExplanation: (_a, b) =>
      b == null
        ? "Expiration was removed from this certificate."
        : `Expiration set to ${new Date(Number(b) * 1000).toISOString()}.`,
  },
  tags: {
    label: "Tags",
    getExplanation: () => "One or more classification tags were added or removed.",
  },
};

// ---------------------------------------------------------------------------
// Core diff function
// ---------------------------------------------------------------------------

function stringifyValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function compareField(
  field: string,
  oldVal: unknown,
  newVal: unknown,
): DiffField | null {
  const meta = FIELD_META[field];
  const label = meta?.label ?? field;

  const oldStr = stringifyValue(oldVal);
  const newStr = stringifyValue(newVal);

  if (oldStr === newStr) return null; // no change — omit from diff output

  let changeType: DiffChangeType = "modified";
  if (oldStr === "" && newStr !== "") changeType = "added";
  if (oldStr !== "" && newStr === "") changeType = "removed";

  const explanation = meta?.getExplanation?.(oldVal, newVal);

  return {
    field,
    label,
    changeType,
    oldValue: oldStr || null,
    newValue: newStr || null,
    explanation,
  };
}

/**
 * Compute a structured diff between two provenance snapshots.
 *
 * @param snapshotA  The earlier (baseline) snapshot.
 * @param snapshotB  The later snapshot to compare against.
 * @returns A `SnapshotDiffResult` with per-field changes and audit metadata.
 */
export function computeSnapshotDiff(
  snapshotA: SnapshotRecord,
  snapshotB: SnapshotRecord,
): SnapshotDiffResult {
  const COMPARED_FIELDS: (keyof SnapshotRecord)[] = [
    "manifestHash",
    "attestationHash",
    "storageRef",
    "creator",
    "actor",
    "verificationLevel",
    "revoked",
    "revocationReason",
    "expiresAt",
    "tags",
  ];

  const fields: DiffField[] = [];

  for (const field of COMPARED_FIELDS) {
    const diff = compareField(field, snapshotA[field], snapshotB[field]);
    if (diff) fields.push(diff);
  }

  // Metadata sub-object diff
  const metaA = snapshotA.metadata ?? {};
  const metaB = snapshotB.metadata ?? {};
  const allMetaKeys = new Set([...Object.keys(metaA), ...Object.keys(metaB)]);
  for (const key of allMetaKeys) {
    const diff = compareField(`metadata.${key}`, metaA[key], metaB[key]);
    if (diff) {
      fields.push({ ...diff, label: `Metadata: ${key}` });
    }
  }

  const securityFields = new Set(["manifestHash", "attestationHash"]);
  const custodyFields = new Set(["creator", "revoked", "revocationReason"]);

  const hasSecurityChanges = fields.some((f) => securityFields.has(f.field));
  const hasCustodyChanges = fields.some((f) => custodyFields.has(f.field));

  return {
    certificateId: snapshotB.certificateId,
    snapshotA,
    snapshotB,
    fields,
    hasChanges: fields.length > 0,
    changedBy: snapshotB.actor,
    changedAt: snapshotB.timestamp,
    hasSecurityChanges,
    hasCustodyChanges,
  };
}

/**
 * Given an ordered list of snapshots (oldest first), compute a diff for every
 * adjacent pair. Useful for rendering a complete audit trail.
 */
export function computeSnapshotHistory(
  snapshots: SnapshotRecord[],
): SnapshotDiffResult[] {
  if (snapshots.length < 2) return [];
  const results: SnapshotDiffResult[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    results.push(computeSnapshotDiff(snapshots[i - 1], snapshots[i]));
  }
  return results;
}
