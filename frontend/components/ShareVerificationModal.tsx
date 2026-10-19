"use client";

import { useState } from "react";
import {
  buildShareableVerificationUrl,
  type VerificationAccessMode,
  type StakeholderRole,
} from "@/lib/shareableUrl";

interface ShareVerificationModalProps {
  recordId: string;
  recordTitle?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareVerificationModal({
  recordId,
  recordTitle,
  isOpen,
  onClose,
}: ShareVerificationModalProps) {
  const [mode, setMode] = useState<VerificationAccessMode>("public");
  const [role, setRole] = useState<StakeholderRole>("client");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = buildShareableVerificationUrl(recordId, {
    mode,
    role,
    baseUrl: origin,
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
          <h2 id="share-modal-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Share Verification Proof
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Generate a deep-linkable URL to share provenance and verification proof for{" "}
          <strong className="text-gray-800 dark:text-gray-200">{recordTitle || recordId}</strong>.
        </p>

        {/* Access Mode Selector */}
        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Access Model
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("public")}
              className={`p-3 text-left rounded-lg border text-sm font-medium transition ${
                mode === "public"
                  ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200 dark:border-indigo-500"
                  : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              }`}
            >
              <div className="font-semibold">🌐 Public Link</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                For external stakeholders, clients & public inspection.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode("authenticated")}
              className={`p-3 text-left rounded-lg border text-sm font-medium transition ${
                mode === "authenticated"
                  ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200 dark:border-indigo-500"
                  : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              }`}
            >
              <div className="font-semibold">🔐 Authenticated View</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                For auditors & team members with full attestation access.
              </div>
            </button>
          </div>
        </div>

        {/* Stakeholder Role */}
        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Target Audience Context
          </label>
          <div className="flex gap-2">
            {(["client", "auditor", "stakeholder"] as StakeholderRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`px-3 py-1.5 text-xs rounded-full border capitalize transition ${
                  role === r
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Generated URL Box */}
        <div className="mt-5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Shareable Verification URL
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 select-all"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 focus:ring-2 focus:ring-indigo-600"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
