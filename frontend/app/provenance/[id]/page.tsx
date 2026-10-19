"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { ProvenanceEvent, ProvenanceRecord } from "@stellarveriphy/shared/types";
import { ProvenanceHistoryView } from "@/components/provenance";
import { getCertificateHistory, loadProvenanceDataset, type ProvenanceDataset } from "@/lib/provenance/data";

function exportProvenance(record: ProvenanceRecord, events: ProvenanceEvent[]) {
  const payload = {
    exportedAt: new Date().toISOString(),
    record,
    events,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `provenance-${record.id}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProvenanceHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ProvenanceDataset | null>(null);

  useEffect(() => {
    loadProvenanceDataset().then(setData);
  }, []);

  const record = data?.records.find((r) => r.id === id);
  const events = data && record ? getCertificateHistory(data, record.id) : [];

  return (
    <main id="main-content" className="min-h-screen bg-gray-50 py-8 dark:bg-gray-900">
      {!data ? (
        <p className="text-center text-sm text-gray-500">Loading provenance…</p>
      ) : !record ? (
        <p className="text-center text-sm text-gray-600 dark:text-gray-300">Certificate #{id} was not found.</p>
      ) : (
        <>
          <ProvenanceHistoryView record={record} events={events} />
          <div className="max-w-3xl mx-auto px-6 mt-4 flex flex-wrap items-center gap-4">
            <Link
              href={`/provenance/${id}/audit`}
              className="inline-flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              View snapshot diff &amp; audit trail →
            </Link>
            <button
              type="button"
              onClick={() => exportProvenance(record, events)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export provenance (JSON)
            </button>
          </div>
        </>
      )}
    </main>
  );
}
