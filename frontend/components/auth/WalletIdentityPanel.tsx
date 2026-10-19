"use client";

/**
 * WalletIdentityPanel.tsx
 *
 * UI for wallet-based identity binding for creators (#652).
 *
 * States:
 *  unbound  → "Bind your wallet" CTA
 *  pending  → signing step (challenge displayed, waiting for wallet signature)
 *  bound    → summary of the verified binding with revoke option
 *  revoked  → revoked state with option to re-bind
 *
 * Security:
 *  - Duplicate claim warning shown before confirming.
 *  - Display name and organisation fields are optional and do not affect
 *    the cryptographic binding.
 *  - The challenge message is shown verbatim so the user can verify what
 *    they are signing.
 */

import { useEffect, useState } from "react";

import {
  buildIdentityChallenge,
  checkForDuplicateClaim,
  fetchIdentityBinding,
  type IdentityBinding,
  type IdentityBindingChallenge,
  isValidStellarPublicKey,
  requestIdentityChallenge,
  revokeIdentityBinding,
  shortPublicKey,
  submitIdentityBinding,
} from "@/services/walletIdentityService";
import { formatDateTime } from "@/utils/formatDateTime";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WalletIdentityPanelProps {
  /** The currently connected wallet's public key. */
  connectedKey: string | null;
  /**
   * Sign a message with the connected wallet.
   * Returns { signedMessage, signature } on success.
   */
  signMessage?: (message: string) => Promise<{ signedMessage: string; signature: string }>;
  onBindingChange?: (binding: IdentityBinding | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WalletIdentityPanel({
  connectedKey,
  signMessage,
  onBindingChange,
}: WalletIdentityPanelProps) {
  const [binding, setBinding] = useState<IdentityBinding | null>(null);
  const [challenge, setChallenge] = useState<IdentityBindingChallenge | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load existing binding when the connected key changes
  useEffect(() => {
    if (!connectedKey || !isValidStellarPublicKey(connectedKey)) {
      setBinding(null);
      setChallenge(null);
      return;
    }

    (async () => {
      const result = await fetchIdentityBinding(connectedKey);
      if (result.success) {
        setBinding(result.data);
        onBindingChange?.(result.data);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedKey]);

  // ── Step 1: request challenge ──
  const handleRequestChallenge = async () => {
    if (!connectedKey) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    // Check for duplicate claims first
    const dupCheck = await checkForDuplicateClaim(connectedKey);
    if (dupCheck.success && dupCheck.data.isDuplicate) {
      setDuplicateWarning(true);
    }

    const challengeResult = await requestIdentityChallenge(connectedKey);
    setBusy(false);

    if (!challengeResult.success) {
      setError(challengeResult.error);
      return;
    }

    setChallenge(challengeResult.data);
  };

  // ── Step 2: sign and submit ──
  const handleSignAndBind = async () => {
    if (!connectedKey || !challenge || !signMessage) return;
    setBusy(true);
    setError(null);

    try {
      const message = buildIdentityChallenge(
        connectedKey,
        challenge.nonce,
        new Date().toISOString(),
      );

      const { signedMessage, signature } = await signMessage(message);

      const bindResult = await submitIdentityBinding({
        publicKey: connectedKey,
        signedChallenge: signedMessage,
        signature,
        nonce: challenge.nonce,
        displayName: displayName.trim() || undefined,
        organisation: organisation.trim() || undefined,
      });

      if (!bindResult.success) {
        setError(bindResult.error);
        return;
      }

      setBinding(bindResult.data);
      setChallenge(null);
      setDuplicateWarning(false);
      setSuccess("Identity successfully bound to your wallet.");
      onBindingChange?.(bindResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signing failed or was cancelled.");
    } finally {
      setBusy(false);
    }
  };

  // ── Revoke ──
  const handleRevoke = async () => {
    if (!connectedKey) return;
    setBusy(true);
    setError(null);

    const result = await revokeIdentityBinding(connectedKey);
    setBusy(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setBinding((prev) => prev ? { ...prev, status: "revoked" } : null);
    setSuccess("Identity binding revoked.");
    onBindingChange?.(null);
  };

  // ── No wallet connected ──
  if (!connectedKey) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
        Connect your wallet to manage your creator identity binding.
      </div>
    );
  }

  // ── Bound ──
  if (binding?.status === "bound") {
    return (
      <section
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-900/20"
        aria-labelledby="identity-bound-title"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3
              id="identity-bound-title"
              className="flex items-center gap-2 text-base font-semibold text-emerald-800 dark:text-emerald-300"
            >
              <span aria-hidden>✓</span> Wallet identity verified
            </h3>
            <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
              Your wallet is cryptographically bound to your creator record.
            </p>
          </div>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Public key</dt>
            <dd className="font-mono text-gray-900 dark:text-gray-100" title={binding.publicKey}>
              {shortPublicKey(binding.publicKey)}
            </dd>
          </div>
          {binding.displayName && (
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Display name</dt>
              <dd className="text-gray-900 dark:text-gray-100">{binding.displayName}</dd>
            </div>
          )}
          {binding.organisation && (
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Organisation</dt>
              <dd className="text-gray-900 dark:text-gray-100">{binding.organisation}</dd>
            </div>
          )}
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Last updated</dt>
            <dd className="text-gray-900 dark:text-gray-100">
              {formatDateTime(binding.updatedAt) ?? "Date unavailable"}
            </dd>
          </div>
        </dl>

        {success && (
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400" role="status">
            {success}
          </p>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleRevoke}
          disabled={busy}
          className="mt-4 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {busy ? "Revoking…" : "Revoke binding"}
        </button>
      </section>
    );
  }

  // ── Pending (challenge issued) ──
  if (challenge) {
    const previewMessage = buildIdentityChallenge(
      connectedKey,
      challenge.nonce,
      new Date().toISOString(),
    );

    return (
      <section
        className="rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-900/20"
        aria-labelledby="identity-challenge-title"
      >
        <h3
          id="identity-challenge-title"
          className="text-base font-semibold text-blue-800 dark:text-blue-300"
        >
          Sign to verify ownership
        </h3>
        <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
          Your wallet will be asked to sign the message below. This proves you control
          the key without exposing your private key.
        </p>

        {duplicateWarning && (
          <div
            className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
            role="alert"
          >
            ⚠ This public key is already associated with another record. Proceeding
            will flag the duplicate claim for governance review.
          </div>
        )}

        <pre className="mt-4 overflow-auto rounded-lg border border-blue-200 bg-white p-3 text-xs font-mono text-gray-700 dark:border-blue-700 dark:bg-gray-900 dark:text-gray-300">
          {previewMessage}
        </pre>

        {/* Optional display name */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="binding-display-name"
              className="block text-xs font-medium text-gray-600 dark:text-gray-400"
            >
              Display name <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="binding-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              placeholder="Alice Creator"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label
              htmlFor="binding-organisation"
              className="block text-xs font-medium text-gray-600 dark:text-gray-400"
            >
              Organisation <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="binding-organisation"
              type="text"
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
              maxLength={100}
              placeholder="Acme Media Ltd"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handleSignAndBind}
            disabled={busy || !signMessage}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            title={!signMessage ? "Wallet signing is not available" : undefined}
          >
            {busy ? "Signing…" : "Sign & bind identity"}
          </button>
          <button
            type="button"
            onClick={() => { setChallenge(null); setError(null); }}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300"
          >
            Cancel
          </button>
        </div>
      </section>
    );
  }

  // ── Unbound / revoked ──
  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
      aria-labelledby="identity-unbound-title"
    >
      <h3
        id="identity-unbound-title"
        className="text-base font-semibold text-gray-900 dark:text-white"
      >
        Creator identity binding
      </h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Cryptographically link your Stellar wallet to your creator record. This
        improves trust and ensures unambiguous attribution.
      </p>

      <div className="mt-3 text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">Connected key: </span>
        <span className="font-mono text-gray-900 dark:text-gray-100" title={connectedKey}>
          {shortPublicKey(connectedKey)}
        </span>
        {binding?.status === "revoked" && (
          <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            previously revoked
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleRequestChallenge}
        disabled={busy}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Requesting challenge…" : "Bind wallet identity"}
      </button>
    </section>
  );
}
