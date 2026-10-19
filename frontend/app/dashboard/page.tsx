"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MetricsCards, RecentActivityTimeline } from "@/components/dashboard";
import { TableSkeleton } from "@/components/ui/Skeleton";
import {
  computeMetrics,
  loadProvenanceDataset,
  type DashboardMetrics,
  type ProvenanceDataset,
} from "@/lib/provenance/data";

export default function DashboardPage() {
  const [data, setData] = useState<ProvenanceDataset | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    loadProvenanceDataset().then((d) => {
      setData(d);
      setMetrics(computeMetrics(d));
    });
  }, []);

  return (
    <main id="main-content" className="min-h-screen bg-gray-50 py-8 dark:bg-gray-900">
      <div className="mx-auto max-w-6xl space-y-6 px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
          <Link href="/provenance/export" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
            Bulk export records →
          </Link>
        </div>

        {/* Metrics cards — renders its own skeleton while metrics === null */}
        <MetricsCards metrics={metrics} />

        {/* Recent activity — reserve matching space until data arrives */}
        {data ? (
          <RecentActivityTimeline events={data.events} />
        ) : (
          <div
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            aria-label="Loading recent activity"
          >
            <div className="mb-4 h-6 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
            <TableSkeleton rows={5} cols={2} />
          </div>
        )}
      </div>
    </main>
  );
}
