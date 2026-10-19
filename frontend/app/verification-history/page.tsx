"use client";

/**
 * Verification History (issue #465)
 *
 * Displays this browser's local history of certificate verification
 * lookups, with date-range filtering, export, and a privacy control to
 * disable/clear tracking.
 */

import { useEffect, useState } from "react";

import { Header } from "@/components/Header";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import {
  clearVerificationHistory,
  exportVerificationHistory,
  getVerificationHistory,
  isHistoryTrackingEnabled,
  setHistoryTrackingEnabled,
  type VerificationHistoryEntry,
} from "@/lib/verificationHistory";

const STATUS_COLORS: Record<string, string> = {
  verified: "text-emerald-400",
  not_found: "text-slate-400",
  error: "text-red-400",
  revoked: "text-amber-400",
};

export default function VerificationHistoryPage() {
  const [entries, setEntries] = useState<VerificationHistoryEntry[]>([]);
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const refresh = (filters: { startDate?: Date; endDate?: Date } = {}) => {
    setEntries(getVerificationHistory(filters));
  };

  useEffect(() => {
    setTrackingEnabled(isHistoryTrackingEnabled());
    refresh();
  }, []);

  const applyDateFilter = () => {
    refresh({
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
    });
  };

  const toggleTracking = () => {
    const next = !trackingEnabled;
    setHistoryTrackingEnabled(next);
    setTrackingEnabled(next);
  };

  const handleClear = () => {
    if (!confirm("Clear all locally stored verification history? This cannot be undone.")) return;
    clearVerificationHistory();
    refresh();
  };

  const handleExport = () => {
    const blob = new Blob([exportVerificationHistory()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `verification-history-${dateStr}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <Header />
      <div className="mx-auto max-w-5xl px-6">
        <Breadcrumbs variant="dark" />
      </div>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold">Verification History</h1>
          <p className="max-w-3xl text-lg text-slate-300">
            A local, browser-only record of certificates you&apos;ve looked up or verified. Nothing
            here is sent to a server.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-300">
              History tracking is{" "}
              <strong className={trackingEnabled ? "text-emerald-400" : "text-red-400"}>
                {trackingEnabled ? "on" : "off"}
              </strong>
            </span>
            <button
              type="button"
              onClick={toggleTracking}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-slate-800"
            >
              {trackingEnabled ? "Turn off tracking" : "Turn on tracking"}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={entries.length === 0}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              Export history (JSON)
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={entries.length === 0}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
            >
              Clear history
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              From
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              To
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={applyDateFilter}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
            >
              Apply filter
            </button>
            <button
              type="button"
              onClick={() => {
                setStartDate("");
                setEndDate("");
                refresh();
              }}
              className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-slate-200"
            >
              Reset
            </button>
          </div>

          {entries.length === 0 ? (
            <p className="text-slate-400">No verification history recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Timestamp</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Query</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-800/70 text-slate-200">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">{entry.method}</td>
                      <td className="px-3 py-2 font-mono">{entry.query}</td>
                      <td className={`px-3 py-2 ${STATUS_COLORS[entry.status] ?? ""}`}>
                        {entry.status.replace("_", " ")}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{entry.details ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
