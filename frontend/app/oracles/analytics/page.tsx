"use client";

/**
 * /oracles/analytics
 *
 * Operational analytics dashboard for oracle providers.
 * Shows throughput, attestation health, quality metrics, latency, and anomalies.
 */

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/Header";
import { OracleAnalyticsDashboard } from "@/components/dashboard/OracleAnalyticsDashboard";
import type { OracleDashboardData } from "@stellarveriphy/shared";

export default function OracleAnalyticsPage() {
  const [data, setData] = useState<OracleDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch("/api/oracles/analytics", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load oracle analytics.");
        setData(json as OracleDashboardData);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load oracle analytics.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 60 seconds
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <main className="min-h-screen bg-[#f4f6f4] text-[#18251f]">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-2 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            <span className="mt-0.5 shrink-0">⚠</span>
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-20 rounded bg-gray-200" />
              ))}
            </div>
            <div className="h-48 rounded bg-gray-200" />
          </div>
        )}

        {data && (
          <OracleAnalyticsDashboard
            data={data}
            loading={loading}
            onRefresh={load}
          />
        )}
      </div>
    </main>
  );
}
