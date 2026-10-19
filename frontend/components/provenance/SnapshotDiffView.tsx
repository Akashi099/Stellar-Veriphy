"use client";

/**
 * SnapshotDiffView.tsx
 *
 * Renders a structured diff between two provenance snapshots.
 * Highlights what changed, when it changed, and which actor introduced the
 * update. Designed for audit trails and dispute resolution workflows.
 */

import type {
  SnapshotDiffResult,
  DiffField,
  DiffChangeType,
} from "@stellarveriphy/shared/utils/snapshotDiff";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length <= 14) return addr;
  return addr.slice(0, 8) + "…" + addr.slice(-6);
}

function truncateHash(hash: string): string {
  if (!hash || hash.length <= 16) return hash;
  return hash.slice(0, 12) + "…" + hash.slice(-8);
}

// ---------------------------------------------------------------------------
// Change type badge
// ---------------------------------------------------------------------------

const CHANGE_STYLE: Record<DiffChangeType, { bg: string; text: string; label: string }> = {
  added: {
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-800 dark:text-emerald-300",
    label: "Added",
  },
  removed: {
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-800 dark:text-red-300",
    label: "Removed",
  },
  modified: {
    bg: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-800 dark:text-amber-300",
    label: "Modified",
  },
  unchanged: {
    bg: "bg-gray-100 dark:bg-gray-700",
    text: "text-gray-600 dark:text-gray-300",
    label: "Unchanged",
  },
};

function ChangeBadge({ type }: { type: DiffChangeType }) {
  const s = CHANGE_STYLE[type];
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single field row
// ---------------------------------------------------------------------------

function DiffRow({ field }: { field: DiffField }) {
  const isHash =
    field.field.includes("Hash") || field.field.includes("hash") || field.field.includes("Ref");

  const formatVal = (v: string | number | boolean | null | undefined) => {
    if (v == null || v === "") return <span className="italic text-gray-400">—</span>;
    const str = String(v);
    return isHash ? (
      <span className="font-mono text-xs break-all" title={str}>
        {truncateHash(str)}
      </span>
    ) : (
      <span className="break-words">{str}</span>
    );
  };

  return (
    <tr className="border-b border-gray-100 dark:border-gray-700 last:border-0">
      <td className="py-3 pr-4 align-top w-1/4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {field.label}
          </span>
          <ChangeBadge type={field.changeType} />
        </div>
      </td>
      <td className="py-3 pr-4 align-top w-[37.5%]">
        <div className="rounded bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 min-h-[2.5rem]">
          {formatVal(field.oldValue)}
        </div>
      </td>
      <td className="py-3 align-top w-[37.5%]">
        <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 min-h-[2.5rem]">
          {formatVal(field.newValue)}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Security / custody alert banners
// ---------------------------------------------------------------------------

function AlertBanner({
  type,
}: {
  type: "security" | "custody";
}) {
  if (type === "security") {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
      >
        <span className="mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true">
          ⚠
        </span>
        <div>
          <p className="font-semibold">Security-critical change detected</p>
          <p className="mt-0.5">
            The manifest hash or attestation hash changed in this snapshot. Verify this change was
            authorized through a legitimate re-verification workflow.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded border border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-900 dark:text-blue-200"
    >
      <span className="mt-0.5 text-blue-600 dark:text-blue-400" aria-hidden="true">
        ℹ
      </span>
      <div>
        <p className="font-semibold">Chain-of-custody change</p>
        <p className="mt-0.5">
          Creator attribution or revocation status changed. Review whether this was an authorized
          governance action.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SnapshotDiffViewProps {
  diff: SnapshotDiffResult;
  /** Optional label for "Snapshot A" (e.g. "v1 — 2026-01-12") */
  labelA?: string;
  /** Optional label for "Snapshot B" */
  labelB?: string;
}

export function SnapshotDiffView({ diff, labelA, labelB }: SnapshotDiffViewProps) {
  const { snapshotA, snapshotB, fields, hasChanges, changedBy, changedAt } = diff;

  return (
    <section className="space-y-5" aria-label="Provenance snapshot diff">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-gray-200 dark:border-gray-700 pb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Snapshot comparison
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Certificate{" "}
          <span className="font-mono text-gray-700 dark:text-gray-200">
            #{diff.certificateId}
          </span>{" "}
          · changed by{" "}
          <span
            className="font-mono text-gray-700 dark:text-gray-200"
            title={changedBy}
          >
            {truncateAddress(changedBy)}
          </span>{" "}
          at {formatTime(changedAt)}
        </p>
      </div>

      {/* Alerts */}
      {diff.hasSecurityChanges && <AlertBanner type="security" />}
      {diff.hasCustodyChanges && <AlertBanner type="custody" />}

      {!hasChanges && (
        <p className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
          No differences found between these two snapshots.
        </p>
      )}

      {hasChanges && (
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800">
                <th className="py-2.5 pl-4 pr-4 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 w-1/4">
                  Field
                </th>
                <th className="py-2.5 pr-4 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 w-[37.5%]">
                  {labelA ?? `Snapshot A · ${formatTime(snapshotA.timestamp)}`}
                </th>
                <th className="py-2.5 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 w-[37.5%]">
                  {labelB ?? `Snapshot B · ${formatTime(snapshotB.timestamp)}`}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {fields.map((field) => (
                <DiffRow key={field.field} field={field} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Explanations */}
      {fields.some((f) => f.explanation) && (
        <details className="rounded border border-gray-200 dark:border-gray-700">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 select-none">
            Field explanations
          </summary>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 px-4 pb-3">
            {fields
              .filter((f) => f.explanation)
              .map((f) => (
                <li key={f.field} className="py-2.5 text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{f.label}: </span>
                  {f.explanation}
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}
