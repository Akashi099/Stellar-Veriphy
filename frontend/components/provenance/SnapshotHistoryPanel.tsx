"use client";

/**
 * SnapshotHistoryPanel.tsx
 *
 * Shows a list of provenance snapshots for a certificate and lets the user
 * select any two to compare via SnapshotDiffView.
 */

import { useState } from "react";
import type { SnapshotRecord } from "@stellarveriphy/shared/utils/snapshotDiff";
import { computeSnapshotDiff } from "@stellarveriphy/shared/utils/snapshotDiff";
import { SnapshotDiffView } from "./SnapshotDiffView";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(s: string, len = 14) {
  if (!s || s.length <= len) return s;
  return s.slice(0, 8) + "…" + s.slice(-4);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SnapshotHistoryPanelProps {
  snapshots: SnapshotRecord[];
  /** Whether data is still loading */
  loading?: boolean;
}

export function SnapshotHistoryPanel({ snapshots, loading = false }: SnapshotHistoryPanelProps) {
  const [selectedA, setSelectedA] = useState<string | null>(
    snapshots.length >= 2 ? snapshots[snapshots.length - 2].id : null,
  );
  const [selectedB, setSelectedB] = useState<string | null>(
    snapshots.length >= 1 ? snapshots[snapshots.length - 1].id : null,
  );

  const snapshotA = snapshots.find((s) => s.id === selectedA);
  const snapshotB = snapshots.find((s) => s.id === selectedB);
  const diff = snapshotA && snapshotB && snapshotA.id !== snapshotB.id
    ? computeSnapshotDiff(snapshotA, snapshotB)
    : null;

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded bg-gray-100 dark:bg-gray-700" />
        ))}
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
        No snapshots recorded for this certificate.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Snapshot selector */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="snapshot-a"
            className="block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-1.5"
          >
            Baseline snapshot
          </label>
          <select
            id="snapshot-a"
            value={selectedA ?? ""}
            onChange={(e) => setSelectedA(e.target.value)}
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
          >
            <option value="">— select baseline —</option>
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {formatTime(s.timestamp)} · by {truncate(s.actor)} ·{" "}
                {truncate(s.manifestHash, 16)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="snapshot-b"
            className="block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-1.5"
          >
            Compare against
          </label>
          <select
            id="snapshot-b"
            value={selectedB ?? ""}
            onChange={(e) => setSelectedB(e.target.value)}
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
          >
            <option value="">— select snapshot —</option>
            {snapshots.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === selectedA}>
                {formatTime(s.timestamp)} · by {truncate(s.actor)} ·{" "}
                {truncate(s.manifestHash, 16)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Snapshot list overview */}
      <details>
        <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-300 select-none">
          All snapshots ({snapshots.length})
        </summary>
        <ol className="mt-3 divide-y divide-gray-100 dark:divide-gray-700 rounded border border-gray-200 dark:border-gray-700">
          {[...snapshots].reverse().map((s, idx) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
              <span className="text-gray-400 dark:text-gray-500 w-5 text-right">
                {snapshots.length - idx}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 dark:text-gray-200">
                  {formatTime(s.timestamp)}
                </p>
                <p className="text-gray-500 dark:text-gray-400 font-mono break-all">
                  {s.manifestHash}
                </p>
              </div>
              <span className="text-gray-400 dark:text-gray-500 font-mono shrink-0">
                {truncate(s.actor)}
              </span>
            </li>
          ))}
        </ol>
      </details>

      {/* Diff */}
      {diff ? (
        <SnapshotDiffView
          diff={diff}
          labelA={`Snapshot ${snapshots.findIndex((s) => s.id === selectedA) + 1} · ${formatTime(snapshotA!.timestamp)}`}
          labelB={`Snapshot ${snapshots.findIndex((s) => s.id === selectedB) + 1} · ${formatTime(snapshotB!.timestamp)}`}
        />
      ) : selectedA && selectedB && selectedA === selectedB ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select two different snapshots to compare.
        </p>
      ) : !selectedA || !selectedB ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select a baseline and a comparison snapshot above.
        </p>
      ) : null}
    </div>
  );
}
