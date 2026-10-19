"use client";

import { useEffect, useState } from "react";
import type { ProvenanceRecord } from "@stellarveriphy/shared/types";
import { BulkExportPanel } from "@/components/provenance";
import { loadProvenanceDataset } from "@/lib/provenance/data";

export default function ProvenanceExportPage() {
  const [records, setRecords] = useState<ProvenanceRecord[] | null>(null);

  useEffect(() => {
    loadProvenanceDataset().then((d) => setRecords(d.records));
  }, []);

  return (
    <main id="main-content" className="min-h-screen bg-gray-50 py-8 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl space-y-4 px-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Bulk export provenance records</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Download provenance records for audits, research and compliance. See <code>docs/provenance_export.md</code> for the format.
        </p>
        {records ? <BulkExportPanel records={records} /> : <p className="text-sm text-gray-500">Loading records…</p>}
      </div>
    </main>
  );
}
