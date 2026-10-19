"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Header } from "@/components/Header";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { type AuditLogEntry, auditLogger } from "@/lib/security/auditLogger";

export default function AuditLogsPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"timestamp" | "severity" | "actor" | "action">("timestamp");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [summary, setSummary] = useState({
    totalEntries: 0,
    byCategory: {} as Record<string, number>,
    bySeverity: {} as Record<string, number>,
    tamperProof: true,
  });

  const refresh = async () => {
    const currentEntries = auditLogger.getEntries();
    setEntries(currentEntries);
    setSummary(auditLogger.getSummary());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const logDemoAction = async () => {
    await auditLogger.logEvent({
      actor: "security-operator",
      category: "admin",
      action: "approved verification policy change",
      severity: "critical",
      details: "Triggered from the audit log viewer; requires operational review",
    });
    await refresh();
  };

  const exportReport = () => {
    const report = JSON.stringify(
      {
        retentionDays: auditLogger.getRetentionDays(),
        summary: auditLogger.getSummary(),
        entries: auditLogger.getEntries(),
      },
      null,
      2
    );

    const blob = new Blob([report], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-log-report.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredEntries = entries
    .filter((entry) => categoryFilter === "all" || entry.category === categoryFilter)
    .filter((entry) => severityFilter === "all" || entry.severity === severityFilter)
    .filter((entry) => {
      const haystack = `${entry.actor} ${entry.action} ${entry.details ?? ""}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    })
    .sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      if (sortBy === "severity") {
        const rank = { info: 0, warning: 1, critical: 2 };
        return (rank[a.severity] - rank[b.severity]) * direction;
      }
      return String(a[sortBy]).localeCompare(String(b[sortBy])) * direction;
    });

  const sensitiveActions = filteredEntries.filter(
    (entry) =>
      entry.severity === "critical" ||
      /approve|reject|policy|revoke|delete|verification/i.test(entry.action)
  ).length;

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortDirection(field === "timestamp" || field === "severity" ? "desc" : "asc");
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <Header />
      <div className="mx-auto max-w-6xl px-6">
        <Breadcrumbs variant="dark" />
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <div className="space-y-3">
          <Link href="/tools" className="text-sm text-blue-400 hover:text-blue-300">
            ← Back to tools
          </Link>
          <h1 className="text-4xl font-semibold">Audit Logging</h1>
          <p className="max-w-3xl text-lg text-slate-300">
            Review tamper-evident security events, retention rules, and compliance-oriented
            summaries in one place.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              void logDemoAction();
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-500"
          >
            Log sample admin action
          </button>
          <button
            onClick={exportReport}
            className="rounded-lg border border-slate-700 px-4 py-2 font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            Export audit report
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-400">Total entries</p>
            <p className="mt-2 text-3xl font-semibold text-white">{summary.totalEntries}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-400">Retention</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {auditLogger.getRetentionDays()} days
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-400">Tamper evidence</p>
            <p
              className={`mt-2 text-xl font-semibold ${summary.tamperProof ? "text-emerald-400" : "text-amber-400"}`}
            >
              {summary.tamperProof ? "Chain intact" : "Chain mismatch"}
            </p>
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:grid-cols-4">
          <label className="text-sm text-slate-300">
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="Actor, action, details"
            />
          </label>
          <label className="text-sm text-slate-300">
            Category
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            >
              <option value="all">All categories</option>
              {Object.keys(summary.byCategory).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            Severity
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </label>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            <p className="font-semibold">{sensitiveActions} sensitive actions</p>
            <p className="text-amber-200/80">Critical approvals, rejections, policy and verification changes are flagged.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="mb-4 flex flex-wrap gap-2 text-sm text-slate-400">
            {Object.entries(summary.byCategory).map(([category, count]) => (
              <span key={category} className="rounded-full border border-slate-700 px-3 py-1">
                {category}: {count}
              </span>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-3 py-2">
                    <button onClick={() => toggleSort("timestamp")} className="font-semibold hover:text-slate-200">
                      Timestamp
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button onClick={() => toggleSort("actor")} className="font-semibold hover:text-slate-200">
                      Actor
                    </button>
                  </th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">
                    <button onClick={() => toggleSort("action")} className="font-semibold hover:text-slate-200">
                      Action
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button onClick={() => toggleSort("severity")} className="font-semibold hover:text-slate-200">
                      Severity
                    </button>
                  </th>
                  <th className="px-3 py-2">Review</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const needsReview =
                    entry.severity === "critical" ||
                    /approve|reject|policy|revoke|delete|verification/i.test(entry.action);
                  return (
                    <tr key={entry.id} className="border-b border-slate-800/70 text-slate-200">
                      <td className="px-3 py-2 whitespace-nowrap">{entry.timestamp}</td>
                      <td className="px-3 py-2">{entry.actor}</td>
                      <td className="px-3 py-2">{entry.category}</td>
                      <td className="px-3 py-2">{entry.action}</td>
                      <td className="px-3 py-2">{entry.severity}</td>
                      <td className="px-3 py-2">
                        {needsReview ? (
                          <span className="rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-200">
                            Review
                          </span>
                        ) : (
                          <span className="text-slate-500">Standard</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{entry.details}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
