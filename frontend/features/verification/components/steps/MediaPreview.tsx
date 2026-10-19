"use client";

/**
 * MediaPreview
 *
 * Displays a rich preview of the selected file before it is submitted for
 * verification:
 *   - Image  → thumbnail with dimension badge
 *   - Video  → native <video> player with basic controls
 *   - Audio  → native <audio> player + simple waveform visualisation
 *   - PDF    → embedded <iframe> viewer
 *   - Other  → file-type icon + metadata only
 *
 * Also always renders a metadata panel (name, size, MIME type).
 */

import { useEffect, useRef, useState } from "react";

import { type ExifField, parseExif } from "@/utils/exif";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileMetadata {
  name: string;
  /** Raw byte size */
  size: number;
  type: string;
  /** Image/video width in px (undefined for non-visual types) */
  width?: number;
  /** Image/video height in px (undefined for non-visual types) */
  height?: number;
  /** Video/audio duration in seconds */
  duration?: number;
}

interface MediaPreviewProps {
  file: File;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type MediaCategory = "image" | "video" | "audio" | "pdf" | "other";

function getCategory(mimeType: string): MediaCategory {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "pdf";
  return "other";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Image thumbnail with real dimensions loaded from the bitmap. */
function ImagePreview({ objectUrl }: { objectUrl: string }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = objectUrl;
  }, [objectUrl]);

  return (
    <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-checkerboard">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={objectUrl} alt="Preview" className="max-h-64 w-full object-contain" />
      {dims && (
        <span className="absolute bottom-2 right-2 text-xs bg-black/60 text-white px-2 py-0.5 rounded">
          {dims.w} × {dims.h}
        </span>
      )}
    </div>
  );
}

/** Native video player. Reports duration once metadata is loaded. */
function VideoPreview({
  objectUrl,
  onDuration,
}: {
  objectUrl: string;
  onDuration: (s: number) => void;
}) {
  return (
    <video
      src={objectUrl}
      controls
      className="w-full max-h-64 rounded-lg border border-gray-200 dark:border-gray-700"
      onLoadedMetadata={(e) => onDuration((e.target as HTMLVideoElement).duration)}
    >
      Your browser does not support video playback.
    </video>
  );
}

/** Native audio player + minimal canvas waveform drawn from AudioBuffer. */
function AudioPreview({
  file,
  objectUrl,
  onDuration,
}: {
  file: File;
  objectUrl: string;
  onDuration: (s: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function drawWaveform() {
      try {
        // Read the file as an ArrayBuffer and decode it off-thread.
        const arrayBuffer = await file.arrayBuffer();
        // AudioContext is not available during SSR — guard accordingly.
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        if (cancelled) return;

        onDuration(audioBuffer.duration);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const { width, height } = canvas;
        const drawCtx = canvas.getContext("2d");
        if (!drawCtx) return;

        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        drawCtx.clearRect(0, 0, width, height);
        drawCtx.strokeStyle = "#3b82f6"; // blue-500
        drawCtx.lineWidth = 1;
        drawCtx.beginPath();

        for (let x = 0; x < width; x++) {
          let min = 1.0;
          let max = -1.0;
          for (let s = 0; s < step; s++) {
            const sample = data[x * step + s] ?? 0;
            if (sample < min) min = sample;
            if (sample > max) max = sample;
          }
          drawCtx.moveTo(x, (1 + min) * amp);
          drawCtx.lineTo(x, (1 + max) * amp);
        }
        drawCtx.stroke();
        ctx.close();
      } catch {
        // Decoding may fail for exotic codecs — fail silently.
      }
    }

    drawWaveform();
    return () => {
      cancelled = true;
    };
  }, [file, onDuration]);

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={600}
        height={80}
        className="w-full rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        aria-label="Audio waveform visualisation"
      />
      <audio src={objectUrl} controls className="w-full">
        Your browser does not support audio playback.
      </audio>
    </div>
  );
}

/** Embedded PDF viewer using an <iframe>. */
function PdfPreview({ objectUrl }: { objectUrl: string }) {
  return (
    <iframe
      src={objectUrl}
      title="PDF preview"
      className="w-full h-64 rounded-lg border border-gray-200 dark:border-gray-700"
    />
  );
}

/** Fallback for unsupported types — shows a generic file icon. */
function GenericPreview({ mimeType }: { mimeType: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-10 mb-2"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <p className="text-sm">{mimeType || "Unknown file type"}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadata panel
// ---------------------------------------------------------------------------

function MetadataPanel({ meta }: { meta: FileMetadata }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <MetaItem label="File name" value={meta.name} mono={false} />
      <MetaItem label="File size" value={formatBytes(meta.size)} />
      <MetaItem label="MIME type" value={meta.type || "unknown"} />
      {meta.width != null && meta.height != null && (
        <MetaItem label="Dimensions" value={`${meta.width} × ${meta.height} px`} />
      )}
      {meta.duration != null && <MetaItem label="Duration" value={formatDuration(meta.duration)} />}
    </div>
  );
}

function MetaItem({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      <p
        className={`font-medium truncate ${mono ? "font-mono text-xs" : "text-sm"} text-gray-900 dark:text-gray-100`}
      >
        {value}
      </p>
    </div>
  );
}

function ExifPanel({ exif }: { exif: ExifField[] }) {
  const [showSensitive, setShowSensitive] = useState(false);
  const primary = exif.filter((field) => field.sensitivity === "primary");
  const secondary = exif.filter((field) => field.sensitivity === "secondary");
  const sensitive = exif.filter((field) => field.sensitivity === "sensitive");

  if (exif.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Embedded image metadata</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Sensitive fields stay hidden by default.</p>
        </div>
        {sensitive.length > 0 && (
          <button
            type="button"
            onClick={() => setShowSensitive((current) => !current)}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            {showSensitive ? "Hide sensitive" : "Show sensitive"}
          </button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {primary.map((field) => (
          <MetaItem key={`${field.label}-${field.value}`} label={field.label} value={field.value} mono={false} />
        ))}
      </div>

      {secondary.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200">
            Secondary metadata ({secondary.length})
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {secondary.map((field) => (
              <MetaItem key={`${field.label}-${field.value}`} label={field.label} value={field.value} mono={false} />
            ))}
          </div>
        </details>
      )}

      {showSensitive && sensitive.length > 0 && (
        <div className="mt-3 grid gap-3 border-t border-gray-200 pt-3 md:grid-cols-2 dark:border-gray-700">
          {sensitive.map((field) => (
            <MetaItem key={`${field.label}-${field.value}`} label={field.label} value={field.value} mono={false} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * MediaPreview
 *
 * Pass the raw `File` object selected by the user. The component creates a
 * revocable object URL for playback/display and cleans it up on unmount.
 */
export function MediaPreview({ file }: MediaPreviewProps) {
  const [objectUrl, setObjectUrl] = useState<string>("");
  const [meta, setMeta] = useState<FileMetadata>({
    name: file.name,
    size: file.size,
    type: file.type,
  });
  const [exif, setExif] = useState<ExifField[]>([]);

  const category = getCategory(file.type);

  // Create and revoke object URL
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Reset meta (dimensions/duration) when a new file is selected
  useEffect(() => {
    setMeta({ name: file.name, size: file.size, type: file.type });
    setExif([]);
  }, [file]);

  useEffect(() => {
    let cancelled = false;
    parseExif(file)
      .then((fields) => {
        if (!cancelled) setExif(fields);
      })
      .catch((error) => {
        console.warn("Unable to parse embedded image metadata", { fileName: file.name, error });
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  function handleDuration(s: number) {
    setMeta((prev) => ({ ...prev, duration: s }));
  }

  if (!objectUrl) return null;

  return (
    <div className="space-y-4" role="region" aria-label="File preview">
      {/* ── Media preview area ── */}
      <div>
        {category === "image" && <ImagePreview objectUrl={objectUrl} />}
        {category === "video" && <VideoPreview objectUrl={objectUrl} onDuration={handleDuration} />}
        {category === "audio" && (
          <AudioPreview file={file} objectUrl={objectUrl} onDuration={handleDuration} />
        )}
        {category === "pdf" && <PdfPreview objectUrl={objectUrl} />}
        {category === "other" && <GenericPreview mimeType={file.type} />}
      </div>

      {/* ── Metadata panel ── */}
      <MetadataPanel meta={meta} />
      <ExifPanel exif={exif} />
    </div>
  );
}
