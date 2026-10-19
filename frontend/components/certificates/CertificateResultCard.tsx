"use client";

/**
 * CertificateResultCard.tsx
 *
 * Displays detailed certificate information after a successful lookup.
 * Shows identity fields, status indicators, metadata, cryptographic hashes,
 * and the verification confidence score with its per-factor breakdown.
 */

import { useState } from "react";

import ConfidencePanel from "@/components/ConfidencePanel";
import ProvenanceAnchors from "@/components/ProvenanceAnchors";
import { useConfidenceScore } from "@/hooks/useConfidenceScore";
import type { CertificateVerificationResult } from "@/services/certificateVerificationService";

import { type CertificateStatus, CertificateStatusBadge } from "./CertificateStatusBadge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CertificateResultCardProps {
  result: CertificateVerificationResult;
  onVerifyAuthenticity?: (id: string) => void;
  onGenerateCode?: (id: string) => void;
  isVerifying?: boolean;
  generatedCode?: string | null;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function truncateHash(hash: string, chars = 16): string {
  if (hash.length <= chars * 2 + 3) return hash;
  return hash.slice(0, chars) + "..." + hash.slice(-chars);
}

function explorerUrl(id: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${id}`;
}

function certificateUrl(id: string): string {
  return `/certificate?id=${encodeURIComponent(id)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailRow({
  label,
  value,
  mono = false,
  copyable = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };

  return (
    <div className="flex items-start justify-between py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <dt className="text-sm text-gray-500 dark:text-gray-400 shrink-0 min-w-[120px]">{label}</dt>
      <dd
        className={`text-sm text-gray-900 dark:text-gray-100 text-right flex items-center gap-2 ${mono ? "font-mono" : ""}`}
      >
        <span className="break-all max-w-[320px]">{value}</span>
        {copyable && (
          <button
            onClick={handleCopy}
            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label={copied ? "Copied" : "Copy ".concat(label)}
          >
            {copied ? (
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              <svg
                className="w-4 h-4 text-emerald-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            )}
          </button>
        )}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verification Level Badge
// ---------------------------------------------------------------------------

function VerificationLevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    Basic: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    Standard: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    Premium: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    Enterprise: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[level] || colors.Basic}`}
    >
      {level}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CertificateResultCard({
  result,
  onVerifyAuthenticity,
  onGenerateCode,
  isVerifying = false,
  generatedCode = null,
}: CertificateResultCardProps) {
  const { certificate, verificationLevel, statusLabel, owner, displayName, description, isLocked } =
    result;
  const status = statusLabel as CertificateStatus;

  // Compute confidence from the oracle evidence + manifest attached to this result
  const confidence = useConfidenceScore(result.evidence, result.manifest);
  const anchors = result.anchors ?? [];
  const outcome = result.isRevoked
    ? "revoked"
    : result.isExpired
      ? "expired"
      : result.isValid
        ? "valid"
        : "not valid";
  const evidenceSummary = result.evidence
    ? [
        `attestation ${result.evidence.attestationValid ? "valid" : "invalid"}`,
        `verifier code ${result.evidence.teeCodeHashApproved ? "approved" : "not approved"}`,
        `content hash ${result.evidence.contentHashMatches ? "matches" : "does not match"}`,
        `creator signature ${result.evidence.creatorSigned ? "present" : "missing"}`,
      ].join(", ")
    : "attestation evidence unavailable";

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <p className="sr-only">
        Verification result for certificate {certificate.id}: {outcome} ({statusLabel}). Evidence: {evidenceSummary}.
      </p>
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-lg">
            #
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Certificate #{certificate.id}
            </h3>
            {displayName && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{displayName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <VerificationLevelBadge level={verificationLevel} />
          <CertificateStatusBadge status={status} />
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-6 py-4 space-y-6">
        {/* Description */}
        {description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 italic border-l-2 border-gray-200 dark:border-gray-700 pl-3">
            {description}
          </p>
        )}

        {/* Confidence score panel — shown whenever oracle evidence is available */}
        {confidence && (
          <ConfidencePanel
            result={confidence}
            defaultExpanded={false}
          />
        )}

        {/* Details grid */}
        <dl className="divide-y divide-gray-100 dark:divide-gray-800">
          <DetailRow label="Certificate ID" value={certificate.id} mono copyable />
          <DetailRow label="Owner" value={owner} mono copyable />
          <DetailRow label="Created" value={formatTimestamp(certificate.timestamp)} />
          {isLocked && <DetailRow label="Locked" value="Yes - Certificate is immutable" />}
        </dl>

        {/* Cryptographic hashes */}
        <div>
          <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Cryptographic Hashes
          </h4>
          <dl className="divide-y divide-gray-100 dark:divide-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4">
            <DetailRow
              label="Storage Reference"
              value={truncateHash(certificate.storageRef)}
              mono
              copyable
            />
            <DetailRow
              label="Manifest Hash"
              value={truncateHash(certificate.manifestHash)}
              mono
              copyable
            />
            <DetailRow
              label="Attestation Hash"
              value={truncateHash(certificate.attestationHash)}
              mono
              copyable
            />
          </dl>
        </div>

        {/* Supplemental provenance anchors */}
        {anchors.length > 0 && (
          <ProvenanceAnchors anchors={anchors} />
        )}

        {/* Actions */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
          <div className="flex items-center gap-4 flex-wrap">
          <a
            href={explorerUrl(certificate.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            View on StellarExpert
          </a>
          <a
            href={certificateUrl(certificate.id)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open certificate #${certificate.id} in a new tab`}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10-2v6h6" />
            </svg>
            Open in new tab
          </a>
          </div>

          <div className="flex items-center gap-2">
            {onVerifyAuthenticity && (
              <button
                onClick={() => onVerifyAuthenticity(certificate.id)}
                disabled={isVerifying}
                className="px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isVerifying ? "Verifying..." : "Verify Authenticity"}
              </button>
            )}
            {onGenerateCode && (
              <button
                onClick={() => onGenerateCode(certificate.id)}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Generate Code
              </button>
            )}
          </div>
        </div>

        {/* Generated code display */}
        {generatedCode && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">
              Verification Code Generated
            </p>
            <p className="text-2xl font-mono font-bold text-blue-900 dark:text-blue-100 tracking-widest text-center">
              {generatedCode}
            </p>
            <p className="text-xs text-blue-500 dark:text-blue-400 mt-1 text-center">
              Share this code to allow others to verify this certificate
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
