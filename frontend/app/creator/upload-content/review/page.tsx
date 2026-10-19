"use client";

import type { UploadMetadata } from "@stellarveriphy/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useWizard } from "@/context/WizardContext";
import { ApiError, api, type RetryUpdate } from "@/lib/api";
import { RetryableError } from "@/components/ui/RetryableError";
import { ShortcutHint } from "@/components/ui/ShortcutHint";

function downloadManifest(manifest: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type SubmitState = "idle" | "uploading" | "retrying" | "queued" | "failed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function retryMessage(update: RetryUpdate): string {
  return `Transient ${update.reason}; retrying attempt ${update.attempt + 1} of ${update.maxAttempts} in ${Math.ceil(update.delayMs / 1000)}s.`;
}

export default function ReviewPage() {
  const router = useRouter();
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [failureDetails, setFailureDetails] = useState("");
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const {
    mode,
    file,
    contentHash,
    advancedContentHash,
    advancedManifestHash,
    manifest,
    manifestHash,
  } = useWizard();

  const handleDownloadManifest = () => {
    if (manifest) {
      const filename = `asset-manifest-${new Date().toISOString().slice(0, 10)}.json`;
      downloadManifest(manifest, filename);
    }
  };

  const handleSubmit = async () => {
    const activeContentHash = mode === "advanced" ? advancedContentHash : contentHash;
    const activeManifestHash = mode === "advanced" ? advancedManifestHash : manifestHash;

    if (!activeContentHash || !activeManifestHash || !isRecord(manifest)) {
      setSubmitState("failed");
      setFailureDetails("Missing content hash or manifest data. Go back and complete the upload steps first.");
      return;
    }

    const creator = typeof manifest.creator === "string" ? manifest.creator : "";
    if (!creator) {
      setSubmitState("failed");
      setFailureDetails("The manifest needs a creator public key before verification can be submitted.");
      return;
    }

    const retry = {
      maxAttempts: 4,
      baseDelayMs: 800,
      maxDelayMs: 6000,
      onRetry: (update: RetryUpdate) => {
        setSubmitState("retrying");
        setStatusMessage(retryMessage(update));
      },
    };

    setSubmitState("uploading");
    setStatusMessage("Registering upload metadata.");
    setFailureDetails("");
    setSubmitError(null);

    try {
      const uploadMetadata: UploadMetadata = {
        fileName: file?.name ?? "advanced-verification.pdf",
        mimeType: file?.type || "application/pdf",
        fileSize: file?.size ?? 1,
        contentHash: activeContentHash,
        creator,
        tags: Array.isArray(manifest.tags)
          ? manifest.tags.filter((tag): tag is string => typeof tag === "string")
          : [],
        manifest: manifest as never,
      };
      if (typeof manifest.title === "string") uploadMetadata.title = manifest.title;
      if (typeof manifest.description === "string") uploadMetadata.description = manifest.description;

      const upload = await api.createUpload(
        uploadMetadata,
        { retry }
      );

      setSubmitState("uploading");
      setStatusMessage("Upload registered. Queueing verification job.");
      const job = await api.createJob(upload.id, { retry });
      setSubmitState("queued");
      setStatusMessage(`Verification job ${job.id} is queued. Queue position: ${job.queuePosition ?? "processing soon"}.`);
      console.info("Upload submitted for verification", {
        uploadId: upload.id,
        jobId: job.id,
        contentHash: activeContentHash,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Upload submission failed.";
      setSubmitState("failed");
      setFailureDetails(message);
      setSubmitError(error instanceof ApiError && error.isRetryable ? error : null);
      setStatusMessage("");
      console.error("Upload submission failed", {
        mode,
        contentHash: activeContentHash,
        error,
      });
    }
  };

  const isSubmitting = submitState === "uploading" || submitState === "retrying";

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !isSubmitting && submitState === "idle") {
        event.preventDefault();
        void handleSubmit();
      }
    };
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [isSubmitting, submitState, handleSubmit]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Review Verification</h2>
        {manifest && (
          <button
            onClick={handleDownloadManifest}
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            title="Download manifest as JSON"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download Manifest
          </button>
        )}
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <p className="text-sm text-gray-600">Mode</p>
        <p className="font-semibold capitalize">{mode}</p>
      </div>

      {mode === "standard" && file && (
        <>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">File</p>
            <p className="font-semibold">{file.name}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Content Hash</p>
            <p className="font-mono text-sm break-all">{contentHash}</p>
          </div>
        </>
      )}

      {mode === "advanced" && (
        <>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Content Hash</p>
            <p className="font-mono text-sm break-all">{advancedContentHash}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Manifest Hash</p>
            <p className="font-mono text-sm break-all">{advancedManifestHash}</p>
          </div>
        </>
      )}

      {manifest && (
        <div className="bg-gray-50 p-4 rounded-lg max-h-64 overflow-auto">
          <p className="text-sm text-gray-600 mb-2">Manifest</p>
          <pre className="text-xs font-mono whitespace-pre-wrap break-words">
            {JSON.stringify(manifest, null, 2)}
          </pre>
        </div>
      )}

      {manifestHash && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="text-sm text-gray-600">Manifest Hash</p>
          <p className="font-mono text-sm break-all">{manifestHash}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => router.back()}
        disabled={isSubmitting}
        className="text-sm font-medium text-gray-600 hover:text-gray-900 transition disabled:cursor-not-allowed disabled:text-gray-400"
      >
        Back
      </button>

      {statusMessage && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            submitState === "retrying"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-blue-200 bg-blue-50 text-blue-900"
          }`}
          role="status"
        >
          {statusMessage}
        </div>
      )}

      {submitError ? (
        <RetryableError
          variant="inline"
          error={submitError}
          title="Submission failed after automatic retries"
          retryLabel="Retry submission"
          retrying={isSubmitting}
          onRetry={handleSubmit}
        />
      ) : failureDetails && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {failureDetails}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting || submitState === "queued"}
        className="w-full bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {submitState === "retrying"
          ? "Retrying upload..."
            : submitState === "queued"
              ? "Submitted"
              : "Submit for Verification"}
        {submitState === "idle" && <ShortcutHint keys="Ctrl + Enter" />}
      </button>
    </div>
  );
}
