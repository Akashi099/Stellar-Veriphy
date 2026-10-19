import {
  enumField,
  isPlainObject,
  rejectUnknownFields,
  requireObject,
  sha256Field,
  stellarAddressField,
  stringListField,
  textField,
  toValidationResult,
  type FieldError,
  type ModerationTrigger,
  type ValidationResult,
} from "@stellarveriphy/shared";
import type { RegenerationReason } from "@/services/certificateRegenerationService";
import type { DisputeEvidence, DisputeTrigger, EvidenceType } from "@/types/dispute";

// Request validators for API routes, built from the shared field rules in
// packages/shared/validation/fields.ts so wallet addresses, hashes and text
// limits are enforced identically everywhere.

const DISPUTE_TRIGGERS: DisputeTrigger[] = [
  "incorrect_attestation",
  "fraudulent_content",
  "copyright_violation",
  "legal_requirement",
  "creator_request",
  "duplicate_record",
  "identity_fraud",
  "other",
];

const EVIDENCE_TYPES: EvidenceType[] = [
  "hash_mismatch",
  "attestation_invalid",
  "duplicate_content",
  "creator_identity",
  "legal_request",
  "media_manipulation",
  "on_chain_reference",
  "external_reference",
  "other",
];

export interface RaiseDisputeInput {
  certificateId: string;
  contentHash: string;
  trigger: DisputeTrigger;
  summary: string;
  reportedBy?: string;
  evidence: Omit<DisputeEvidence, "id" | "attachedAt" | "attachedBy">[];
}

function evidenceList(input: Record<string, unknown>, errors: FieldError[]): RaiseDisputeInput["evidence"] {
  const raw = input.evidence;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push({ field: "evidence", message: "Must be a list of evidence items." });
    return [];
  }
  return raw.flatMap((item, index) => {
    const path = `evidence.${index}`;
    if (!isPlainObject(item)) {
      errors.push({ field: path, message: "Must be an object." });
      return [];
    }
    rejectUnknownFields(item, ["type", "description", "reference"], errors, path);
    const type = enumField(item, "type", EVIDENCE_TYPES, { path, required: true }, errors);
    const description = textField(item, "description", { path, required: true, maxLength: 1000 }, errors);
    const reference = textField(item, "reference", { path, maxLength: 500, singleLine: true }, errors);
    if (!type || !description) return [];
    return [{ type, description, ...(reference ? { reference } : {}) }];
  });
}

export function validateRaiseDispute(input: unknown): ValidationResult<RaiseDisputeInput> {
  const body = requireObject(input);
  if (!body.ok) return body;
  const value = body.value;
  const errors: FieldError[] = [];

  rejectUnknownFields(value, ["certificateId", "contentHash", "trigger", "summary", "reportedBy", "evidence"], errors);
  const certificateId = textField(value, "certificateId", { required: true, maxLength: 200, singleLine: true }, errors);
  const contentHash = sha256Field(value, "contentHash", { required: true }, errors);
  const trigger = enumField(value, "trigger", DISPUTE_TRIGGERS, { required: true }, errors);
  const summary = textField(value, "summary", { required: true, minLength: 20, maxLength: 1000 }, errors);
  const reportedBy = stellarAddressField(value, "reportedBy", {}, errors);
  const evidence = evidenceList(value, errors);

  return toValidationResult(errors, () => ({
    certificateId: certificateId!,
    contentHash: contentHash!,
    trigger: trigger!,
    summary: summary!,
    ...(reportedBy ? { reportedBy } : {}),
    evidence,
  }));
}

const MODERATION_TRIGGERS: ModerationTrigger[] = [
  "disputed_provenance",
  "suspicious_attestation",
  "creator_dispute",
  "legal_flag",
  "automated_anomaly",
  "manual_escalation",
];

export interface ModerationItemInput {
  assetId: string;
  contentHash: string;
  trigger: ModerationTrigger;
  summary: string;
  reportedBy?: string;
  creatorAddress?: string;
  evidence: string[];
}

export function validateModerationItem(input: unknown): ValidationResult<ModerationItemInput> {
  const body = requireObject(input);
  if (!body.ok) return body;
  const value = body.value;
  const errors: FieldError[] = [];

  rejectUnknownFields(value, ["assetId", "contentHash", "trigger", "summary", "reportedBy", "creatorAddress", "evidence"], errors);
  const assetId = textField(value, "assetId", { required: true, maxLength: 200, singleLine: true }, errors);
  const contentHash = sha256Field(value, "contentHash", { required: true }, errors);
  const trigger = enumField(value, "trigger", MODERATION_TRIGGERS, { required: true }, errors);
  const summary = textField(value, "summary", { required: true, maxLength: 1000 }, errors);
  const reportedBy = textField(value, "reportedBy", { maxLength: 200, singleLine: true }, errors);
  const creatorAddress = stellarAddressField(value, "creatorAddress", {}, errors);
  const evidence = stringListField(value, "evidence", { maxItems: 50, itemMaxLength: 500 }, errors) ?? [];

  return toValidationResult(errors, () => ({
    assetId: assetId!,
    contentHash: contentHash!,
    trigger: trigger!,
    summary: summary!,
    ...(reportedBy ? { reportedBy } : {}),
    ...(creatorAddress ? { creatorAddress } : {}),
    evidence,
  }));
}

const REGENERATION_REASONS: RegenerationReason[] = [
  "metadata_updated",
  "storage_ref_changed",
  "attestation_refresh",
  "creator_key_rotation",
  "correction",
];

export interface RegenerationInput {
  certificateId: string;
  reason: RegenerationReason;
  newManifestHash: string | null;
  newStorageRef: string | null;
  reviewNote: string;
  requesterKey: string;
}

export function validateRegenerationRequest(input: unknown): ValidationResult<RegenerationInput> {
  const body = requireObject(input);
  if (!body.ok) return body;
  const value = body.value;
  const errors: FieldError[] = [];

  const certificateId = textField(value, "certificateId", { required: true, maxLength: 200, singleLine: true }, errors);
  const reason = enumField(value, "reason", REGENERATION_REASONS, { required: true }, errors);
  const requesterKey = stellarAddressField(value, "requesterKey", { required: true }, errors);
  const newManifestHash = sha256Field(value, "newManifestHash", {}, errors);
  const newStorageRef = textField(value, "newStorageRef", { maxLength: 500, singleLine: true }, errors);
  const reviewNote = textField(value, "reviewNote", { maxLength: 1000 }, errors);

  return toValidationResult(errors, () => ({
    certificateId: certificateId!,
    reason: reason!,
    requesterKey: requesterKey!,
    newManifestHash: newManifestHash ?? null,
    newStorageRef: newStorageRef ?? null,
    reviewNote: reviewNote ?? "",
  }));
}
