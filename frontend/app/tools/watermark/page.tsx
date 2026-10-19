"use client";

/**
 * Certificate Watermark Tool Page — Issue #463
 */

import { useState } from "react";

import { CertificateWatermark } from "@/components/certificates";
import { Header } from "@/components/Header";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

export default function WatermarkPage() {
  const [certificateId, setCertificateId] = useState("SAMPLE-0001");

  return (
    <main className="min-h-screen bg-white dark:bg-gray-950">
      <Header />
      <div className="mx-auto max-w-4xl px-6">
        <Breadcrumbs />
      </div>
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
          Certificate Watermark
        </h1>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Add a custom watermark to your certificate before downloading or exporting it.
        </p>
        <div className="mb-6 max-w-xs">
          <label htmlFor="cert-id" className="block text-sm text-gray-700 dark:text-gray-300">
            Certificate ID
          </label>
          <input
            id="cert-id"
            type="text"
            value={certificateId}
            onChange={(e) => setCertificateId(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <CertificateWatermark certificateId={certificateId} />
      </div>
    </main>
  );
}
