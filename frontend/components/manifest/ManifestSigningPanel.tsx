"use client";

/**
 * ManifestSigningPanel.tsx
 *
 * Allows a creator to cryptographically sign their content manifest before
 * submission using the Freighter wallet. Shows verification status and
 * explains what the signature proves to the reviewer.
 */

import { useState } from "react";
import type { ContentManifest } from "@stellarveriphy/shared";
import type { SignedManifest } from "@stellarveriphy/shared/utils/manifestSigning";
import {
  signManifestWithFreighter,
  verifySignedManifest,
  hashManifest,
} from "@stellarveriphy/shared/utils/manifestSigning";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusRow({
  label,
  ok,
  description,
}: {
  label: string;
  ok: boolean;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span
        className={`mt-0.5 text-base shrink-0 ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}
        aria-hidden="true"
      >
        {ok ? "✓" : "✗"}
      </span>
      <div className="text-sm">
        <p className="font-medium text-gray-800 dark:text-gray-200">{label}</p>
        <p className="text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ManifestSigningPanelProps {
  manifest: ContentManifest;
  /** Called when a valid SignedManifest is produced */
  onSigned: (signed: SignedManifest) => void;
  /** Initial signed manifest (if already signed in a previous session) */
  initialSigned?: SignedManifest;
}

export function ManifestSigningPanel({
  manifest,
  onSigned,
  initialSigned,
}: ManifestSigningPanelProps) {
  const [signed, setSigned] = useState<SignedManifest | null>(initialSigned ?? null);
  const [isSigning, setIsSigning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    hashIntegrity: boolean;
    signerIsCreator: boolean;
    reason?: string;
  } | null>(signed ? null : null);
  const [computedHash, setComputedHash] = useState<string | null>(null);

  // Compute hash on first render for display
  if (computedHash === null) {
    hashManifest(manifest).then(setComputedHash).catch(() => {});
  }

  async function handleSign() {
    setError(null);
    setIsSigning(true);
    setVerificationResult(null);
    try {
      const result = await signManifestWithFreighter(manifest);
      setSigned(result);
      onSigned(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signing failed. Please try again.");
    } finally {
      setIsSigning(false);
    }
  }

  async function handleVerify() {
    if (!signed) return;
    setError(null);
    setIsVerifying(true);
    try {
      const result = await verifySignedManifest(signed);
      setVerificationResult(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setIsVerifying(false);
    }
  }

  function handleClear() {
    setSigned(null);
    setVerificationResult(null);
    setError(null);
  }

  return (
    <section
      aria-label="Manifest signing"
      className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-5"
    >
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Cryptographic signing
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Sign your manifest with your Freighter wallet to prove it was not tampered with before
          submission. Tampering is detectable before final acceptance of the record.
        </p>
      </div>

      {/* Hash preview */}
      <div className="rounded bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm">
        <p className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500 mb-1">
          Manifest hash (SHA-256)
        </p>
        <p className="font-mono break-all text-gray-800 dark:text-gray-200">
          {computedHash ?? <span className="text-gray-400">Computing…</span>}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200"
        >
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            ✗
          </span>
          {error}
        </div>
      )}

      {/* Unsigned state */}
      {!signed && (
        <button
          type="button"
          onClick={handleSign}
          disabled={isSigning || !computedHash}
          className="w-full rounded border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSigning ? "Waiting for Freighter…" : "Sign with Freighter wallet"}
        </button>
      )}

      {/* Signed state */}
      {signed && (
        <div className="space-y-4">
          <div className="rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            <p className="font-semibold">Manifest signed</p>
            <p className="mt-0.5">
              Signed at {new Date(signed.signedAt).toLocaleString()} by{" "}
              <span className="font-mono">{signed.signerPublicKey.slice(0, 8)}…</span>
            </p>
          </div>

          {/* Signature value */}
          <div className="rounded bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm space-y-2">
            <p className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">
              Signature (base64)
            </p>
            <p className="font-mono text-xs break-all text-gray-700 dark:text-gray-300">
              {signed.signature}
            </p>
          </div>

          {/* Verification result */}
          {verificationResult && (
            <div className="rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              <StatusRow
                label="Hash integrity"
                ok={verificationResult.hashIntegrity}
                description="The manifest hash in the signature matches the recomputed hash of the manifest content."
              />
              <StatusRow
                label="Signer is creator"
                ok={verificationResult.signerIsCreator}
                description="The wallet that signed matches the creator field in the manifest."
              />
              <StatusRow
                label="Signature present"
                ok={verificationResult.valid && !!signed.signature}
                description="A non-empty signature was provided and all checks passed."
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleVerify}
              disabled={isVerifying}
              className="flex-1 rounded border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 transition-colors"
            >
              {isVerifying ? "Verifying…" : "Verify signature"}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Explainer */}
      <details className="text-sm text-gray-500 dark:text-gray-400">
        <summary className="cursor-pointer select-none font-medium text-gray-600 dark:text-gray-300">
          How does this protect my submission?
        </summary>
        <ul className="mt-2 ml-4 list-disc space-y-1.5">
          <li>
            Your Freighter wallet signs the SHA-256 hash of the manifest using your Stellar private
            key, which never leaves the wallet.
          </li>
          <li>
            Any change to the manifest after signing — even a single character — produces a
            different hash and invalidates the signature.
          </li>
          <li>
            On-chain registry validation confirms the signature before the certificate is minted,
            so tampered submissions are rejected automatically.
          </li>
        </ul>
      </details>
    </section>
  );
}
