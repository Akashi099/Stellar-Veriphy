"use client";

import { useCallback, useEffect, useState } from "react";

const MAX_FALLBACK_RETRIES = 1;

export interface MediaSnapshotPreviewProps {
  file: File | null;
  verificationState?: "idle" | "hashing" | "submitting" | "processing" | "completed" | "failed" | string;
  className?: string;
}

/**
 * Resolve a fallback media source for a failed primary endpoint.
 *
 * Privacy and origin restrictions are enforced here: only same-origin URLs
 * (or relative paths) are eligible for fallback, and blob:/data: URLs are
 * never rewritten. Returns null when no safe fallback is available.
 */
export function resolveMediaFallback(primaryUrl: string | null | undefined): string | null {
  if (!primaryUrl) return null;

  // Never rewrite local object URLs or inline data payloads.
  if (
    primaryUrl.startsWith("blob:") ||
    primaryUrl.startsWith("data:") ||
    primaryUrl.startsWith("object:")
  ) {
    return null;
  }

  try {
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost";
    const parsed = new URL(primaryUrl, base);

    // Enforce same-origin restriction to avoid leaking requests cross-origin.
    if (parsed.origin !== base) {
      return null;
    }

    // Route the request through the fallback media endpoint.
    return `/api/media/fallback?src=${encodeURIComponent(parsed.pathname + parsed.search)}`;
  } catch {
    return null;
  }
}

export function MediaSnapshotPreview({
  file,
  verificationState = "idle",
  className = "",
}: MediaSnapshotPreviewProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [fallbackAttempts, setFallbackAttempts] = useState(0);

  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setObjectUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    setImageSrc(objectUrl);
    setImageFailed(false);
    setFallbackAttempts(0);
  }, [objectUrl]);

  const handleImageError = useCallback(() => {
    // Bounded retries: attempt the fallback source at most once, then
    // resolve to the standard placeholder state.
    if (fallbackAttempts < MAX_FALLBACK_RETRIES) {
      const fallback = resolveMediaFallback(imageSrc);
      if (fallback) {
        setFallbackAttempts((prev) => prev + 1);
        setImageSrc(fallback);
        return;
      }
    }

    setImageFailed(true);
  }, [fallbackAttempts, imageSrc]);

  if (!file) return null;

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = () => {
    switch (verificationState) {
      case "hashing":
        return { label: "Calculating Hash", color: "bg-blue-100 text-blue-800 border-blue-200" };
      case "submitting":
        return { label: "Submitting", color: "bg-amber-100 text-amber-800 border-amber-200" };
      case "processing":
        return { label: "Verification Processing", color: "bg-purple-100 text-purple-800 border-purple-200" };
      case "completed":
        return { label: "Verified", color: "bg-green-100 text-green-800 border-green-200" };
      case "failed":
        return { label: "Verification Failed", color: "bg-red-100 text-red-800 border-red-200" };
      default:
        return { label: "Pending Submission", color: "bg-gray-100 text-gray-700 border-gray-200" };
    }
  };

  const status = getStatusBadge();

  return (
    <div
      className={`media-snapshot-preview border border-gray-200 rounded-lg p-4 bg-white dark:bg-gray-800 dark:border-gray-700 shadow-sm mt-3 ${className}`}
      data-testid="media-snapshot-preview"
    >
      <div className="flex items-center justify-between mb-3 border-b pb-2 border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">
            Original Upload Snapshot
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono">
            {file.type || "unknown format"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Verification State:</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border font-medium ${status.color}`}
            data-testid="verification-state-badge"
          >
            {status.label}
          </span>
        </div>
      </div>

      <div className="preview-container relative flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded border border-dashed border-gray-300 dark:border-gray-700 overflow-hidden min-h-[160px] max-h-[320px]">
        {objectUrl && isImage && !imageFailed && imageSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={`Snapshot preview for ${file.name}`}
            className="max-h-[300px] w-auto max-w-full object-contain rounded"
            onError={handleImageError}
            data-testid="media-snapshot-image"
          />
        )}

        {objectUrl && isImage && imageFailed && (
          <div
            className="p-6 text-center text-gray-500"
            data-testid="media-snapshot-placeholder"
          >
            <div className="text-2xl mb-1">🖼️</div>
            <div className="font-medium text-sm text-gray-700 dark:text-gray-200">{file.name}</div>
            <div className="text-xs text-gray-400 mt-1">Preview unavailable</div>
          </div>
        )}

        {objectUrl && isVideo && (
          <video
            src={objectUrl}
            controls
            className="max-h-[300px] w-auto max-w-full rounded"
            preload="metadata"
          >
            Your browser does not support the video tag.
          </video>
        )}

        {objectUrl && isAudio && (
          <div className="w-full p-4 flex flex-col items-center justify-center gap-2">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Audio Track Preview: {file.name}
            </div>
            <audio src={objectUrl} controls className="w-full max-w-md">
              Your browser does not support the audio element.
            </audio>
          </div>
        )}

        {objectUrl && isPdf && (
          <div className="w-full h-[280px] flex flex-col">
            <iframe
              src={`${objectUrl}#toolbar=0`}
              title={`PDF preview of ${file.name}`}
              className="w-full flex-1 border-0 rounded"
            />
            <div className="text-center text-xs text-gray-500 py-1 bg-gray-100 dark:bg-gray-800">
              PDF Document Preview
            </div>
          </div>
        )}

        {!isImage && !isVideo && !isAudio && !isPdf && (
          <div className="p-6 text-center text-gray-500">
            <div className="text-2xl mb-1">📄</div>
            <div className="font-medium text-sm text-gray-700 dark:text-gray-200">{file.name}</div>
            <div className="text-xs text-gray-400 mt-1">{file.type || "Document / Binary file"}</div>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span className="truncate max-w-[250px]" title={file.name}>
          <strong className="text-gray-700 dark:text-gray-300">File:</strong> {file.name}
        </span>
        <span>
          <strong className="text-gray-700 dark:text-gray-300">Size:</strong> {formatFileSize(file.size)}
        </span>
      </div>
    </div>
  );
}
