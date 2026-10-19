"use client";

import { useState } from "react";

import { HashComparison } from "@/components/HashComparison";
import { WizardPageShell } from "@/src/features/verification/components/WizardPageShell";
import { useWizardStore } from "@/src/features/verification/store/wizard.store";
import type { ManifestData } from "@/src/features/verification/types/wizard.types";
import { hashFile } from "@/utils/hashing";

function HashComparisonView() {
  return (
    <main>
      <h1>Verify a file</h1>
      <p>Check whether a file is exactly the one recorded in a StellarVeriphy provenance record.</p>
      <HashComparison />
    </main>
  );
}

const STEP_CONFIGS = [
  {
    title: "Select Verification Mode",
    description: "Choose how you want to verify your content",
  },
  {
    title: "Upload Media",
    description: "Select the media file you want to verify",
  },
  {
    title: "Attach Manifest",
    description: "Provide the manifest file with metadata",
  },
  {
    title: "SPV Options",
    description: "Configure verification options",
  },
  {
    title: "Review and Submit",
    description: "Review your verification details before submitting",
  },
];

function VerifyPageContent() {
  const {
    currentStep,
    mode,
    fileInfo,
    contentHash,
    manifest,
    manifestHash,
    hashProgress,
    encryptionEnabled,
    setMode,
    setFile,
    setContentHash,
    setHashProgress,
    setManifest,
    setManifestHash,
    setStepComplete,
    setEncryptionEnabled,
  } = useWizardStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHashing, setIsHashing] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [manifestError, setManifestError] = useState("");

  const config = STEP_CONFIGS[Math.min(currentStep, STEP_CONFIGS.length - 1)]!;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // TODO: Implement actual submission logic
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMediaSelect = async (file?: File) => {
    if (!file) return;
    setFile({ name: file.name, size: file.size, type: file.type });
    setContentHash("");
    setStepComplete(1, false);
    setMediaError("");
    if (file.size === 0) {
      setMediaError("Choose a file that contains data.");
      return;
    }

    setIsHashing(true);
    setHashProgress(0);
    try {
      const hash = await hashFile(file, setHashProgress);
      setContentHash(hash);
      setStepComplete(1, true);
    } catch {
      setMediaError(
        "The file could not be read to calculate its SHA-256 hash. Try selecting it again."
      );
    } finally {
      setIsHashing(false);
    }
  };

  const handleManifestSelect = async (file?: File) => {
    if (!file) return;
    setManifest(null);
    setManifestHash("");
    setStepComplete(2, false);
    setManifestError("");

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".json") && !lowerName.endsWith(".xml")) {
      setManifestError("Choose a .json or .xml manifest file.");
      return;
    }

    setIsHashing(true);
    setHashProgress(0);
    try {
      const content = await file.text();
      if (!content.trim()) throw new Error("The manifest file is empty.");

      let parsedManifest: ManifestData;
      if (lowerName.endsWith(".json")) {
        const parsed: unknown = JSON.parse(content);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("A JSON manifest must contain an object.");
        }
        parsedManifest = parsed as ManifestData;
      } else {
        parsedManifest = { xml: content };
      }

      const hash = await hashFile(file, setHashProgress);
      setManifest(parsedManifest);
      setManifestHash(hash);
      setStepComplete(2, true);
    } catch (error) {
      setManifestError(error instanceof Error ? error.message : "The manifest could not be read.");
    } finally {
      setIsHashing(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <p className="text-gray-700 dark:text-gray-300">
              Select the verification mode for your content.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setMode("standard")}
                aria-pressed={mode === "standard"}
                className={`w-full rounded-lg border-2 p-4 text-left ${mode === "standard" ? "border-blue-600 bg-blue-50 dark:bg-blue-950" : "border-gray-300 hover:border-blue-600 dark:border-gray-600 dark:hover:border-blue-500"}`}
              >
                Mode 1: Standard Verification
              </button>
              <button
                type="button"
                onClick={() => setMode("advanced")}
                aria-pressed={mode === "advanced"}
                className={`w-full rounded-lg border-2 p-4 text-left ${mode === "advanced" ? "border-blue-600 bg-blue-50 dark:bg-blue-950" : "border-gray-300 hover:border-blue-600 dark:border-gray-600 dark:hover:border-blue-500"}`}
              >
                Mode 2: Advanced Verification
              </button>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <p className="text-gray-700 dark:text-gray-300">
              Upload the media file you want to verify.
            </p>
            <input
              type="file"
              onChange={(event) => void handleMediaSelect(event.currentTarget.files?.[0])}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-700 dark:file:text-blue-400"
            />
            {fileInfo && (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Selected: {fileInfo.name} ({fileInfo.size.toLocaleString()} bytes)
              </p>
            )}
            {isHashing && (
              <p role="status" className="text-sm text-blue-700 dark:text-blue-300">
                Calculating SHA-256… {Math.round(hashProgress)}%
              </p>
            )}
            {contentHash && (
              <p className="break-all font-mono text-xs text-gray-600 dark:text-gray-300">
                SHA-256: {contentHash}
              </p>
            )}
            {mediaError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {mediaError}
              </p>
            )}
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <p className="text-gray-700 dark:text-gray-300">
              Attach the manifest file with metadata.
            </p>
            <input
              type="file"
              accept=".json,.xml,application/json,application/xml,text/xml"
              onChange={(event) => void handleManifestSelect(event.currentTarget.files?.[0])}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-700 dark:file:text-blue-400"
            />
            {manifest && (
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                Manifest parsed and ready.
              </p>
            )}
            {manifestHash && (
              <p className="break-all font-mono text-xs text-gray-600 dark:text-gray-300">
                SHA-256: {manifestHash}
              </p>
            )}
            {isHashing && currentStep === 2 && (
              <p role="status" className="text-sm text-blue-700 dark:text-blue-300">
                Reading and hashing manifest… {Math.round(hashProgress)}%
              </p>
            )}
            {manifestError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {manifestError}
              </p>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <p className="text-gray-700 dark:text-gray-300">Configure your verification options.</p>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={encryptionEnabled}
                onChange={(e) => setEncryptionEnabled(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-gray-700 dark:text-gray-300">
                Encrypt the verification request (optional)
              </span>
            </label>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <p className="text-gray-700 dark:text-gray-300">
              Your files are ready. Review the captured hashes, then submit the verification
              request.
            </p>
            <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Content SHA-256
                </p>
                <p className="break-all font-mono text-sm text-gray-900 dark:text-white">
                  {contentHash}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Manifest SHA-256
                </p>
                <p className="break-all font-mono text-sm text-gray-900 dark:text-white">
                  {manifestHash}
                </p>
              </div>
              <p className="text-sm text-blue-900 dark:text-blue-200">
                Ready to submit; verification results will be available after processing.
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <WizardPageShell
      title={config.title}
      description={config.description}
      onSubmit={handleSubmit}
      isLoading={isSubmitting}
      chainFeature="verification-submission"
    >
      <div className="space-y-6">
        {renderStepContent()}
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Step {currentStep + 1} of {STEP_CONFIGS.length}
        </div>
      </div>
    </WizardPageShell>
  );
}

export default function VerifyPage() {
  const [view, setView] = useState<"compare" | "wizard">("compare");

  return (
    <div>
      <nav
        aria-label="Verification tools"
        className="flex gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-6"
      >
        <button
          type="button"
          aria-pressed={view === "compare"}
          onClick={() => setView("compare")}
          className={`min-h-11 rounded px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${view === "compare" ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"}`}
        >
          Hash comparison
        </button>
        <button
          type="button"
          aria-pressed={view === "wizard"}
          onClick={() => setView("wizard")}
          className={`min-h-11 rounded px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${view === "wizard" ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"}`}
        >
          Guided verification
        </button>
      </nav>
      {view === "compare" ? <HashComparisonView /> : <VerifyPageContent />}
    </div>
  );
}
