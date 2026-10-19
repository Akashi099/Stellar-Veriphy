"use client";

/**
 * AttestationPipelinePanel (#649)
 *
 * Displays the result of the attestation verification pipeline.
 * Shows per-check pass/fail, risk score, and a top-level verdict so
 * operators can quickly assess the trust level of an attestation result.
 */

import type { AttestationEvidence } from "@stellarveriphy/shared";
import {
  runAttestationPipeline,
  type AttestationCheckResult,
  type AttestationStatus,
} from "@/services/attestationPipelineService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status: AttestationStatus): string {
  switch (status) {
    case "valid":
      return "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300";
    case "suspicious":
      return "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-300";
    case "mismatch":
    case "integrity_failure":
    case "rejected":
      return "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300";
    default:
      return "bg-gray-50 border-gray-200 text-gray-800";
  }
}

function statusLabel(status: AttestationStatus): string {
  switch (status) {
    case "valid":
      return "✅ Valid";
    case "suspicious":
      return "⚠️ Suspicious";
    case "integrity_failure":
      return "❌ Integrity Failure";
    case "mismatch":
      return "❌ Mismatch";
    case "rejected":
      return "🚫 Rejected";
    default:
      return status;
  }
}

function CheckRow({
  label,
  passed,
  description,
}: {
  label: string;
  passed: boolean;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0 border-gray-100 dark:border-gray-700">
      <span
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
          passed
            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
            : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
        }`}
        aria-hidden="true"
      >
        {passed ? "✓" : "✗"}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      <span
        className={`ml-auto flex-shrink-0 px-2 py-0.5 rounded text-xs font-semibold ${
          passed
            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
            : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
        }`}
      >
        {passed ? "PASS" : "FAIL"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  /** Pre-computed result. If omitted, `evidence` is evaluated live. */
  result?: AttestationCheckResult;
  /** Raw attestation evidence to run through the pipeline. */
  evidence?: AttestationEvidence;
  /** Optional class overrides for the outer wrapper. */
  className?: string;
}

export function AttestationPipelinePanel({ result, evidence, className = "" }: Props) {
  const pipelineResult: AttestationCheckResult | null =
    result ?? (evidence ? runAttestationPipeline(evidence) : null);

  if (!pipelineResult) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
        No attestation evidence available.
      </div>
    );
  }

  const { status, message, checks, riskScore, evaluatedAt } = pipelineResult;

  const checkRows: { key: keyof typeof checks; label: string; description: string }[] = [
    {
      key: "signatureValid",
      label: "Attestation Signature",
      description: "Ed25519 signature over the attestation payload was verified successfully.",
    },
    {
      key: "teeHashApproved",
      label: "TEE Code Hash",
      description: "The enclave binary hash is listed in the approved registry.",
    },
    {
      key: "contentHashMatches",
      label: "Content Hash Match",
      description: "Hash recomputed inside the TEE matches the manifest's contentHash field.",
    },
    {
      key: "creatorAuthorized",
      label: "Creator Signature",
      description: "The content creator authorized this verification request with their Stellar key.",
    },
    {
      key: "enclaveIdentified",
      label: "Enclave Identity",
      description: "The attestation payload identifies a known enclave environment.",
    },
    {
      key: "noMismatch",
      label: "Internal Consistency",
      description: "No conflicting attestation fields detected in the payload.",
    },
  ];

  return (
    <section
      aria-label="Attestation Pipeline Results"
      className={`rounded-xl border p-5 ${statusColor(status)} ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold">{statusLabel(status)}</h2>
          <p className="text-sm mt-0.5">{message}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs font-medium uppercase tracking-wide opacity-70">Risk Score</p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              riskScore === 0
                ? "text-green-600 dark:text-green-400"
                : riskScore < 40
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-red-600 dark:text-red-400"
            }`}
          >
            {riskScore}
            <span className="text-sm font-normal">/100</span>
          </p>
        </div>
      </div>

      {/* Checks */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 px-4 divide-y divide-gray-100 dark:divide-gray-700 mb-4">
        {checkRows.map(({ key, label, description }) => (
          <CheckRow key={key} label={label} passed={checks[key]} description={description} />
        ))}
      </div>

      {/* Evidence details */}
      <details className="text-xs">
        <summary className="cursor-pointer font-medium opacity-70 hover:opacity-100 select-none">
          Attestation evidence details
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 bg-white/50 dark:bg-black/20 rounded p-3 font-mono">
          <span className="text-gray-500 dark:text-gray-400">Enclave</span>
          <span className="truncate">{pipelineResult.evidence.enclave || "—"}</span>
          <span className="text-gray-500 dark:text-gray-400">TEE Code Hash</span>
          <span className="truncate">{pipelineResult.evidence.teeCodeHash || "—"}</span>
          <span className="text-gray-500 dark:text-gray-400">Attestation Hash</span>
          <span className="truncate">{pipelineResult.evidence.attestationHash || "—"}</span>
          <span className="text-gray-500 dark:text-gray-400">Evaluated At</span>
          <span>{new Date(evaluatedAt).toLocaleString()}</span>
        </div>
      </details>
    </section>
  );
}
