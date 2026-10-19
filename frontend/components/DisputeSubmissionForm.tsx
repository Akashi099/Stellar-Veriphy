"use client";

/**
 * DisputeSubmissionForm.tsx
 *
 * Public-facing form for raising a content dispute against a provenance
 * certificate. Allows a reporter to describe their concern, choose a trigger
 * category, and attach initial structured evidence items.
 *
 * On success shows a confirmation panel with the dispute ID and next steps.
 *
 * Accessibility:
 *   - All fields have associated labels and aria-describedby error links.
 *   - The dynamic evidence list uses aria-live for screen reader feedback.
 *   - Keyboard-navigable evidence removal buttons.
 */

import { useId, useState } from "react";

import { useRaiseDispute } from "@/hooks/useDispute";
import type { DisputeEvidence, DisputeTrigger, RaiseDisputeRequest } from "@/types/dispute";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRIGGER_OPTIONS: { value: DisputeTrigger; label: string; description: string }[] = [
  {
    value: "incorrect_attestation",
    label: "Incorrect attestation",
    description: "The TEE attestation hash or proof appears wrong or forged.",
  },
  {
    value: "fraudulent_content",
    label: "Fraudulent content",
    description: "The media file itself is fraudulent, manipulated, or misrepresented.",
  },
  {
    value: "copyright_violation",
    label: "Copyright violation",
    description: "This content infringes on a copyright I hold or represent.",
  },
  {
    value: "legal_requirement",
    label: "Legal requirement",
    description: "A legal or regulatory obligation requires this record to be reviewed.",
  },
  {
    value: "creator_request",
    label: "Creator request",
    description: "I am the original creator and the record is incorrect or unauthorised.",
  },
  {
    value: "duplicate_record",
    label: "Duplicate record",
    description: "This content is already certified under a different certificate.",
  },
  {
    value: "identity_fraud",
    label: "Identity fraud",
    description: "The creator address was spoofed or does not belong to the real creator.",
  },
  {
    value: "other",
    label: "Other",
    description: "The issue does not fit any of the above categories.",
  },
];

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  hash_mismatch: "Hash mismatch",
  attestation_invalid: "Invalid attestation",
  duplicate_content: "Duplicate content",
  creator_identity: "Creator identity",
  legal_request: "Legal request",
  media_manipulation: "Media manipulation",
  on_chain_reference: "On-chain reference",
  external_reference: "External reference",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EvidenceItem({
  item,
  index,
  onRemove,
}: {
  item: DisputeEvidence;
  index: number;
  onRemove: (index: number) => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 text-sm">
      <div className="min-w-0">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {EVIDENCE_TYPE_LABELS[item.type] ?? item.type}
        </span>
        <p className="mt-0.5 text-slate-500 dark:text-slate-400 break-words">{item.description}</p>
        {item.reference && (
          <p className="mt-0.5 font-mono text-xs text-slate-400 dark:text-slate-500 break-all">
            {item.reference}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(index)}
        aria-label={`Remove evidence item ${index + 1}`}
        className="shrink-0 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

interface DisputeSubmissionFormProps {
  /** Pre-fill the certificate ID (e.g. when launched from a certificate page). */
  initialCertificateId?: string;
  /** Pre-fill the content hash. */
  initialContentHash?: string;
  /** Called after a dispute is successfully raised. */
  onSuccess?: (disputeId: string) => void;
}

export default function DisputeSubmissionForm({
  initialCertificateId = "",
  initialContentHash = "",
  onSuccess,
}: DisputeSubmissionFormProps) {
  const formId = useId();

  // Form state
  const [certificateId, setCertificateId] = useState(initialCertificateId);
  const [contentHash, setContentHash] = useState(initialContentHash);
  const [trigger, setTrigger] = useState<DisputeTrigger>("other");
  const [summary, setSummary] = useState("");
  const [reportedBy, setReportedBy] = useState("");
  const [evidenceItems, setEvidenceItems] = useState<DisputeEvidence[]>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Evidence builder state
  const [evidenceType, setEvidenceType] = useState<string>("external_reference");
  const [evidenceDesc, setEvidenceDesc] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [evidenceError, setEvidenceError] = useState("");

  const { raise, isPending, error, dispute, reset } = useRaiseDispute();

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const errors = {
    certificateId: touched.certificateId && !certificateId.trim()
      ? "Certificate ID is required."
      : null,
    contentHash: touched.contentHash && !contentHash.trim()
      ? "Content hash is required."
      : null,
    summary:
      touched.summary && summary.trim().length < 20
        ? "Please provide at least 20 characters."
        : touched.summary && summary.trim().length > 1000
          ? "Summary must be 1000 characters or fewer."
          : null,
  };

  const isValid =
    certificateId.trim() &&
    contentHash.trim() &&
    summary.trim().length >= 20 &&
    summary.trim().length <= 1000;

  // ---------------------------------------------------------------------------
  // Evidence handlers
  // ---------------------------------------------------------------------------

  const addEvidence = () => {
    if (!evidenceDesc.trim()) {
      setEvidenceError("Description is required.");
      return;
    }
    setEvidenceError("");
    setEvidenceItems((prev) => [
      ...prev,
      {
        type: evidenceType as DisputeEvidence["type"],
        description: evidenceDesc.trim(),
        reference: evidenceRef.trim() || undefined,
      },
    ]);
    setEvidenceDesc("");
    setEvidenceRef("");
  };

  const removeEvidence = (index: number) => {
    setEvidenceItems((prev) => prev.filter((_, i) => i !== index));
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ certificateId: true, contentHash: true, summary: true });
    if (!isValid) return;

    const req: RaiseDisputeRequest = {
      certificateId: certificateId.trim(),
      contentHash: contentHash.trim(),
      trigger,
      summary: summary.trim(),
      reportedBy: reportedBy.trim() || undefined,
      evidence: evidenceItems,
    };

    const result = await raise(req);
    if (result) {
      onSuccess?.(result.id);
    }
  };

  // ---------------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------------

  if (dispute) {
    return (
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 text-xl font-bold">
            ✓
          </span>
          <div>
            <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">
              Dispute raised successfully
            </h3>
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Reference: <span className="font-mono">{dispute.id}</span>
            </p>
          </div>
        </div>
        <div className="rounded-lg bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-900 p-4 text-sm text-slate-700 dark:text-slate-300 space-y-2">
          <p>
            <strong>What happens next:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-400">
            <li>An operator will review your dispute and the attached evidence.</li>
            <li>If more information is needed, you may be contacted via the address you provided.</li>
            <li>
              The final decision (upheld, rejected, or inconclusive) will be recorded and is
              permanent in the dispute audit trail.
            </li>
            <li>
              If the dispute is upheld and a certificate action is taken (e.g. revocation), the
              on-chain transaction hash will be recorded alongside the resolution.
            </li>
          </ol>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Raise another dispute
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      noValidate
      className="space-y-6"
      aria-label="Raise a content dispute"
    >
      {/* Certificate ID */}
      <div>
        <label
          htmlFor={`${formId}-cert`}
          className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1"
        >
          Certificate ID <span aria-hidden="true" className="text-red-500">*</span>
        </label>
        <input
          id={`${formId}-cert`}
          type="text"
          value={certificateId}
          onChange={(e) => setCertificateId(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, certificateId: true }))}
          placeholder="e.g. 42"
          aria-describedby={errors.certificateId ? `${formId}-cert-err` : undefined}
          aria-invalid={!!errors.certificateId}
          className={`w-full rounded-lg border px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition ${errors.certificateId ? "border-red-500" : "border-slate-300 dark:border-slate-600"}`}
        />
        {errors.certificateId && (
          <p id={`${formId}-cert-err`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {errors.certificateId}
          </p>
        )}
      </div>

      {/* Content hash */}
      <div>
        <label
          htmlFor={`${formId}-hash`}
          className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1"
        >
          Content hash <span aria-hidden="true" className="text-red-500">*</span>
        </label>
        <input
          id={`${formId}-hash`}
          type="text"
          value={contentHash}
          onChange={(e) => setContentHash(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, contentHash: true }))}
          placeholder="SHA-256 hex (64 characters)"
          aria-describedby={errors.contentHash ? `${formId}-hash-err` : undefined}
          aria-invalid={!!errors.contentHash}
          className={`w-full rounded-lg border px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition ${errors.contentHash ? "border-red-500" : "border-slate-300 dark:border-slate-600"}`}
        />
        {errors.contentHash && (
          <p id={`${formId}-hash-err`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {errors.contentHash}
          </p>
        )}
      </div>

      {/* Trigger */}
      <fieldset>
        <legend className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Reason for dispute <span aria-hidden="true" className="text-red-500">*</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRIGGER_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex flex-col gap-0.5 cursor-pointer rounded-lg border-2 p-3 text-sm transition ${
                trigger === opt.value
                  ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
              }`}
            >
              <input
                type="radio"
                name={`${formId}-trigger`}
                value={opt.value}
                checked={trigger === opt.value}
                onChange={() => setTrigger(opt.value)}
                className="sr-only"
              />
              <span className="font-medium text-slate-800 dark:text-slate-200">{opt.label}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{opt.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Summary */}
      <div>
        <label
          htmlFor={`${formId}-summary`}
          className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1"
        >
          Summary <span aria-hidden="true" className="text-red-500">*</span>
        </label>
        <textarea
          id={`${formId}-summary`}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, summary: true }))}
          rows={4}
          placeholder="Describe the specific concern with this certificate. Be as specific as possible — what is wrong, how you know, and what outcome you expect."
          aria-describedby={errors.summary ? `${formId}-summary-err` : `${formId}-summary-help`}
          aria-invalid={!!errors.summary}
          className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none resize-y transition ${errors.summary ? "border-red-500" : "border-slate-300 dark:border-slate-600"}`}
        />
        <p id={`${formId}-summary-help`} className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {summary.length}/1000 characters. Minimum 20 required.
        </p>
        {errors.summary && (
          <p id={`${formId}-summary-err`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {errors.summary}
          </p>
        )}
      </div>

      {/* Reporter address (optional) */}
      <div>
        <label
          htmlFor={`${formId}-reporter`}
          className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1"
        >
          Your Stellar address{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id={`${formId}-reporter`}
          type="text"
          value={reportedBy}
          onChange={(e) => setReportedBy(e.target.value)}
          placeholder="G… (anonymous reports are accepted)"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Providing your address lets an operator follow up if more information is needed.
        </p>
      </div>

      {/* Evidence builder */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Evidence <span className="font-normal text-slate-400">(optional, up to 10 items)</span>
        </h3>

        {/* Existing evidence list */}
        {evidenceItems.length > 0 && (
          <ul
            aria-label="Attached evidence items"
            aria-live="polite"
            className="space-y-2"
          >
            {evidenceItems.map((item, i) => (
              <EvidenceItem key={i} item={item} index={i} onRemove={removeEvidence} />
            ))}
          </ul>
        )}

        {/* Add evidence */}
        {evidenceItems.length < 10 && (
          <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Add an evidence item
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`${formId}-ev-type`}
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Type
                </label>
                <select
                  id={`${formId}-ev-type`}
                  value={evidenceType}
                  onChange={(e) => setEvidenceType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {Object.entries(EVIDENCE_TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor={`${formId}-ev-ref`}
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Reference / URL / hash <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  id={`${formId}-ev-ref`}
                  type="text"
                  value={evidenceRef}
                  onChange={(e) => setEvidenceRef(e.target.value)}
                  placeholder="https://… or 0xabc123…"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor={`${formId}-ev-desc`}
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Description <span aria-hidden="true" className="text-red-500">*</span>
              </label>
              <input
                id={`${formId}-ev-desc`}
                type="text"
                value={evidenceDesc}
                onChange={(e) => setEvidenceDesc(e.target.value)}
                placeholder="What does this evidence show?"
                aria-describedby={evidenceError ? `${formId}-ev-err` : undefined}
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition ${evidenceError ? "border-red-500" : "border-slate-300 dark:border-slate-600"}`}
              />
              {evidenceError && (
                <p id={`${formId}-ev-err`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {evidenceError}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={addEvidence}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
            >
              + Add evidence item
            </button>
          </div>
        )}
      </div>

      {/* API error */}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {isPending ? "Submitting…" : "Submit dispute"}
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          All disputes are recorded in an auditable log.
        </p>
      </div>
    </form>
  );
}
