"use client";

/**
 * Advanced Manifest Editor Demo Page — Issue #216
 */

import { useState } from "react";

import { Header } from "@/components/Header";
import {
  AdvancedManifestEditor,
  type AdvancedManifestValue,
} from "@/components/manifest/AdvancedManifestEditor";
import { AutoSaveIndicator } from "@/components/ui/AutoSaveIndicator";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { useAutoSave } from "@/hooks/useAutoSave";

export default function AdvancedManifestEditorPage() {
  const [currentManifest, setCurrentManifest] = useState<AdvancedManifestValue | null>(null);

  const { state: autoSaveState } = useAutoSave({
    key: "advanced-manifest-editor",
    data: currentManifest,
    interval: 15000,
  });

  return (
    <main className="min-h-screen bg-white dark:bg-gray-950">
      <Header />
      <div className="max-w-5xl mx-auto px-6">
        <Breadcrumbs />
      </div>
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
              Advanced Manifest Editor
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Rich manifest editor with real-time JSON schema validation, field-type enforcement,
              required-field indicators, auto-complete for common fields, validation error messages,
              format suggestions, and a schema version selector.
            </p>
          </div>
          <AutoSaveIndicator
            lastSaved={autoSaveState.lastSaved}
            isSaving={autoSaveState.isSaving}
            hasUnsaved={autoSaveState.hasUnsaved}
            className="mt-1 shrink-0"
          />
        </div>

        <AdvancedManifestEditor
          onChange={(value) => setCurrentManifest(value)}
          className="bg-gray-50 dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-800"
        />

        {currentManifest && (
          <div className="mt-8 p-6 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-700 rounded-xl">
            <h2 className="text-lg font-semibold text-green-800 dark:text-green-300 mb-3">
              ✓ Valid Manifest
            </h2>
            <p className="text-sm text-green-700 dark:text-green-400 mb-4">
              This manifest is valid and ready to be submitted to the blockchain.
            </p>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([JSON.stringify(currentManifest, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `manifest-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
            >
              Download Manifest
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
