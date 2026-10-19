"use client";

/**
 * /provenance/[id]/audit
 *
 * Provenance snapshot diff and audit trail for a certificate.
 * Supports audit and incident response workflows.
 */

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { SnapshotHistoryPanel } from "@/components/provenance/SnapshotHistoryPanel";
import type { SnapshotRecord } from "@stellarveriphy/shared/utils/snapshotDiff";

interface PageProps {
  params: { id: string };
}

export default function ProvenanceAuditPage({ params }: PageProps) {
  const { id } = params;
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/provenance/${id}/snapshots`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load snapshots.");
        setSnapshots(data.snapshots ?? []);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Could not load snapshot history.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  return (
    <main className="min-h-screen bg-[#f4f6f4] text-[#18251f]">
      <Header />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="border-b border-[#cad3ce] pb-6 mb-8">
          <p className="text-sm font-semibold uppercase text-emerald-800">Audit trail</p>
          <h1 className="mt-2 text-3xl font-semibold">Snapshot diff</h1>
          <p className="mt-2 text-sm text-[#52625a] max-w-2xl">
            Compare provenance snapshots to understand what changed, when it changed, and which
            actor or operator introduced the update. Use this for auditability and dispute
            resolution.
          </p>
          <p className="mt-2 font-mono text-sm text-[#617168]">Certificate #{id}</p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-2 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            <span className="mt-0.5 shrink-0">⚠</span>
            {error}
          </div>
        )}

        <div className="rounded border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <SnapshotHistoryPanel snapshots={snapshots} loading={loading} />
        </div>
      </div>
    </main>
  );
}
