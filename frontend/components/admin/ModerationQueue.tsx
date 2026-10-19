"use client";

/**
 * ModerationQueue component (#655)
 *
 * Lists disputed assets awaiting admin review. Supports status filtering,
 * status transitions, reviewer assignment, note-taking, and escalation.
 * Every transition is auditable — nothing is silently accepted or dismissed.
 */

import type {
  ModerationQueueItem,
  ModerationQueueSummary,
  ModerationStatus,
} from "@stellarveriphy/shared";
import { useCallback, useEffect, useState } from "react";

import DisputeAuditTrail from "@/components/DisputeAuditTrail";
import { formatDateTime } from "@/utils/formatDateTime";
import { cardGridClassName } from "@/components/ui/CardGrid";
import { type MessageKey,t } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABEL_KEYS: Record<ModerationStatus, MessageKey> = {
  pending: "admin.moderation.status.pending",
  under_review: "admin.moderation.status.under_review",
  approved: "admin.moderation.status.approved",
  rejected: "admin.moderation.status.rejected",
  escalated: "admin.moderation.status.escalated",
  resolved: "admin.moderation.status.resolved",
};

const STATUS_COLORS: Record<ModerationStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  under_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  escalated: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  resolved: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

function StatusBadge({ status }: { status: ModerationStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[status]}`}
    >
      {t(STATUS_LABEL_KEYS[status])}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="h-full bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${accent ?? "text-gray-900 dark:text-gray-100"}`}>
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function ItemDetailPanel({
  item,
  onClose,
  onUpdate,
}: {
  item: ModerationQueueItem;
  onClose: () => void;
  onUpdate: (updated: ModerationQueueItem) => void;
}) {
  const [newStatus, setNewStatus] = useState<ModerationStatus>(item.status);
  const [notes, setNotes] = useState(item.reviewNotes ?? "");
  const [escalateTo, setEscalateTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        status: newStatus,
        reviewNotes: notes || undefined,
      };
      if (escalateTo.trim()) body.escalateTo = escalateTo.trim();

      const res = await fetch(`/api/admin/moderation/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        onUpdate(data.data);
        onClose();
      } else {
        setError(data.error ?? t("admin.moderation.detail.saveError"));
      }
    } catch {
      setError(t("admin.common.networkError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mod-detail-title"
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mt-16 mb-8 p-6 space-y-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="mod-detail-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t("admin.moderation.detail.title")}
            </h2>
            <p className="text-xs font-mono text-gray-400 mt-0.5">{item.id}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("admin.common.close")}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Asset info */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-500 dark:text-gray-400">{t("admin.moderation.detail.assetId")}</dt>
          <dd className="font-mono text-gray-900 dark:text-gray-100 truncate">{item.assetId}</dd>
          <dt className="text-gray-500 dark:text-gray-400">{t("admin.moderation.detail.contentHash")}</dt>
          <dd className="font-mono text-gray-900 dark:text-gray-100 truncate text-xs">{item.contentHash}</dd>
          <dt className="text-gray-500 dark:text-gray-400">{t("admin.moderation.detail.trigger")}</dt>
          <dd className="text-gray-900 dark:text-gray-100 capitalize">{item.trigger.replace(/_/g, " ")}</dd>
          <dt className="text-gray-500 dark:text-gray-400">{t("admin.moderation.detail.reportedBy")}</dt>
          <dd className="font-mono text-gray-900 dark:text-gray-100 truncate text-xs">
            {item.reportedBy ?? <span className="text-gray-400 not-italic">—</span>}
          </dd>
          <dt className="text-gray-500 dark:text-gray-400">{t("admin.moderation.detail.currentStatus")}</dt>
          <dd><StatusBadge status={item.status} /></dd>
        </dl>

        {/* Summary */}
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("admin.moderation.detail.summary")}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded p-3">
            {item.summary}
          </p>
        </div>

        {/* Evidence */}
        {item.evidence && item.evidence.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("admin.moderation.detail.evidence")}</p>
            <ul className="list-disc list-inside text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
              {item.evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <a
          href={`/admin/moderation/${item.id}/evidence`}
          className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          {t("admin.moderation.detail.openEvidence")}
        </a>

        {/* Escalation chain */}
        {item.escalationChain && item.escalationChain.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("admin.moderation.detail.escalationChain")}</p>
            <ol className="text-xs font-mono text-gray-500 dark:text-gray-400 space-y-0.5">
              {item.escalationChain.map((addr, i) => (
                <li key={i}>{i + 1}. {addr}</li>
              ))}
            </ol>
          </div>
        )}

        <hr className="border-gray-100 dark:border-gray-700" />

        {/* Review controls */}
        <div className="space-y-3">
          <div>
            <label htmlFor="mod-status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("admin.moderation.detail.updateStatus")}
            </label>
            <select
              id="mod-status"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as ModerationStatus)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {(Object.keys(STATUS_LABEL_KEYS) as ModerationStatus[]).map((s) => (
                <option key={s} value={s}>{t(STATUS_LABEL_KEYS[s])}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="mod-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("admin.moderation.detail.reviewNotes")}
            </label>
            <textarea
              id="mod-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              placeholder={t("admin.moderation.detail.notesPlaceholder")}
            />
          </div>

          <div>
            <label htmlFor="mod-escalate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("admin.moderation.detail.escalateTo")}
            </label>
            <input
              id="mod-escalate"
              type="text"
              value={escalateTo}
              onChange={(e) => setEscalateTo(e.target.value)}
              placeholder={t("admin.moderation.detail.escalatePlaceholder")}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 font-mono focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {t("admin.moderation.detail.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? t("admin.moderation.detail.saving") : t("admin.moderation.detail.save")}
          </button>
        </div>

        {/* Audit trail — loads the dispute audit trail if a matching dispute ID exists.
            ModerationQueueItem IDs may differ from DisputeRecord IDs; the item id is
            passed here and the API returns an empty array if no entries exist yet. */}
        <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
          <DisputeAuditTrail disputeId={item.id} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  /** Optional fixed status filter applied from the parent page. */
  defaultStatusFilter?: ModerationStatus;
}

export function ModerationQueue({ defaultStatusFilter }: Props) {
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [summary, setSummary] = useState<ModerationQueueSummary>({
    total: 0,
    pending: 0,
    underReview: 0,
    escalated: 0,
    resolvedToday: 0,
  });
  const [statusFilter, setStatusFilter] = useState<string>(defaultStatusFilter ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ModerationQueueItem | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = statusFilter
        ? `/api/admin/moderation?status=${encodeURIComponent(statusFilter)}`
        : "/api/admin/moderation";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setItems(data.data.items);
        setSummary(data.data.summary);
      } else {
        setError(data.error ?? t("admin.moderation.error.load"));
      }
    } catch {
      setError(t("admin.moderation.error.network"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleUpdate = (updated: ModerationQueueItem) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setSummary((prev) => {
      // Recompute pending/underReview from updated list after state settles
      return prev; // full refresh on next cycle
    });
    fetchItems();
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className={cardGridClassName("summary")}>
        <SummaryCard label={t("admin.moderation.summary.total")} value={summary.total} />
        <SummaryCard
          label={t("admin.moderation.summary.pending")}
          value={summary.pending}
          accent="text-yellow-600 dark:text-yellow-400"
        />
        <SummaryCard
          label={t("admin.moderation.summary.underReview")}
          value={summary.underReview}
          accent="text-blue-600 dark:text-blue-400"
        />
        <SummaryCard
          label={t("admin.moderation.summary.escalated")}
          value={summary.escalated}
          accent="text-orange-600 dark:text-orange-400"
        />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <label htmlFor="mod-filter" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t("admin.moderation.filter.label")}
        </label>
        <select
          id="mod-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">{t("admin.moderation.filter.allStatuses")}</option>
          {(Object.keys(STATUS_LABEL_KEYS) as ModerationStatus[]).map((s) => (
            <option key={s} value={s}>{t(STATUS_LABEL_KEYS[s])}</option>
          ))}
        </select>
        <button
          onClick={fetchItems}
          disabled={loading}
          className="ml-auto px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          {loading ? t("admin.moderation.filter.refreshing") : t("admin.moderation.filter.refresh")}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Queue table */}
      {!loading && items.length === 0 && !error && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-lg font-medium">{t("admin.moderation.empty.heading")}</p>
          <p className="text-sm mt-1">{t("admin.moderation.empty.body")}</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left" aria-label={t("admin.moderation.table.label")}>
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Last updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                  <th className="px-4 py-3">{t("admin.moderation.table.asset")}</th>
                  <th className="px-4 py-3">{t("admin.moderation.table.trigger")}</th>
                  <th className="px-4 py-3">{t("admin.moderation.table.status")}</th>
                  <th className="px-4 py-3">{t("admin.moderation.table.created")}</th>
                  <th className="px-4 py-3 text-right">{t("admin.moderation.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[160px]">
                        {item.assetId}
                      </p>
                      <p className="text-xs font-mono text-gray-400 truncate max-w-[160px]">
                        {item.contentHash.slice(0, 16)}…
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 capitalize">
                      {item.trigger.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {formatDateTime(item.createdAt) ?? "Date unavailable"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {formatDateTime(item.updatedAt) ?? "Date unavailable"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelected(item)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700 transition-colors"
                      >
                        {t("admin.moderation.action.review")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <ItemDetailPanel
          item={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}
