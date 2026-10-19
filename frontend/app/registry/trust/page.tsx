"use client";

/**
 * /registry/trust — Public Transparency Dashboard for Registry Trust (#691)
 *
 * Displays registry health, trusted provider status, operational warnings,
 * and verification statistics without exposing private or sensitive details.
 *
 * All data shown here is derived from publicly visible on-chain state.
 * No internal keys, private addresses, or operational credentials are rendered.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  TrendingUp,
  XCircle,
} from "lucide-react";

import { Header } from "@/components/Header";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { cardGridClassName } from "@/components/ui/CardGrid";

// ---------------------------------------------------------------------------
// Types (public-safe — no internal keys or credentials)
// ---------------------------------------------------------------------------

type RegistryHealth = "healthy" | "degraded" | "critical";

interface TrustedProviderSummary {
  /** Shortened public address — last 6 chars only for public display */
  addressSuffix: string;
  status: "active" | "suspended";
  trustLevel: "high" | "moderate" | "low";
  successRate: number;
  teeHashValid: boolean;
}

interface RegistryWarning {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  issuedAt: string;
}

interface VerificationStats {
  totalCertificates: number;
  last24hCertificates: number;
  overallSuccessRate: number;
  activeTrustedProviders: number;
  suspendedProviders: number;
  approvedTeeHashes: number;
}

interface RegistryTrustData {
  health: RegistryHealth;
  healthNote: string;
  warnings: RegistryWarning[];
  providers: TrustedProviderSummary[];
  stats: VerificationStats;
  snapshotAt: string;
}

// ---------------------------------------------------------------------------
// Mock builder — replace with a real /api/registry/trust route in production
// ---------------------------------------------------------------------------

function buildMockData(): RegistryTrustData {
  const now = new Date().toISOString();
  return {
    health: "healthy",
    healthNote:
      "All trusted oracle providers are operating within SLA thresholds. No critical warnings are active.",
    warnings: [
      {
        id: "warn-1",
        severity: "warning",
        message:
          "One provider's TEE code hash is scheduled to expire within 14 days. Renewal is in progress.",
        issuedAt: now,
      },
    ],
    providers: [
      {
        addressSuffix: "…XZ4G2Q",
        status: "active",
        trustLevel: "high",
        successRate: 98.4,
        teeHashValid: true,
      },
      {
        addressSuffix: "…PK7M3R",
        status: "active",
        trustLevel: "moderate",
        successRate: 76.1,
        teeHashValid: false,
      },
      {
        addressSuffix: "…BT9N1W",
        status: "suspended",
        trustLevel: "low",
        successRate: 41.2,
        teeHashValid: false,
      },
    ],
    stats: {
      totalCertificates: 18_340,
      last24hCertificates: 127,
      overallSuccessRate: 94.7,
      activeTrustedProviders: 2,
      suspendedProviders: 1,
      approvedTeeHashes: 4,
    },
    snapshotAt: now,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const HEALTH_CONFIG: Record<
  RegistryHealth,
  { label: string; icon: React.ElementType; bar: string; badge: string }
> = {
  healthy: {
    label: "Healthy",
    icon: ShieldCheck,
    bar: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-900",
  },
  degraded: {
    label: "Degraded",
    icon: ShieldAlert,
    bar: "bg-amber-500",
    badge: "bg-amber-100 text-amber-900",
  },
  critical: {
    label: "Critical",
    icon: XCircle,
    bar: "bg-rose-500",
    badge: "bg-rose-100 text-rose-900",
  },
};

const TRUST_ICON: Record<"high" | "moderate" | "low", React.ElementType> = {
  high: ShieldCheck,
  moderate: ShieldQuestion,
  low: ShieldAlert,
};

const SEVERITY_STYLE: Record<
  RegistryWarning["severity"],
  { wrapper: string; icon: React.ElementType }
> = {
  info: { wrapper: "border-sky-200 bg-sky-50 text-sky-900", icon: CheckCircle2 },
  warning: { wrapper: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle },
  critical: { wrapper: "border-rose-300 bg-rose-50 text-rose-900", icon: XCircle },
};

function StatCard({
  label,
  value,
  sub,
  color = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "green" | "red" | "amber";
}) {
  const valueColor = {
    default: "text-[#18251f]",
    green: "text-emerald-700",
    red: "text-rose-700",
    amber: "text-amber-700",
  }[color];

  return (
    <div className="h-full rounded border border-[#cad3ce] bg-white px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#617168]">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[#617168]">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RegistryTrustPage() {
  const [data, setData] = useState<RegistryTrustData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    // In production, replace with: fetch("/api/registry/trust", { cache: "no-store" })
    Promise.resolve(buildMockData())
      .then((d) => setData(d))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load registry trust data.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const healthCfg = data ? HEALTH_CONFIG[data.health] : null;
  const HealthIcon = healthCfg?.icon ?? Shield;

  return (
    <main className="min-h-screen bg-[#f4f6f4] text-[#18251f]">
      <Header />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {/* Breadcrumbs */}
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Registry", href: "/oracles" },
            { label: "Trust dashboard" },
          ]}
        />

        {/* Page header */}
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-[#cad3ce] pb-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
              Public transparency
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Registry trust dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#52625a]">
              Real-time summary of registry health, trusted provider status, and verification
              statistics. All information is derived from publicly visible on-chain state — no
              private operational details are exposed here.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label="Refresh registry data"
            className="flex items-center gap-2 rounded border border-[#9baa9f] px-3 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div
            role="alert"
            className="my-6 flex items-start gap-2 rounded border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Could not load registry data</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <p role="status" className="py-20 text-center text-sm text-[#52625a]">
            Reading registry state…
          </p>
        )}

        {data && (
          <>
            {/* Overall health banner */}
            <section aria-labelledby="health-heading" className="mt-8">
              <div
                className={`flex items-start gap-4 rounded border p-5 ${healthCfg?.badge ?? ""}`}
              >
                <HealthIcon className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
                <div>
                  <h2
                    id="health-heading"
                    className="text-base font-semibold"
                  >
                    Registry status:{" "}
                    <span className="capitalize">{healthCfg?.label ?? data.health}</span>
                  </h2>
                  <p className="mt-1 text-sm">{data.healthNote}</p>
                  <p className="mt-2 text-xs opacity-75">
                    Snapshot as of {new Date(data.snapshotAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </section>

            {/* Verification statistics */}
            <section aria-labelledby="stats-heading" className="mt-8">
              <h2 id="stats-heading" className="mb-4 text-lg font-semibold">
                Verification statistics
              </h2>
              <div className={cardGridClassName("stats-3")}>
                <StatCard
                  label="Total certificates minted"
                  value={data.stats.totalCertificates.toLocaleString()}
                />
                <StatCard
                  label="Certificates in last 24 h"
                  value={data.stats.last24hCertificates.toLocaleString()}
                  color="green"
                />
                <StatCard
                  label="Overall success rate"
                  value={`${data.stats.overallSuccessRate.toFixed(1)} %`}
                  color={
                    data.stats.overallSuccessRate >= 90
                      ? "green"
                      : data.stats.overallSuccessRate >= 70
                        ? "amber"
                        : "red"
                  }
                />
                <StatCard
                  label="Active trusted providers"
                  value={data.stats.activeTrustedProviders}
                  color="green"
                />
                <StatCard
                  label="Suspended providers"
                  value={data.stats.suspendedProviders}
                  color={data.stats.suspendedProviders > 0 ? "amber" : "default"}
                />
                <StatCard
                  label="Approved TEE code hashes"
                  value={data.stats.approvedTeeHashes}
                  sub="Verified by governance"
                />
              </div>
            </section>

            {/* Operational warnings */}
            {data.warnings.length > 0 && (
              <section aria-labelledby="warnings-heading" className="mt-8">
                <h2 id="warnings-heading" className="mb-4 text-lg font-semibold">
                  Operational warnings
                </h2>
                <ul className="space-y-3">
                  {data.warnings.map((warning) => {
                    const cfg = SEVERITY_STYLE[warning.severity];
                    const Icon = cfg.icon;
                    return (
                      <li
                        key={warning.id}
                        className={`flex items-start gap-3 rounded border px-4 py-3 text-sm ${cfg.wrapper}`}
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <div>
                          <p>{warning.message}</p>
                          <p className="mt-1 text-xs opacity-70">
                            Issued {new Date(warning.issuedAt).toLocaleString()}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Trusted provider directory */}
            <section aria-labelledby="providers-heading" className="mt-8">
              <h2 id="providers-heading" className="mb-4 text-lg font-semibold">
                Trusted provider directory
              </h2>
              <p className="mb-4 text-sm text-[#52625a]">
                Showing aggregated operating metrics for registered oracle providers. Full addresses
                are available on the{" "}
                <a href="/oracles" className="font-medium text-emerald-800 underline underline-offset-2">
                  oracle registry
                </a>{" "}
                page. No private credentials are included in this view.
              </p>
              <div
                role="table"
                aria-label="Trusted provider summary"
                className="overflow-x-auto rounded border border-[#cad3ce]"
              >
                <div role="rowgroup">
                  <div
                    role="row"
                    className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 border-b border-[#cad3ce] bg-[#edf0ed] px-5 py-3 text-xs font-semibold uppercase text-[#617168]"
                  >
                    <span role="columnheader">Provider</span>
                    <span role="columnheader">Status</span>
                    <span role="columnheader">Trust level</span>
                    <span role="columnheader">Success rate</span>
                    <span role="columnheader">TEE hash</span>
                  </div>
                </div>
                <div role="rowgroup">
                  {data.providers.map((provider) => {
                    const TrustIcon = TRUST_ICON[provider.trustLevel];
                    return (
                      <div
                        key={provider.addressSuffix}
                        role="row"
                        className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b border-[#cad3ce] bg-white px-5 py-4 text-sm last:border-none"
                      >
                        <span role="cell" className="font-mono text-xs text-[#617168]">
                          {provider.addressSuffix}
                        </span>
                        <span role="cell">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
                              provider.status === "active"
                                ? "bg-emerald-100 text-emerald-900"
                                : "bg-rose-100 text-rose-900"
                            }`}
                          >
                            {provider.status === "active" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            {provider.status === "active" ? "Active" : "Suspended"}
                          </span>
                        </span>
                        <span role="cell" className="flex items-center gap-1 capitalize">
                          <TrustIcon className="h-4 w-4 text-emerald-800" aria-hidden="true" />
                          {provider.trustLevel}
                        </span>
                        <span
                          role="cell"
                          className={`tabular-nums font-semibold ${
                            provider.successRate >= 90
                              ? "text-emerald-700"
                              : provider.successRate >= 70
                                ? "text-amber-700"
                                : "text-rose-700"
                          }`}
                        >
                          {provider.successRate.toFixed(1)} %
                        </span>
                        <span role="cell">
                          {provider.teeHashValid ? (
                            <span className="flex items-center gap-1 text-emerald-700">
                              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                              <span className="sr-only">Valid</span>
                              Valid
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-700">
                              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                              <span className="sr-only">Expiring or invalid</span>
                              Expiring
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Transparency note */}
            <section className="mt-8 rounded border border-[#cad3ce] bg-white px-5 py-5 text-sm text-[#52625a]">
              <div className="flex items-start gap-3">
                <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                <div className="space-y-2">
                  <p className="font-semibold text-[#18251f]">About this dashboard</p>
                  <p>
                    All metrics shown here are derived from publicly accessible on-chain state on the
                    Stellar network. No private keys, internal credentials, or sensitive operational
                    details are included. Provider addresses are shown as suffixes only; full addresses
                    are on the oracle registry page.
                  </p>
                  <p>
                    Registry governance decisions (approving or revoking TEE code hashes, suspending
                    providers) are executed via the{" "}
                    <code className="rounded bg-[#edf0ed] px-1 text-xs">contracts/registry</code>{" "}
                    Soroban contract and are permanently visible on the Stellar ledger.
                  </p>
                  <p>
                    <a
                      href="/oracles"
                      className="font-medium text-emerald-800 underline underline-offset-2"
                    >
                      View full oracle registry →
                    </a>
                  </p>
                </div>
              </div>
            </section>

            {/* Last updated footer */}
            <p className="mt-6 flex items-center gap-1.5 text-xs text-[#617168]">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Last updated: {new Date(data.snapshotAt).toLocaleString()} · Auto-refreshes every 60
              seconds
            </p>
          </>
        )}
      </div>
    </main>
  );
}
