"use client";

/**
 * /tools/compliance-audit — Legal and compliance audit trail viewer (#688).
 *
 * Displays compliance-relevant actions tied to provenance events. This page
 * is intended for operators and legal reviewers.
 *
 * SENSITIVE DATA NOTE: This page does not display private keys, credentials,
 * or unredacted personal data. All entries use pseudonymous identifiers.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Filter,
  Shield,
} from "lucide-react";

import { Header } from "@/components/Header";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import {
  complianceAuditTrail,
  type ComplianceActionType,
  type ComplianceLegalBasis,
  type ComplianceSeverity,
  type ComplianceAuditEntry,
} from "@/lib/compliance/complianceAuditTrail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_STYLE: Record<
  ComplianceSeverity,
  { badge: string }
> = {
  routine: { badge: "bg-gray-100 text-gray-700" },
  notable: { badge: "bg-amber-100 text-amber-800" },
  high: { badge: "bg-rose-100 text-rose-900" },
};

const ACTION_LABELS: Record<ComplianceActionType, string> = {
  data_access_request: "Data access request",
  erasure_request: "Erasure request",
  portability_export: "Portability export",
  retention_milestone: "Retention milestone",
  retention_extended: "Retention extended",
  content_dispute_opened: "Dispute opened",
  content_dispute_resolved: "Dispute resolved",
  third_party_disclosure: "Third-party disclosure",
  policy_change: "Policy change",
  dmca_notice: "DMCA notice",
  dmca_counter_notice: "DMCA counter-notice",
  consent_withdrawn: "Consent withdrawn",
  audit_review: "Audit review",
  other: "Other",
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ComplianceAuditPage() {
  const [entries, setEntries] = useState<ComplianceAuditEntry[]>([]);
  const [summary, setSummary] = useState<ReturnType<typeof complianceAuditTrail.getSummary> | null>(
    null
  );
  const [actionTypeFilter, setActionTypeFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const refresh = () => {
    const all = complianceAuditTrail.getEntries();
    setEntries(all);
    setSummary(complianceAuditTrail.getSummary());
  };

  useEffect(() => {
    // Seed a couple of demo entries so the page is non-empty on first visit
    void (async () => {
      if (complianceAuditTrail.getEntries().length === 0) {
        await complianceAuditTrail.record({
          actionType: "data_access_request",
          legalBasis: "data_subject_request",
          actor: "operator:gdpr-team",
          entityId: "CERT-00112",
          entityType: "certificate",
          reason: "GDPR Art. 15 access request — data subject ref DS-2026-001",
          outcome: "completed",
          severity: "notable",
        });
        await complianceAuditTrail.record({
          actionType: "retention_milestone",
          legalBasis: "legal_obligation",
          actor: "system:retention-scheduler",
          entityId: "job-88ab12",
          entityType: "job",
          reason: "90-day off-chain retention window reached for verification job",
          outcome: "off-chain data scheduled for deletion",
          severity: "routine",
        });
      }
      refresh();
    })();
  }, []);

  const exportReport = () => {
    const report = complianceAuditTrail.exportForReview();
    const blob = new Blob([report], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `compliance-audit-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const visible = entries.filter((e) => {
    if (actionTypeFilter !== "all" && e.actionType !== actionTypeFilter) return false;
    if (severityFilter !== "all" && e.severity !== severityFilter) return false;
    if (
      query.trim() &&
      ![e.actionType, e.actor, e.reason, e.outcome, e.entityId ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <main className="min-h-screen bg-[#f4f6f4] text-[#18251f]">
      <Header />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Tools", href: "/tools" },
            { label: "Compliance audit trail" },
          ]}
        />

        {/* Page header */}
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-[#cad3ce] pb-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
              Legal &amp; compliance
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Compliance audit trail</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#52625a]">
              Structured record of compliance-relevant actions tied to provenance events. For
              operator and legal review only. All entries use pseudonymous identifiers — no raw
              personal data or private credentials are stored here.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={refresh}
              className="flex items-center gap-2 rounded border border-[#9baa9f] px-3 py-2 text-sm font-medium hover:bg-white"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={exportReport}
              className="flex items-center gap-2 rounded border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export for review
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <dl className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded border border-[#cad3ce] bg-white px-5 py-4">
              <dt className="text-xs font-semibold uppercase text-[#617168]">Total entries</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums">{summary.totalEntries}</dd>
            </div>
            <div className="rounded border border-[#cad3ce] bg-white px-5 py-4">
              <dt className="text-xs font-semibold uppercase text-[#617168]">High-severity entries</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-rose-700">
                {summary.bySeverity.high ?? 0}
              </dd>
            </div>
            <div className="rounded border border-[#cad3ce] bg-white px-5 py-4">
              <dt className="text-xs font-semibold uppercase text-[#617168]">Chain integrity</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm font-semibold">
                {summary.tamperProof ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                    <span className="text-emerald-700">Verified</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-rose-700" aria-hidden="true" />
                    <span className="text-rose-700">Chain broken — review immediately</span>
                  </>
                )}
              </dd>
            </div>
          </dl>
        )}

        {/* Filters */}
        <div className="mt-6 grid gap-3 border-b border-[#cad3ce] pb-5 sm:grid-cols-[1fr_auto_auto]">
          <label className="block">
            <span className="sr-only">Search entries</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by actor, reason, or entity ID…"
              className="w-full rounded border border-[#aebbb3] bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700"
            />
          </label>
          <label className="block text-sm">
            <span className="sr-only">Filter by action type</span>
            <select
              value={actionTypeFilter}
              onChange={(e) => setActionTypeFilter(e.target.value)}
              className="w-full rounded border border-[#aebbb3] bg-white px-3 py-2"
            >
              <option value="all">All action types</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="sr-only">Filter by severity</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full rounded border border-[#aebbb3] bg-white px-3 py-2"
            >
              <option value="all">All severities</option>
              <option value="routine">Routine</option>
              <option value="notable">Notable</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        {/* Entry list */}
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-[#52625a]">
            <FileText className="h-10 w-10 opacity-30" aria-hidden="true" />
            <p className="text-sm">No compliance entries match the current filters.</p>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-[#cad3ce]">
            {visible.map((entry) => {
              const sev = SEVERITY_STYLE[entry.severity];
              return (
                <li key={entry.id} className="py-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">
                          {ACTION_LABELS[entry.actionType] ?? entry.actionType}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${sev.badge}`}
                        >
                          {entry.severity}
                        </span>
                      </div>
                      <p className="text-xs text-[#617168]">
                        Actor: <span className="font-mono">{entry.actor}</span>
                        {entry.entityId && (
                          <>
                            {" · "}Entity:{" "}
                            <span className="font-mono">
                              {entry.entityType ? `${entry.entityType}:` : ""}
                              {entry.entityId}
                            </span>
                          </>
                        )}
                        {" · "}Legal basis:{" "}
                        <span className="capitalize">{entry.legalBasis.replace(/_/g, " ")}</span>
                      </p>
                      <p className="text-sm text-[#18251f]">{entry.reason}</p>
                      <p className="text-xs text-[#52625a]">
                        Outcome: <span className="font-medium">{entry.outcome}</span>
                      </p>
                    </div>
                    <p className="text-xs text-[#617168] whitespace-nowrap">
                      {formatTimestamp(entry.timestamp)}
                    </p>
                  </div>
                  <p className="mt-2 break-all font-mono text-[10px] text-[#9baa9f]">
                    chain: {entry.chainHash}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {/* Sensitive data notice */}
        <div className="mt-8 flex items-start gap-3 rounded border border-[#cad3ce] bg-white px-5 py-4 text-sm text-[#52625a]">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold text-[#18251f]">Sensitive data guidance</p>
            <p>
              Compliance records must not contain private keys, raw personal data, or session
              credentials. Use pseudonymous identifiers (hashed addresses, role names, stable
              entity IDs) only. See{" "}
              <a
                href="/docs"
                className="font-medium text-emerald-800 underline underline-offset-2"
              >
                docs/legal/privacy-policy.md
              </a>{" "}
              and{" "}
              <a
                href="/docs"
                className="font-medium text-emerald-800 underline underline-offset-2"
              >
                docs/security/key-management.md
              </a>
              .
            </p>
            <p>
              Entries are retained for {7} years in accordance with the documented data retention
              policy.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
