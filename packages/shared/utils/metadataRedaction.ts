/**
 * metadataRedaction.ts
 *
 * Controlled redaction model for sensitive manifest metadata.
 *
 * Allows specific metadata fields to be hidden or partially released while
 * preserving the manifest hash integrity (proof-of-content still verifiable).
 * The redaction policy is stored alongside the manifest and is auditable.
 *
 * Design goals:
 * - Proof integrity: the original manifestHash remains valid for verification
 *   even after metadata fields are redacted from the displayed record.
 * - Visibility control: each field has an explicit visibility policy.
 * - Audit trail: the redaction decision is logged with actor and timestamp.
 */

import type { ContentManifest } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FieldVisibility = "public" | "redacted" | "partial";

export interface FieldRedactionPolicy {
  field: string;
  visibility: FieldVisibility;
  /** For "partial" visibility: a replacement display value (e.g. "location withheld") */
  partialReplacement?: string;
  /** Reason for redacting this field (shown to governance reviewers) */
  reason?: string;
}

export interface RedactionPolicy {
  id: string;
  certificateId: string;
  /** Stellar public key of the creator who applied this policy */
  appliedBy: string;
  appliedAt: string; // ISO 8601
  fields: FieldRedactionPolicy[];
  /** Whether the redaction was approved by a governance reviewer */
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

export interface RedactedManifest {
  /** The original manifest hash — unchanged, still verifiable on-chain */
  originalManifestHash: string;
  /** The manifest with redacted fields replaced or removed */
  displayManifest: Partial<ContentManifest> & { creator: string; timestamp: string; contentHash: string };
  /** Which fields were redacted and why */
  redactedFields: FieldRedactionPolicy[];
  /** Whether any fields have been redacted */
  hasRedactions: boolean;
  /** Policy that produced this redacted view */
  policyId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fields that may never be fully redacted because they are required for on-chain verification */
export const IMMUTABLE_FIELDS: (keyof ContentManifest)[] = [
  "contentHash",
  "creator",
  "timestamp",
];

/** Fields available for redaction (creator-controlled privacy) */
export const REDACTABLE_FIELDS: string[] = [
  "metadata.device",
  "metadata.location",
  "metadata.aiModel",
  "media.fileName",
  "media.fileType",
  "media.fileSizeBytes",
  "schemaVersion",
];

const REDACTION_PLACEHOLDER = "[REDACTED]";

// ---------------------------------------------------------------------------
// Core redaction function
// ---------------------------------------------------------------------------

/**
 * Apply a `RedactionPolicy` to a `ContentManifest` and produce a
 * `RedactedManifest` that is safe to display publicly.
 *
 * The `originalManifestHash` in the result is the hash of the *original*
 * (unredacted) manifest so on-chain verification is unaffected.
 *
 * @throws If an attempt is made to redact an immutable field (contentHash,
 *         creator, timestamp).
 */
export function applyRedactionPolicy(
  manifest: ContentManifest,
  policy: RedactionPolicy,
  originalManifestHash: string,
): RedactedManifest {
  // Guard: prevent redacting immutable fields
  for (const f of policy.fields) {
    if (IMMUTABLE_FIELDS.includes(f.field as keyof ContentManifest)) {
      throw new Error(
        `Cannot redact immutable field "${f.field}". This field is required for on-chain verification.`,
      );
    }
  }

  // Deep-clone the manifest to avoid mutation
  const display = JSON.parse(JSON.stringify(manifest)) as ContentManifest & Record<string, unknown>;

  const redactedFields: FieldRedactionPolicy[] = [];

  for (const fieldPolicy of policy.fields) {
    if (fieldPolicy.visibility === "public") continue;

    const { field, visibility, partialReplacement } = fieldPolicy;
    redactedFields.push(fieldPolicy);

    // Support dot-notation for nested fields (e.g. "metadata.location")
    const parts = field.split(".");
    if (parts.length === 2) {
      const [parent, child] = parts;
      const parentObj = display[parent] as Record<string, unknown> | undefined;
      if (parentObj && child in parentObj) {
        if (visibility === "redacted") {
          delete parentObj[child];
        } else if (visibility === "partial") {
          parentObj[child] = partialReplacement ?? REDACTION_PLACEHOLDER;
        }
      }
    } else {
      // Top-level field
      if (field in display) {
        if (visibility === "redacted") {
          delete display[field];
        } else if (visibility === "partial") {
          (display as Record<string, unknown>)[field] =
            partialReplacement ?? REDACTION_PLACEHOLDER;
        }
      }
    }
  }

  return {
    originalManifestHash,
    displayManifest: display as RedactedManifest["displayManifest"],
    redactedFields,
    hasRedactions: redactedFields.length > 0,
    policyId: policy.id,
  };
}

// ---------------------------------------------------------------------------
// Policy builder helpers
// ---------------------------------------------------------------------------

/**
 * Create a default "all public" policy with no redactions.
 * Use as a starting point before selectively marking fields as redacted.
 */
export function createDefaultPolicy(
  certificateId: string,
  appliedBy: string,
): RedactionPolicy {
  return {
    id: `policy-${certificateId}-${Date.now()}`,
    certificateId,
    appliedBy,
    appliedAt: new Date().toISOString(),
    fields: REDACTABLE_FIELDS.map((field) => ({
      field,
      visibility: "public" as FieldVisibility,
    })),
    approved: false,
  };
}

/**
 * Update a single field's visibility in an existing policy (immutable — returns
 * a new policy object).
 */
export function updateFieldVisibility(
  policy: RedactionPolicy,
  field: string,
  visibility: FieldVisibility,
  options?: { reason?: string; partialReplacement?: string },
): RedactionPolicy {
  if (IMMUTABLE_FIELDS.includes(field as keyof ContentManifest)) {
    throw new Error(`Cannot change visibility of immutable field "${field}".`);
  }

  const updatedFields = policy.fields.map((f) =>
    f.field === field
      ? {
          ...f,
          visibility,
          reason: options?.reason ?? f.reason,
          partialReplacement: options?.partialReplacement ?? f.partialReplacement,
        }
      : f,
  );

  // Add the field if it wasn't in the policy yet
  const existing = policy.fields.find((f) => f.field === field);
  if (!existing) {
    updatedFields.push({
      field,
      visibility,
      reason: options?.reason,
      partialReplacement: options?.partialReplacement,
    });
  }

  return { ...policy, fields: updatedFields };
}

// ---------------------------------------------------------------------------
// Visibility summary helpers
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable summary of what is public vs. private in a
 * `RedactedManifest`, suitable for display in the UI.
 */
export function buildVisibilitySummary(redacted: RedactedManifest): {
  publicFields: string[];
  redactedFields: string[];
  partialFields: string[];
} {
  const publicFields: string[] = [];
  const redactedFields: string[] = [];
  const partialFields: string[] = [];

  for (const f of redacted.redactedFields) {
    switch (f.visibility) {
      case "public":
        publicFields.push(f.field);
        break;
      case "redacted":
        redactedFields.push(f.field);
        break;
      case "partial":
        partialFields.push(f.field);
        break;
    }
  }

  return { publicFields, redactedFields, partialFields };
}
