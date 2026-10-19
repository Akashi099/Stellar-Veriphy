"use client";

/**
 * OracleAnalyticsDashboard.tsx
 *
 * Operational analytics dashboard for oracle providers.
 * Tracks throughput, attestation health, quality metrics, and latency.
 * Highlights anomalies that require operator action.
 */

import type {
  OracleDashboardData,
  OracleAttestationHealth,
  OracleAnomaly,
  OracleThroughputPoint,
} from "@stellarveriphy/shared";
import { CardGrid } from "@/components/ui/CardGrid";
import { DashboardEmptyState } from "./DashboardEmptyState";

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({
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
    default: "text-gray-900 dark:text-gray-100",
    green: "text-emerald-700 dark:text-emerald-400",
    red: "text-red-700 dark:text-red-400",
    amber: "text-amber-700 dark:text-amber-400",
  }[color];

  return (
    <div className="h-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-4 sm:px-5">
      <p className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health indicator
// ---------------------------------------------------------------------------

const HEALTH_CONFIG = {
  healthy: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", label: "Healthy" },
  degraded: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", label: "Degraded" },
  critical: { dot: "bg-red-500", text: "text-red-700 dark:text-red-400", label: "Critical" },
  unknown: { dot: "bg-gray-400", text: "text-gray-500 dark:text-gray-400", label: "Unknown" },
};

function HealthBadge({ status }: { status: OracleAttestationHealth["status"] }) {
  const cfg = HEALTH_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Provider health table
// ---------------------------------------------------------------------------

function ProviderHealthTable({ providers }: { providers: OracleAttestationHealth[] }) {
  if (providers.length === 0) {
    return (
      <DashboardEmptyState
        heading="No provider health data yet"
        body="Provider health appears after at least one oracle provider has processed a verification."
        actionLabel="Open oracle registry"
        actionHref="/oracles"
      />
    );
  }

  function formatTime(ts: number) {
    if (!ts) return "—";
    return new Date(ts * 1000).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
            <th className="py-2.5 pr-4 text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">Provider</th>
            <th className="py-2.5 pr-4 text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">Health</th>
            <th className="py-2.5 pr-4 text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">Success rate</th>
            <th className="py-2.5 pr-4 text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">Avg latency</th>
            <th className="py-2.5 pr-4 text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">Uptime</th>
            <th className="py-2.5 text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">Last checked</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {providers.map((p) => (
            <tr key={p.providerId} className={p.suspended ? "opacity-60" : ""}>
              <td className="py-3 pr-4">
                <span className="font-mono text-xs text-gray-700 dark:text-gray-300" title={p.providerId}>
                  {p.providerId.length > 16
                    ? p.providerId.slice(0, 8) + "…" + p.providerId.slice(-6)
                    : p.providerId}
                </span>
                {p.suspended && (
                  <span className="ml-2 rounded bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 text-xs text-red-700 dark:text-red-400">
                    Suspended
                  </span>
                )}
                {p.teeHashNearExpiry && (
                  <span className="ml-2 rounded bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                    TEE expiring
                  </span>
                )}
              </td>
              <td className="py-3 pr-4">
                <HealthBadge status={p.status} />
              </td>
              <td className="py-3 pr-4 tabular-nums">
                <span className={p.successRate < 70 ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                  {p.successRate.toFixed(1)}%
                </span>
              </td>
              <td className="py-3 pr-4 tabular-nums">
                <span className={p.avgResponseTimeSeconds > 30 ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}>
                  {p.avgResponseTimeSeconds.toFixed(1)}s
                </span>
              </td>
              <td className="py-3 pr-4 tabular-nums">
                {p.uptimePercent.toFixed(1)}%
              </td>
              <td className="py-3 text-xs text-gray-400 dark:text-gray-500">
                {formatTime(p.lastCheckedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Throughput chart (text-based sparkline for zero-dependency rendering)
// ---------------------------------------------------------------------------

function ThroughputChart({ points }: { points: OracleThroughputPoint[] }) {
  if (points.length === 0) {
    return (
      <DashboardEmptyState
        heading="No throughput data yet"
        body="This chart fills after providers receive verification work."
        actionLabel="Open oracle registry"
        actionHref="/oracles"
      />
    );
  }

  const maxTotal = Math.max(...points.map((p) => p.total), 1);

  return (
    <div className="space-y-1.5" aria-label="Oracle throughput over time">
      {points.map((p) => {
        const widthPct = (p.total / maxTotal) * 100;
        const successPct = p.total > 0 ? (p.successful / p.total) * 100 : 0;
        return (
          <div key={p.timestamp} className="flex items-center gap-3 text-xs">
            <span className="w-28 shrink-0 text-gray-400 dark:text-gray-500 tabular-nums">
              {p.label}
            </span>
            <div className="flex-1 h-5 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden relative">
              {/* Successful bar */}
              <div
                className="absolute left-0 top-0 h-full bg-emerald-400 dark:bg-emerald-600"
                style={{ width: `${(successPct / 100) * widthPct}%` }}
              />
              {/* Failed bar */}
              <div
                className="absolute top-0 h-full bg-red-300 dark:bg-red-700"
                style={{
                  left: `${(successPct / 100) * widthPct}%`,
                  width: `${((p.failed / Math.max(p.total, 1)) * widthPct)}%`,
                }}
              />
            </div>
            <span className="w-14 text-right tabular-nums text-gray-500 dark:text-gray-400">
              {p.total}
            </span>
          </div>
        );
      })}
      <div className="flex items-center gap-3 text-xs pt-1 text-gray-400 dark:text-gray-500">
        <span className="w-28" />
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400 dark:bg-emerald-600" />
          Successful
        </span>
        <span className="flex items-center gap-1 ml-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-300 dark:bg-red-700" />
          Failed
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anomaly list
// ---------------------------------------------------------------------------

const ANOMALY_CONFIG = {
  warning: { bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-300 dark:border-amber-700", text: "text-amber-800 dark:text-amber-200", icon: "⚠" },
  critical: { bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-300 dark:border-red-700", text: "text-red-800 dark:text-red-200", icon: "⊘" },
};

function AnomalyList({ anomalies }: { anomalies: OracleAnomaly[] }) {
  const active = anomalies.filter((a) => !a.resolved);
  if (anomalies.length === 0) {
    return (
      <DashboardEmptyState
        heading="No anomaly history yet"
        body="Anomalies will appear here when analytics has enough provider activity to detect an issue."
        actionLabel="Refresh analytics"
        actionHref="/oracles/analytics"
      />
    );
  }
  if (active.length === 0) {
    return (
      <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
        ✓ No active anomalies detected.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {active.map((a) => {
        const cfg = ANOMALY_CONFIG[a.severity];
        return (
          <li
            key={a.id}
            className={`flex items-start gap-3 rounded border px-4 py-3 text-sm ${cfg.bg} ${cfg.border} ${cfg.text}`}
          >
            <span className="mt-0.5 shrink-0 font-bold" aria-hidden="true">
              {cfg.icon}
            </span>
            <div>
              <p className="font-semibold">{a.description}</p>
              {a.providerId && (
                <p className="mt-0.5 text-xs opacity-70 font-mono">
                  Provider: {a.providerId.length > 20 ? a.providerId.slice(0, 10) + "…" : a.providerId}
                </p>
              )}
              <p className="mt-0.5 text-xs opacity-70">
                Detected {new Date(a.detectedAt * 1000).toLocaleString()}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface OracleAnalyticsDashboardProps {
  data: OracleDashboardData;
  loading?: boolean;
  onRefresh?: () => void;
}

export function OracleAnalyticsDashboard({
  data,
  loading = false,
  onRefresh,
}: OracleAnalyticsDashboardProps) {
  const { quality, providerHealth, throughput, anomalies, snapshotAt } = data;
  const activeAnomalies = anomalies.filter((a) => !a.resolved).length;
  const hasQualityData = quality.totalVerifications > 0 || providerHealth.length > 0 || throughput.length > 0;

  return (
    <section className="space-y-8" aria-label="Oracle analytics dashboard">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-800 dark:text-emerald-400">
            Operations
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Oracle analytics
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Throughput, attestation health, and quality metrics across registered providers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Snapshot: {new Date(snapshotAt).toLocaleString()}
          </p>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {loading ? "Updating…" : "Refresh"}
            </button>
          )}
        </div>
      </div>

      {/* Quality metrics */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400 dark:text-gray-500">
          Quality overview
        </h3>
        {hasQualityData ? <CardGrid layout="compact">
          <MetricCard
            label="Total verifications"
            value={quality.totalVerifications.toLocaleString()}
          />
          <MetricCard
            label="Success rate"
            value={`${quality.overallSuccessRate.toFixed(1)}%`}
            color={quality.overallSuccessRate >= 90 ? "green" : quality.overallSuccessRate >= 70 ? "amber" : "red"}
          />
          <MetricCard
            label="Avg latency"
            value={`${quality.avgLatencySeconds.toFixed(1)}s`}
            color={quality.avgLatencySeconds > 30 ? "amber" : "green"}
          />
          <MetricCard
            label="Active providers"
            value={quality.activeProviderCount}
            color="green"
          />
          <MetricCard
            label="Suspended"
            value={quality.suspendedProviderCount}
            color={quality.suspendedProviderCount > 0 ? "amber" : "default"}
          />
          <MetricCard
            label="Anomalies"
            value={activeAnomalies}
            color={activeAnomalies > 0 ? "red" : "default"}
            sub={activeAnomalies === 0 ? "All clear" : "Require action"}
          />
        </CardGrid> : (
          <DashboardEmptyState
            heading="No quality data yet"
            body="Quality metrics appear after an oracle provider processes its first verification."
            actionLabel="Open oracle registry"
            actionHref="/oracles"
          />
        )}
      </div>

      {/* Anomalies */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400 dark:text-gray-500">
          Active anomalies
        </h3>
        <AnomalyList anomalies={anomalies} />
      </div>

      {/* Provider health */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400 dark:text-gray-500">
          Provider health
        </h3>
        <div className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          <ProviderHealthTable providers={providerHealth} />
        </div>
      </div>

      {/* Throughput */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400 dark:text-gray-500">
          Verification throughput
        </h3>
        <div className="h-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-4 sm:px-5">
          <ThroughputChart points={throughput.slice(-24)} />
        </div>
      </div>
    </section>
  );
}
