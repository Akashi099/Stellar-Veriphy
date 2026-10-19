"use client";

/**
 * /tools/manifest-redaction
 *
 * Controlled metadata redaction tool — allows creators to hide or partially
 * release sensitive metadata fields while preserving proof integrity.
 */

import { useState } from "react";
import { Header } from "@/components/Header";
import { MetadataRedactionPanel } from "@/components/manifest/MetadataRedactionPanel";
import type { ContentManifest } from "@stellarveriphy/shared";
import type { RedactionPolicy, RedactedManifest } from "@stellarveriphy/shared/utils/metadataRedaction";

// Demonstration manifest for the tool page
const DEMO_MANIFEST: ContentManifest = {
  schemaVersion: "2.0.0",
  contentHash: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  creator: "GCREATOR7EXAMPLE000000000000000000000000000000000000000000000",
  timestamp: new Date().toISOString(),
  metadata: {
    device: "Canon EOS R5",
    location: "New York, USA",
    aiModel: undefined,
  },
  media: {
    fileName: "portrait-session-2026-09.jpg",
    fileType: "image/jpeg",
    fileSizeBytes: 8_432_100,
  },
};

const DEMO_HASH = "a1b2c3d4e5f601234567890abcdef01234567890abcdef01234567890abcdef0";
const DEMO_CERT_ID = "42";
const DEMO_USER = "GCREATOR7EXAMPLE000000000000000000000000000000000000000000000";

export default function ManifestRedactionPage() {
  const [saved, setSaved] = useState<{ policy: RedactionPolicy; redacted: RedactedManifest } | null>(null);

  function handleSave(policy: RedactionPolicy, redacted: RedactedManifest) {
    setSaved({ policy, redacted });
  }

  return (
    <main className="min-h-screen bg-[#f4f6f4] text-[#18251f]">
      <Header />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="border-b border-[#cad3ce] pb-6 mb-8">
          <p className="text-sm font-semibold uppercase text-emerald-800">Privacy & governance</p>
          <h1 className="mt-2 text-3xl font-semibold">Metadata redaction</h1>
          <p className="mt-2 text-sm text-[#52625a] max-w-2xl">
            Hide or partially release sensitive metadata fields while preserving proof integrity.
            Designed for privacy-sensitive creators and regulated industries.
          </p>
        </div>

        <MetadataRedactionPanel
          manifest={DEMO_MANIFEST}
          manifestHash={DEMO_HASH}
          certificateId={DEMO_CERT_ID}
          currentUser={DEMO_USER}
          onPolicySaved={handleSave}
        />

        {saved && (
          <div className="mt-6 rounded border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 px-5 py-4 text-sm text-emerald-800 dark:text-emerald-200">
            <p className="font-semibold">Redaction policy saved</p>
            <p className="mt-1">
              Policy ID:{" "}
              <span className="font-mono">{saved.policy.id}</span> ·{" "}
              {saved.redacted.redactedFields.filter((f) => f.visibility !== "public").length} field(s)
              redacted. Pending governance review.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
