import type { ContentManifest, VerificationRecord } from "../types";

/**
 * Verification confidence score (0–100).
 *
 * The score is the sum of the weights of the checks that pass. Metadata
 * completeness is partial credit: each standard manifest field present earns
 * an equal share of its weight. UI copy and docs/user-guide.md are generated
 * from / must match CONFIDENCE_FACTORS, so change them together.
 */

export type ConfidenceFactorKey =
  | "attestation"
  | "teeCodeHash"
  | "contentHash"
  | "creatorSignature"
  | "metadata";

export interface ConfidenceFactor {
  key: ConfidenceFactorKey;
  label: string;
  weight: number;
  description: string; // plain-language explanation for non-technical readers
}

export const CONFIDENCE_FACTORS: readonly ConfidenceFactor[] = [
  {
    key: "attestation",
    label: "Secure check completed",
    weight: 35,
    description: "A tamper-proof secure enclave checked the file and signed a proof that the check ran correctly.",
  },
  {
    key: "teeCodeHash",
    label: "Approved verifier",
    weight: 25,
    description: "The code that ran the check is on the on-chain list of approved verifiers.",
  },
  {
    key: "contentHash",
    label: "File unchanged",
    weight: 20,
    description: "The file's fingerprint matches the one the creator recorded, so it has not been altered.",
  },
  {
    key: "creatorSignature",
    label: "Creator signed",
    weight: 10,
    description: "The creator approved the submission with their Stellar account.",
  },
  {
    key: "metadata",
    label: "Origin details provided",
    weight: 10,
    description: "How much origin information (device, location, AI model used) the creator supplied.",
  },
] as const;

export const STANDARD_METADATA_FIELDS = ["device", "location", "aiModel"] as const;

export type ConfidenceLevel = "high" | "medium" | "low";

export const CONFIDENCE_LEVELS: readonly { level: ConfidenceLevel; label: string; min: number; description: string }[] = [
  { level: "high", label: "High", min: 85, description: "All key checks passed." },
  { level: "medium", label: "Medium", min: 50, description: "Most checks passed, but at least one failed or evidence is missing." },
  { level: "low", label: "Low", min: 0, description: "Important checks failed or have not run yet." },
];

export interface ConfidenceBreakdownItem extends ConfidenceFactor {
  earned: number;
}

export interface ConfidenceResult {
  score: number;
  level: ConfidenceLevel;
  breakdown: ConfidenceBreakdownItem[];
}

export function metadataCompleteness(manifest: ContentManifest): number {
  const present = STANDARD_METADATA_FIELDS.filter((f) => manifest.metadata?.[f]?.trim()).length;
  return present / STANDARD_METADATA_FIELDS.length;
}

export function confidenceLevel(score: number): ConfidenceLevel {
  return CONFIDENCE_LEVELS.find((l) => score >= l.min)!.level;
}

export function computeConfidence(record: Pick<VerificationRecord, "manifest" | "evidence">): ConfidenceResult {
  const ev = record.evidence;
  const ratios: Record<ConfidenceFactorKey, number> = {
    attestation: ev?.attestationValid ? 1 : 0,
    teeCodeHash: ev?.teeCodeHashApproved ? 1 : 0,
    contentHash: ev?.contentHashMatches ? 1 : 0,
    creatorSignature: ev?.creatorSigned ? 1 : 0,
    metadata: metadataCompleteness(record.manifest),
  };
  const breakdown = CONFIDENCE_FACTORS.map((f) => ({ ...f, earned: Math.round(f.weight * ratios[f.key]) }));
  const score = breakdown.reduce((sum, f) => sum + f.earned, 0);
  return { score, level: confidenceLevel(score), breakdown };
}
