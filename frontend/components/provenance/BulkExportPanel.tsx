"use client";

import type {
  ProvenanceExportFormat,
  ProvenanceExportMeta,
  ProvenanceRecord,
} from "@stellarveriphy/shared/types";
import {
  buildExportFileName,
  chunkRecords,
  exportMimeType,
  PROVENANCE_EXPORT_DEFAULT_LIMIT,
  PROVENANCE_EXPORT_LIMIT_OPTIONS,
  PROVENANCE_EXPORT_SCHEMA_VERSION,
  serializeRecords,
  validateExportLimit,
  validateRecords,
} from "@stellarveriphy/shared/utils/provenanceExport";
import { useMemo, useRef, useState } from "react";

import { useWallet } from "@/context/WalletContext";
import { resolveExportRole } from "@/lib/provenance/access";

interface BulkExportPanelProps {
  records: ProvenanceRecord[];
}

type QueueStatus = "queued" | "preparing" | "ready" | "started" | "complete" | "failed";

interface ExportQueueItem {
  id: string;
  fileName: string;
  format: ProvenanceExportFormat;
  records: ProvenanceRecord[];
  meta: ProvenanceExportMeta;
  recordCount: number;
  part: number;
  totalParts: number;
  status: QueueStatus;
  blob?: Blob;
  error?: string;
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BulkExportPanel({ records }: BulkExportPanelProps) {
  const { publicKey } = useWallet();
  const role = resolveExportRole(publicKey);
  const [format, setFormat] = useState<ProvenanceExportFormat>("csv");
  const [status, setStatus] = useState<"all" | ProvenanceRecord["status"]>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState<number>(PROVENANCE_EXPORT_DEFAULT_LIMIT);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [queue, setQueue] = useState<ExportQueueItem[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);
  const preparingRef = useRef(false);

  const scope = role === "admin" ? "all" : "own";
  const selected = useMemo(() => {
    const fromTs = from ? new Date(from).getTime() / 1000 : -Infinity;
    const toTs = to ? new Date(to).getTime() / 1000 + 86_399 : Infinity;
    return records
      .filter((r) => scope === "all" || r.creator === publicKey)
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => r.timestamp >= fromTs && r.timestamp <= toTs)
      .sort((a, b) => Number(a.id) - Number(b.id));
  }, [records, scope, publicKey, status, from, to]);

  if (role === "guest") {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
        Connect a wallet to export provenance records. Creators can export the records they own; administrators can export every record.
      </div>
    );
  }

  const prepareItems = async (items: ExportQueueItem[]) => {
    if (preparingRef.current) return;
    preparingRef.current = true;
    setIsPreparing(true);

    for (const item of items) {
      setQueue((current) =>
        current.map((queued) =>
          queued.id === item.id ? { ...queued, status: "preparing", error: undefined } : queued
        )
      );

      await new Promise((resolve) => window.setTimeout(resolve, 0));
      try {
        const content = serializeRecords(item.records, item.format, item.meta);
        const blob = new Blob([content], { type: exportMimeType(item.format) });
        setQueue((current) =>
          current.map((queued) =>
            queued.id === item.id
              ? { ...queued, records: [], blob, status: "ready", error: undefined }
              : queued
          )
        );
      } catch (error) {
        setQueue((current) =>
          current.map((queued) =>
            queued.id === item.id
              ? {
                  ...queued,
                  status: "failed",
                  error: error instanceof Error ? error.message : "Could not prepare this file.",
                }
              : queued
          )
        );
      }
    }

    preparingRef.current = false;
    setIsPreparing(false);
  };

  const handleExport = () => {
    if (preparingRef.current) return;
    const limitError = validateExportLimit(selected.length, limit);
    if (limitError) {
      setValidationError(limitError);
      return;
    }
    const errors = validateRecords(selected);
    if (errors.length) {
      setValidationError(
        `Validation failed: ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ""}`
      );
      return;
    }
    setValidationError(null);

    const now = new Date();
    const chunks = chunkRecords(selected);
    const items = chunks.map((records, index) => {
      const meta = {
        schemaVersion: PROVENANCE_EXPORT_SCHEMA_VERSION,
        exportedAt: now.toISOString(),
        exportedBy: publicKey!,
        scope,
        recordCount: records.length,
        part: index + 1,
        totalParts: chunks.length,
      } as const;
      return {
        id: crypto.randomUUID(),
        fileName: buildExportFileName(format, scope, now, index + 1, chunks.length),
        format,
        records,
        meta,
        recordCount: records.length,
        part: index + 1,
        totalParts: chunks.length,
        status: "queued" as const,
      };
    });

    setQueue((current) => [...current, ...items]);
    void prepareItems(items);
  };

  const startDownload = (item: ExportQueueItem) => {
    if (!item.blob) return;
    try {
      download(item.blob, item.fileName);
    } catch (error) {
      setQueue((current) =>
        current.map((queued) =>
          queued.id === item.id
            ? {
                ...queued,
                error: error instanceof Error ? error.message : "Could not start this download.",
              }
            : queued
        )
      );
      return;
    }
    setQueue((current) =>
      current.map((queued) =>
        queued.id === item.id ? { ...queued, status: "started", error: undefined } : queued
      )
    );
  };

  const preparedCount = queue.filter((item) =>
    ["ready", "started", "complete"].includes(item.status)
  ).length;
  const completedCount = queue.filter((item) => item.status === "complete").length;

  const inputCls =
    "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";

  return (
    <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Role: <span className="font-semibold capitalize">{role}</span> — exporting{" "}
        {scope === "all" ? "all platform records" : "records owned by your wallet"}.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value as ProvenanceExportFormat)} className={inputCls}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="ndjson">NDJSON (streaming)</option>
          </select>
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputCls}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </select>
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Minted from
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Minted to
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Record limit per export
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            aria-describedby="export-limit-hint"
            className={inputCls}
          >
            {PROVENANCE_EXPORT_LIMIT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option.toLocaleString()} records
              </option>
            ))}
          </select>
        </label>
      </div>
      <p id="export-limit-hint" className={`text-xs ${selected.length > limit ? "text-red-700 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
        {selected.length > limit
          ? `${selected.length.toLocaleString()} records match, above the ${limit.toLocaleString()} limit. Narrow the filters or raise the limit before exporting.`
          : `${selected.length.toLocaleString()} records match. Each export must stay within the selected limit.`}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={handleExport}
          disabled={isPreparing || selected.length === 0 || selected.length > limit}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPreparing
            ? "Preparing queue…"
            : `Queue export of ${selected.length.toLocaleString()} records`}
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400 break-all">
          {buildExportFileName(format, scope, new Date())}
        </span>
      </div>
      {validationError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {validationError}
        </p>
      )}
      {queue.length > 0 && (
        <section aria-labelledby="export-queue-heading" className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="export-queue-heading" className="font-semibold text-gray-900 dark:text-white">
              Download queue
            </h3>
            <p aria-live="polite" className="text-xs text-gray-500 dark:text-gray-400">
              Prepared {preparedCount} of {queue.length} file{queue.length === 1 ? "" : "s"}; {completedCount} marked saved
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Export preparation progress"
            aria-valuemin={0}
            aria-valuemax={queue.length}
            aria-valuenow={preparedCount}
            className="h-1.5 overflow-hidden rounded bg-gray-200 dark:bg-gray-700"
          >
            <div
              className="h-full bg-blue-600 transition-[width]"
              style={{ width: `${(preparedCount / queue.length) * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Browser-managed downloads do not report disk completion or byte-level resume. Retry a part to start that file again.
          </p>
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {queue.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium text-gray-900 dark:text-gray-100">
                    {item.fileName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Part {item.part} of {item.totalParts} · {item.recordCount.toLocaleString()} records · {item.status === "started" ? "Download started" : item.status === "complete" ? "Marked saved" : item.status[0].toUpperCase() + item.status.slice(1)}
                  </p>
                  {item.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{item.error}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.status === "failed" && (
                    <button
                      type="button"
                      onClick={() => void prepareItems([item])}
                      disabled={isPreparing}
                      className="rounded border border-red-300 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                    >
                      Retry preparation
                    </button>
                  )}
                  {(item.status === "ready" || item.status === "started" || item.status === "complete") && (
                    <button
                      type="button"
                      onClick={() => startDownload(item)}
                      className="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                      {item.status === "ready" ? "Download" : "Download again"}
                    </button>
                  )}
                  {item.status === "started" && (
                    <button
                      type="button"
                      onClick={() =>
                        setQueue((current) =>
                          current.map((queued) =>
                            queued.id === item.id ? { ...queued, status: "complete" } : queued
                          )
                        )
                      }
                      className="rounded bg-emerald-700 px-2.5 py-1.5 text-xs text-white hover:bg-emerald-800"
                    >
                      Mark saved
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setQueue((current) => current.filter((queued) => queued.id !== item.id))}
                    disabled={isPreparing}
                    aria-label={`Remove ${item.fileName} from queue`}
                    className="rounded px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
