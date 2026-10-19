"use client";

import { AlertCircle, CheckCircle, FileText, Loader2,RefreshCw, Upload, X } from "lucide-react";
import { useCallback,useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BatchFile {
  id: string;
  file: File;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  error?: string | undefined;
  certificateId?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

interface BatchVerificationPanelProps {
  onVerify?: (files: BatchFile[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchVerificationPanel({ onVerify }: BatchVerificationPanelProps) {
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // File selection handler
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const newFiles: BatchFile[] = Array.from(e.target.files).map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: "pending" as const,
      progress: 0,
    }));

    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles: BatchFile[] = Array.from(e.dataTransfer.files).map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        status: "pending" as const,
        progress: 0,
      }));

      setFiles((prev) => [...prev, ...newFiles]);
    }
  }, []);

  // CSV import handler
  const handleCsvImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || !e.target.files[0]) return;

      const file = e.target.files[0];
      const reader = new FileReader();

      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.split("\n").filter((line) => line.trim());

        if (lines.length < 2) return; // Need header + at least one row

        const headerLine = lines[0];
        if (!headerLine) return;
        const headers = headerLine.split(",").map((h) => h.trim());

        // Update existing files with metadata from CSV
        const updatedFiles = [...files];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          const values = line.split(",").map((v) => v.trim());
          const filename = values[0];
          if (!filename) continue;

          const fileIndex = updatedFiles.findIndex((f) => f.file.name === filename);

          if (fileIndex !== -1) {
            const metadata: Record<string, string> = {};
            for (let j = 1; j < headers.length && j < values.length; j++) {
              const h = headers[j];
              const v = values[j];
              if (h !== undefined && v !== undefined) {
                metadata[h] = v;
              }
            }
            const target = updatedFiles[fileIndex];
            if (target) {
              target.metadata = metadata;
            }
          }
        }

        setFiles(updatedFiles);
      };

      reader.readAsText(file);
    },
    [files]
  );

  // Remove file
  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Retry failed file
  const retryFile = useCallback((id: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, status: "pending" as const, progress: 0, error: undefined } : f
      )
    );
  }, []);

  // Submit batch
  const handleSubmit = useCallback(async () => {
    if (files.length === 0) return;

    setIsProcessing(true);

    try {
      if (onVerify) {
        await onVerify(files);
      } else {
        // Mock verification for demo
        for (const file of files) {
          setFiles((prev) =>
            prev.map((f) => (f.id === file.id ? { ...f, status: "processing" as const } : f))
          );

          // Simulate progress
          for (let i = 0; i <= 100; i += 20) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, progress: i } : f)));
          }

          // Simulate success or failure (90% success rate)
          const success = Math.random() > 0.1;

          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id
                ? {
                    ...f,
                    status: success ? ("completed" as const) : ("failed" as const),
                    progress: 100,
                    error: success ? undefined : "Verification failed",
                    certificateId: success
                      ? `CERT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
                      : undefined,
                  }
                : f
            )
          );
        }
      }
    } finally {
      setIsProcessing(false);
    }
  }, [files, onVerify]);

  // Calculate statistics
  const stats = {
    total: files.length,
    pending: files.filter((f) => f.status === "pending").length,
    processing: files.filter((f) => f.status === "processing").length,
    completed: files.filter((f) => f.status === "completed").length,
    failed: files.filter((f) => f.status === "failed").length,
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Batch Verification</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Upload multiple files for verification in a single batch
          </p>
        </div>

        {/* CSV Import */}
        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm">
          <FileText className="w-4 h-4" />
          Import CSV Metadata
          <input type="file" accept=".csv" onChange={handleCsvImport} className="hidden" />
        </label>
      </div>

      {/* Upload Area */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
            : "border-gray-300 dark:border-gray-700"
        }`}
      >
        <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
        <p className="text-gray-600 dark:text-gray-400 mb-2">
          Drag and drop files here, or click to select
        </p>
        <label className="inline-block cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          Select Files
          <input type="file" multiple onChange={handleFileChange} className="hidden" />
        </label>
      </div>

      {/* Statistics */}
      {files.length > 0 && (
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
              {stats.pending}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Pending</div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.processing}
            </div>
            <div className="text-sm text-blue-600 dark:text-blue-400">Processing</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.completed}
            </div>
            <div className="text-sm text-green-600 dark:text-green-400">Completed</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.failed}</div>
            <div className="text-sm text-red-600 dark:text-red-400">Failed</div>
          </div>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              {/* Status Icon */}
              <div className="shrink-0">
                {file.status === "pending" && (
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </div>
                )}
                {file.status === "processing" && (
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                )}
                {file.status === "completed" && <CheckCircle className="w-8 h-8 text-green-600" />}
                {file.status === "failed" && <AlertCircle className="w-8 h-8 text-red-600" />}
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900 dark:text-white break-words">
                      {file.file.name}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {(file.file.size / 1024).toFixed(1)} KB
                  </span>
                </div>

                {file.metadata && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Metadata:{" "}
                    {Object.entries(file.metadata)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ")}
                  </p>
                )}

                {file.status === "processing" && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {file.status === "completed" && file.certificateId && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Certificate: {file.certificateId}
                  </p>
                )}

                {file.status === "failed" && file.error && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{file.error}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {file.status === "failed" && (
                  <button
                    onClick={() => retryFile(file.id)}
                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                    title="Retry"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  title="Remove"
                  disabled={file.status === "processing"}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {files.length > 0 && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setFiles([])}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            disabled={isProcessing}
          >
            Clear All
          </button>

          <button
            onClick={handleSubmit}
            disabled={isProcessing || stats.pending === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? "Processing..." : `Verify ${stats.pending} Files`}
          </button>
        </div>
      )}
    </div>
  );
}
