"use client";

/**
 * Asset Versioning & Rollback Page (#658)
 *
 * Lets creators view the full version history of an asset and perform
 * auditable rollbacks to prior certified versions.
 */

import { useCallback, useEffect, useState } from "react";
import type { ContentVersion, RollbackMetadata } from "@stellarveriphy/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VersionRow({
  version,
  isCurrent,
  onRollback,
  rolling,
}: {
  version: ContentVersion;
  isCurrent: boolean;
  onRollback: (v: ContentVersion) => void;
  rolling: boolean;
}) {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
        v{version.versionNumber}
        {isCurrent && (
          <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded">
            current
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-gray-400 max-w-[180px] truncate">
        {shortHash(version.manifestHash)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
        {formatDate(version.createdAt)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 max-w-[220px] truncate">
        {version.changeLog ?? <span className="text-gray-400 italic">—</span>}
      </td>
      <td className="px-4 py-3 text-right">
        {!isCurrent && (
          <button
            onClick={() => onRollback(version)}
            disabled={rolling}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700 transition-colors"
          >
            Roll back
          </button>
        )}
      </td>
    </tr>
  );
}

function RollbackHistoryTable({ rollbacks }: { rollbacks: RollbackMetadata[] }) {
  if (rollbacks.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
        No rollbacks have been performed for this asset.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left" aria-label="Rollback history">
        <thead>
          <tr className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            <th className="px-4 py-2">From</th>
            <th className="px-4 py-2">To</th>
            <th className="px-4 py-2">Reason</th>
            <th className="px-4 py-2">Initiated by</th>
            <th className="px-4 py-2">Date</th>
          </tr>
        </thead>
        <tbody>
          {rollbacks.map((r) => (
            <tr
              key={r.id}
              className="border-b border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300"
            >
              <td className="px-4 py-2">v{r.fromVersionNumber}</td>
              <td className="px-4 py-2">v{r.toVersionNumber}</td>
              <td className="px-4 py-2 capitalize">{r.reason.replace(/_/g, " ")}</td>
              <td className="px-4 py-2 font-mono text-xs truncate max-w-[160px]">
                {shortHash(r.initiatedBy)}
              </td>
              <td className="px-4 py-2">{new Date(r.initiatedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AssetVersioningPage() {
  const [contentHash, setContentHash] = useState("");
  const [versions, setVersions] = useState<ContentVersion[]>([]);
  const [rollbacks, setRollbacks] = useState<RollbackMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Reason + notes for the rollback confirm dialog
  const [pendingVersion, setPendingVersion] = useState<ContentVersion | null>(null);
  const [rollbackReason, setRollbackReason] = useState<string>("other");
  const [rollbackNotes, setRollbackNotes] = useState("");

  const fetchVersions = useCallback(async () => {
    if (!contentHash.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [vRes, rRes] = await Promise.all([
        fetch(`/api/versions?contentHash=${encodeURIComponent(contentHash)}`),
        fetch(`/api/versions/rollback?contentHash=${encodeURIComponent(contentHash)}`),
      ]);
      const vData = await vRes.json();
      const rData = await rRes.json();
      if (vData.success) setVersions(vData.data);
      if (rData.success) setRollbacks(rData.data);
    } catch {
      setError("Failed to load version history. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [contentHash]);

  const handleRollback = async () => {
    if (!pendingVersion) return;
    setRolling(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/versions/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentHash,
          versionId: pendingVersion.id,
          reason: rollbackReason,
          notes: rollbackNotes || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(
          `Successfully rolled back to v${pendingVersion.versionNumber}. A new version entry has been created.`,
        );
        setPendingVersion(null);
        setRollbackNotes("");
        await fetchVersions();
      } else {
        setError(data.error ?? "Rollback failed.");
      }
    } catch {
      setError("Network error during rollback.");
    } finally {
      setRolling(false);
    }
  };

  const currentVersion = versions.find((v) => v.isCurrentVersion);

  return (
    <main
      id="main-content"
      className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            Asset Version History
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            View all certified versions of an asset and roll back to any prior version. Every
            rollback is recorded immutably for auditability.
          </p>
        </div>

        {/* Search */}
        <section
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6"
          aria-label="Look up asset versions"
        >
          <label
            htmlFor="content-hash"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Content Hash
          </label>
          <div className="flex gap-3">
            <input
              id="content-hash"
              type="text"
              value={contentHash}
              onChange={(e) => setContentHash(e.target.value)}
              placeholder="sha256:…"
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              onKeyDown={(e) => e.key === "Enter" && fetchVersions()}
            />
            <button
              onClick={fetchVersions}
              disabled={loading || !contentHash.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Loading…" : "Load history"}
            </button>
          </div>
        </section>

        {/* Messages */}
        {error && (
          <div role="alert" className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}
        {successMsg && (
          <div role="status" className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300 text-sm">
            {successMsg}
          </div>
        )}

        {/* Version table */}
        {versions.length > 0 && (
          <section
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            aria-label="Version history"
          >
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Versions
                <span className="ml-2 text-gray-400 font-normal">({versions.length} total)</span>
              </h2>
              {currentVersion && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Current: <span className="font-mono">{shortHash(currentVersion.manifestHash)}</span>
                </p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left" aria-label="Versions table">
                <thead>
                  <tr className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-2">Version</th>
                    <th className="px-4 py-2">Manifest Hash</th>
                    <th className="px-4 py-2">Created</th>
                    <th className="px-4 py-2">Change Log</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...versions]
                    .sort((a, b) => b.versionNumber - a.versionNumber)
                    .map((v) => (
                      <VersionRow
                        key={v.id}
                        version={v}
                        isCurrent={v.isCurrentVersion}
                        onRollback={setPendingVersion}
                        rolling={rolling}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Rollback history */}
        {versions.length > 0 && (
          <section
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6"
            aria-label="Rollback history"
          >
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Rollback History
            </h2>
            <RollbackHistoryTable rollbacks={rollbacks} />
          </section>
        )}
      </div>

      {/* Rollback confirmation dialog */}
      {pendingVersion && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rollback-dialog-title"
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3
              id="rollback-dialog-title"
              className="text-base font-semibold text-gray-900 dark:text-gray-100"
            >
              Confirm Rollback to v{pendingVersion.versionNumber}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              This will create a new version entry with the manifest hash from v
              {pendingVersion.versionNumber} and record an immutable rollback audit entry.
            </p>

            <div>
              <label
                htmlFor="rollback-reason"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Reason <span aria-hidden="true">*</span>
              </label>
              <select
                id="rollback-reason"
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="data_corruption">Data corruption</option>
                <option value="incorrect_attestation">Incorrect attestation</option>
                <option value="creator_request">Creator request</option>
                <option value="legal_requirement">Legal requirement</option>
                <option value="operational_error">Operational error</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="rollback-notes"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Notes (optional)
              </label>
              <textarea
                id="rollback-notes"
                value={rollbackNotes}
                onChange={(e) => setRollbackNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                placeholder="Briefly describe why this rollback is needed…"
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => {
                  setPendingVersion(null);
                  setRollbackNotes("");
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRollback}
                disabled={rolling}
                className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {rolling ? "Rolling back…" : "Confirm rollback"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
