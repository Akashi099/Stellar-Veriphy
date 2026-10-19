"use client";

/**
 * DisputeAuditTrail.tsx
 *
 * Renders the full ordered audit history for a content dispute.
 * Each entry shows what action was taken, by whom, when, and any
 * status transition — making the review process fully auditable.
 *
 * Used in:
 *   - Admin moderation detail panel (ItemDetailPanel)
 *   - The dispute status page for the reporting party
 */

import type { DisputeAuditAction, DisputeAuditEntry } from "@/types/dispute";
import { useDisputeAuditTrail } from "@/hooks/useDispute";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<DisputeAuditAction, string> = {
  raised: "Dispute raised",
  evidence_attached: "Evidence attached",
  status_changed: "Status changed",
  assigned: "Assigned to reviewer",
  escalated: "Escalated",
  note_added: "Note added",
  evidence_requested: "Evidence requested",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

const ACTION_COLORS: Record<DisputeAuditAction, string> = {
  raised: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  evidence_attached: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  status_changed: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  assigned: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  escalated: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  note_added: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
  evidence_requested: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  dismissed: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

const ACTION_ICONS: Record<DisputeAuditAction, string> = {
  raised: "⚑",
  evidence_attached: "📎",
  status_changed: "⇄",
  assigned: "👤",
  escalated: "↑",
  note_added: "📝",
  evidence_requested: "?",
  resolved: "✓",
  dismissed: "✕",
};

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Entry row
// ---------------------------------------------------------------------------

function AuditEntryRow({ entry }: { entry: DisputeAuditEntry }) {
  return (
    <li className="flex gap-3">
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ACTION_COLORS[entry.action]}`}
          aria-hidden="true"
        >
          {ACTION_ICONS[entry.action]}
        </span>
        {/* Connector line (hidden on last item via CSS) */}
        <span
          className="mt-1 w-px flex-1 bg-slate-200 dark:bg-slate-700 last-of-type:hidden"
          aria-hidden="true"
        />
      </div>

      {/* Content */}
      <div className="pb-5 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {ACTION_LABELS[entry.action]}
          </span>
          <time
            dateTime={entry.timestamp}
            className="text-xs text-slate-500 dark:text-slate-400"
          >
            {formatTs(entry.timestamp)}
          </time>
        </div>

        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{entry.description}</p>

        {/* Status transition */}
        {entry.previousStatus && entry.newStatus && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="line-through">{entry.previousStatus.replace(/_/g, " ")}</span>
            {" → "}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {entry.newStatus.replace(/_/g, " ")}
            </span>
          </p>
        )}

        {/* Actor */}
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          by{" "}
          <span className="font-mono" title={entry.actor}>
            {truncateAddress(entry.actor)}
          </span>
        </p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component — two variants: loading data itself, or rendering given entries
// ---------------------------------------------------------------------------

interface DisputeAuditTrailProps {
  /**
   * When provided, the component fetches and renders the trail for this dispute ID.
   * Mutually exclusive with `entries`.
   */
  disputeId?: string;
  /**
   * Pre-fetched entries to render directly.
   * Mutually exclusive with `disputeId`.
   */
  entries?: DisputeAuditEntry[];
}

function StaticAuditTrail({ entries }: { entries: DisputeAuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No audit entries yet.
      </p>
    );
  }

  return (
    <ol aria-label="Dispute audit trail" className="space-y-0">
      {entries.map((entry) => (
        <AuditEntryRow key={entry.id} entry={entry} />
      ))}
    </ol>
  );
}

function FetchingAuditTrail({ disputeId }: { disputeId: string }) {
  const { entries, isLoading, error } = useDisputeAuditTrail(disputeId);

  if (isLoading) {
    return (
      <div className="py-8 flex justify-center" aria-label="Loading audit trail">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        Failed to load audit trail: {error}
      </div>
    );
  }

  return <StaticAuditTrail entries={entries} />;
}

export default function DisputeAuditTrail({ disputeId, entries }: DisputeAuditTrailProps) {
  return (
    <section aria-labelledby="audit-trail-heading" className="space-y-4">
      <h3
        id="audit-trail-heading"
        className="text-sm font-semibold text-slate-700 dark:text-slate-300"
      >
        Audit trail
      </h3>
      {entries !== undefined ? (
        <StaticAuditTrail entries={entries} />
      ) : disputeId ? (
        <FetchingAuditTrail disputeId={disputeId} />
      ) : null}
    </section>
  );
}
