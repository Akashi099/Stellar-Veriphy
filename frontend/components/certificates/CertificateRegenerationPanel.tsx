"use client";

/**
 * CertificateRegenerationPanel.tsx
 *
 * UI panel for the provenance certificate regeneration flow (#653).
 *
 * Renders:
 *  - Eligibility check (blockers / warnings).
 *  - Reason selection with clear labelling.
 *  - A review note field for audit purposes.
 *  - Confirmation step before submission.
 *  - Success state showing the new certificate ID and predecessor link.
 *  - Full regeneration history timeline.
 */

import { useState } from "react";

import type { ProvenanceCert } from "@stellarveriphy/shared/types";
import {
  BLOCKER_MESSAGES,
  evaluateRegenerationEligibility,
  type RegenerationReason,
  REGENERATION_REASON_LABELS,
  submitRegenerationRequest,
  type RegenerationResult,
} from "@/services/certificateRegenerationService";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CertificateRegenerationPanelProps {
  certificate: ProvenanceCert & { status?: string };
  connectedKey: string | null;
  hasPendingRegeneration?: boolean;
  isMaintainerApproved?: boolean;
  onSuccess?: (result: RegenerationResult) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const REASONS: RegenerationReason[] = [
  "metadata_updated",
  "storage_ref_changed",
  "attestation_refresh",
  "creator_key_rotation",
  "correction",
];

type Step = "form" | "confirm" | "success";

export function CertificateRegenerationPanel({
  certificate,
  connectedKey,
  hasPendingRegeneration = false,
  isMaintainerApproved = false,
  onSuccess,
}: CertificateRegenerationPanelProps) {
  const [reason, setReason] = useState<RegenerationReason>("metadata_updated");
  const [reviewNote, setReviewNote] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegenerationResult | null>(null);

  const eligibility = evaluateRegenerationEligibility(
    certificate,
    connectedKey,
    hasPendingRegeneration,
    isMaintainerApproved,
    reason,
  );

  // Re-evaluate whenever reason changes
  const currentEligibility = evaluateRegenerationEligibility(
    certificate,
    connectedKey,
    hasPendingRegeneration,
    isMaintainerApproved,
    reason,
  );

  const handleSubmit = async () => {
    if (!connectedKey) return;
    setSubmitting(true);
    setError(null);

    const response = await submitRegenerationRequest({
      certificateId: certificate.id,
      reason,
      newManifestHash: null,
      newStorageRef: null,
      reviewNote,
      requesterKey: connectedKey,
    });

    setSubmitting(false);

    if (!response.success) {
      setError(response.error);
      return;
    }

    setResult(response.data);
    setStep("success");
    onSuccess?.(response.data);
  };

  // ── Success state ──
  if (step === "success" && result) {
    return (
      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-900/20"
        role="status"
        aria-live="polite"
      >
        <h3 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
          Certificate regenerated successfully
        </h3>
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-gray-500 dark:text-gray-400">New certificate ID</dt>
            <dd className="font-mono text-gray-900 dark:text-gray-100">{result.newCertificate.id}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Predecessor (preserved for audit)</dt>
            <dd className="font-mono text-gray-700 dark:text-gray-300">{result.predecessorId}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Transaction</dt>
            <dd className="truncate font-mono text-xs text-gray-700 dark:text-gray-300">{result.txHash}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Regenerated at</dt>
            <dd className="text-gray-700 dark:text-gray-300">
              {new Date(result.regeneratedAt).toLocaleString()}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          The original certificate{" "}
          <span className="font-mono">#{result.predecessorId}</span> remains
          on-chain and fully auditable. The new certificate references it via{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">predecessorId</code>.
        </p>
      </div>
    );
  }

  // ── Confirmation step ──
  if (step === "confirm") {
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-900/20"
        role="alertdialog"
        aria-labelledby="regen-confirm-title"
      >
        <h3
          id="regen-confirm-title"
          className="text-base font-semibold text-amber-800 dark:text-amber-300"
        >
          Confirm certificate regeneration
        </h3>
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          A new certificate will be minted on the Stellar blockchain. The existing certificate{" "}
          <span className="font-mono font-semibold">#{certificate.id}</span> will be preserved
          and marked as a predecessor. This action cannot be undone.
        </p>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-gray-500 dark:text-gray-400 shrink-0">Reason:</dt>
            <dd className="text-gray-900 dark:text-gray-100">{REGENERATION_REASON_LABELS[reason]}</dd>
          </div>
          {reviewNote && (
            <div className="flex gap-2">
              <dt className="text-gray-500 dark:text-gray-400 shrink-0">Note:</dt>
              <dd className="text-gray-700 dark:text-gray-300">{reviewNote}</dd>
            </div>
          )}
        </dl>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Confirm regeneration"}
          </button>
          <button
            type="button"
            onClick={() => { setStep("form"); setError(null); }}
            disabled={submitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Form step ──
  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
      aria-labelledby="regen-panel-title"
    >
      <h3
        id="regen-panel-title"
        className="text-base font-semibold text-gray-900 dark:text-white"
      >
        Regenerate certificate
      </h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Request a new certificate that supersedes the current one. The original
        certificate is preserved on-chain and remains fully auditable.
      </p>

      {/* Blockers */}
      {currentEligibility.blockers.length > 0 && (
        <ul
          className="mt-4 space-y-1 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20"
          aria-label="Regeneration blockers"
        >
          {currentEligibility.blockers.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
              <span aria-hidden className="mt-0.5 shrink-0">✕</span>
              {BLOCKER_MESSAGES[b]}
            </li>
          ))}
        </ul>
      )}

      {/* Warnings */}
      {currentEligibility.warnings.length > 0 && (
        <ul
          className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20"
          aria-label="Regeneration warnings"
        >
          {currentEligibility.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
              <span aria-hidden className="mt-0.5 shrink-0">⚠</span>
              {w}
            </li>
          ))}
        </ul>
      )}

      {/* Reason selector */}
      <div className="mt-5">
        <label
          htmlFor="regen-reason"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Regeneration reason
        </label>
        <select
          id="regen-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as RegenerationReason)}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {REGENERATION_REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {/* Review note */}
      <div className="mt-4">
        <label
          htmlFor="regen-note"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Review note{" "}
          <span className="text-xs text-gray-400 font-normal">(displayed to maintainers)</span>
        </label>
        <textarea
          id="regen-note"
          rows={3}
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          maxLength={1000}
          placeholder="Describe why regeneration is needed and what changed…"
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
        <p className="mt-1 text-xs text-gray-400">{reviewNote.length}/1000</p>
      </div>

      {/* Predecessor info */}
      <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-700/50 dark:text-gray-400">
        <p>
          <strong>Auditability note:</strong> Certificate{" "}
          <span className="font-mono">#{certificate.id}</span> will remain on-chain
          and will be linked from the new certificate via{" "}
          <code className="rounded bg-white px-1 dark:bg-gray-800">predecessorId</code>.
          Historical state is never deleted.
        </p>
      </div>

      <button
        type="button"
        disabled={!currentEligibility.eligible}
        onClick={() => setStep("confirm")}
        className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Review &amp; confirm
      </button>
    </section>
  );
}
