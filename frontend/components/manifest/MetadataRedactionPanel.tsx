"use client";

/**
 * MetadataRedactionPanel.tsx
 *
 * UI for applying a controlled redaction policy to a content manifest.
 * Allows sensitive metadata fields to be hidden or partially released while
 * preserving proof integrity (the original manifest hash stays valid on-chain).
 *
 * Suitable for privacy-sensitive creators and regulated industries.
 */

import { useState } from "react";
import type { ContentManifest } from "@stellarveriphy/shared";
import type {
  RedactionPolicy,
  RedactedManifest,
  FieldRedactionPolicy,
  FieldVisibility,
} from "@stellarveriphy/shared/utils/metadataRedaction";
import {
  createDefaultPolicy,
  updateFieldVisibility,
  applyRedactionPolicy,
  buildVisibilitySummary,
  REDACTABLE_FIELDS,
  IMMUTABLE_FIELDS,
} from "@stellarveriphy/shared/utils/metadataRedaction";

// ---------------------------------------------------------------------------
// Field labels
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, { label: string; description: string }> = {
  "metadata.device": {
    label: "Device",
    description: "The device used to capture the content (e.g. camera model).",
  },
  "metadata.location": {
    label: "Location",
    description: "Geographic location where the content was captured.",
  },
  "metadata.aiModel": {
    label: "AI model",
    description: "AI model used to generate or process the content.",
  },
  "media.fileName": {
    label: "File name",
    description: "Original file name of the uploaded media.",
  },
  "media.fileType": {
    label: "File type",
    description: "MIME type or file extension of the media.",
  },
  "media.fileSizeBytes": {
    label: "File size",
    description: "Size of the media file in bytes.",
  },
  schemaVersion: {
    label: "Schema version",
    description: "The manifest schema version string.",
  },
};

const VISIBILITY_OPTIONS: { value: FieldVisibility; label: string; description: string }[] = [
  { value: "public", label: "Public", description: "Visible to everyone" },
  { value: "partial", label: "Partial", description: "Replaced with a custom placeholder" },
  { value: "redacted", label: "Redacted", description: "Hidden completely" },
];

// ---------------------------------------------------------------------------
// Single field row
// ---------------------------------------------------------------------------

function FieldPolicyRow({
  field,
  policy,
  onUpdate,
}: {
  field: string;
  policy: FieldRedactionPolicy;
  onUpdate: (field: string, visibility: FieldVisibility, partial?: string) => void;
}) {
  const meta = FIELD_LABELS[field] ?? { label: field, description: "" };
  const [partialValue, setPartialValue] = useState(policy.partialReplacement ?? "");

  return (
    <div className="grid gap-3 py-3.5 border-b border-gray-100 dark:border-gray-700 last:border-0 sm:grid-cols-[1fr_auto]">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{meta.label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</p>
        {policy.visibility === "partial" && (
          <input
            type="text"
            value={partialValue}
            onChange={(e) => {
              setPartialValue(e.target.value);
              onUpdate(field, "partial", e.target.value);
            }}
            placeholder="Placeholder text (e.g. 'location withheld')"
            className="mt-2 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            aria-label={`Placeholder for ${meta.label}`}
          />
        )}
      </div>
      <div className="flex items-start gap-1 sm:pt-0.5">
        {VISIBILITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onUpdate(field, opt.value, opt.value === "partial" ? partialValue : undefined)}
            title={opt.description}
            className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
              policy.visibility === opt.value
                ? opt.value === "public"
                  ? "bg-emerald-600 text-white"
                  : opt.value === "partial"
                    ? "bg-amber-500 text-white"
                    : "bg-red-600 text-white"
                : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Redacted preview
// ---------------------------------------------------------------------------

function RedactedPreview({ redacted }: { redacted: RedactedManifest }) {
  const summary = buildVisibilitySummary(redacted);
  const jsonStr = JSON.stringify(redacted.displayManifest, null, 2);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs">
        {summary.publicFields.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 text-emerald-800 dark:text-emerald-300">
            <span className="font-bold">{summary.publicFields.length}</span> public fields
          </span>
        )}
        {summary.partialFields.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-900/30 px-2 py-1 text-amber-800 dark:text-amber-300">
            <span className="font-bold">{summary.partialFields.length}</span> partially hidden
          </span>
        )}
        {summary.redactedFields.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded bg-red-100 dark:bg-red-900/30 px-2 py-1 text-red-800 dark:text-red-300">
            <span className="font-bold">{summary.redactedFields.length}</span> fully redacted
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        The original manifest hash{" "}
        <span className="font-mono text-gray-700 dark:text-gray-200 break-all">
          {redacted.originalManifestHash.slice(0, 20)}…
        </span>{" "}
        remains unchanged — on-chain verification is unaffected.
      </p>

      <pre className="overflow-x-auto rounded bg-gray-50 dark:bg-gray-800 px-4 py-3 text-xs text-gray-700 dark:text-gray-300 max-h-64">
        {jsonStr}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface MetadataRedactionPanelProps {
  manifest: ContentManifest;
  manifestHash: string;
  certificateId: string;
  /** Stellar public key of the current user */
  currentUser: string;
  /** Called when the user saves a policy */
  onPolicySaved?: (policy: RedactionPolicy, redacted: RedactedManifest) => void;
}

export function MetadataRedactionPanel({
  manifest,
  manifestHash,
  certificateId,
  currentUser,
  onPolicySaved,
}: MetadataRedactionPanelProps) {
  const [policy, setPolicy] = useState<RedactionPolicy>(() =>
    createDefaultPolicy(certificateId, currentUser),
  );
  const [previewMode, setPreviewMode] = useState(false);
  const [redacted, setRedacted] = useState<RedactedManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFieldUpdate(field: string, visibility: FieldVisibility, partial?: string) {
    setPolicy((prev) =>
      updateFieldVisibility(prev, field, visibility, { partialReplacement: partial }),
    );
    // Clear preview when policy changes
    setRedacted(null);
    setError(null);
  }

  function handlePreview() {
    try {
      const result = applyRedactionPolicy(manifest, policy, manifestHash);
      setRedacted(result);
      setPreviewMode(true);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to apply redaction policy.");
    }
  }

  function handleSave() {
    if (!redacted) return;
    onPolicySaved?.(policy, redacted);
  }

  const hasAnyRedaction = policy.fields.some((f) => f.visibility !== "public");

  return (
    <section
      aria-label="Metadata redaction"
      className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-6"
    >
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Metadata redaction
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Choose which metadata fields are visible publicly. Redacted fields are hidden from viewers
          while the original manifest hash and on-chain proof remain intact.
        </p>
      </div>

      {/* Immutable fields notice */}
      <div className="rounded bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
        <p className="font-medium mb-1">Always public (required for verification)</p>
        <p className="font-mono text-xs">{IMMUTABLE_FIELDS.join(", ")}</p>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="rounded border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Field policies */}
      <div>
        <p className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500 mb-2">
          Configurable fields
        </p>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {REDACTABLE_FIELDS.map((field) => {
            const fieldPolicy = policy.fields.find((f) => f.field === field) ?? {
              field,
              visibility: "public" as FieldVisibility,
            };
            return (
              <FieldPolicyRow
                key={field}
                field={field}
                policy={fieldPolicy}
                onUpdate={handleFieldUpdate}
              />
            );
          })}
        </div>
      </div>

      {/* Preview */}
      {previewMode && redacted && (
        <div>
          <p className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500 mb-2">
            Preview — what viewers will see
          </p>
          <RedactedPreview redacted={redacted} />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handlePreview}
          className="rounded border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
        >
          Preview redacted view
        </button>
        {onPolicySaved && redacted && (
          <button
            type="button"
            onClick={handleSave}
            className="rounded border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            Save redaction policy
          </button>
        )}
        {!hasAnyRedaction && (
          <p className="self-center text-xs text-gray-400 dark:text-gray-500">
            All fields are currently set to public.
          </p>
        )}
      </div>

      {/* Governance notice */}
      <p className="text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 pt-4">
        Redaction policies are reviewed by governance operators before becoming active. The original
        unredacted manifest is preserved on-chain for authorized dispute resolution.
      </p>
    </section>
  );
}
