"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { useWizard } from "@/context/WizardContext";
import { hashFile } from "@/utils/hashing";

import { MediaPreview } from "./MediaPreview";

type UploadStatus = "pending" | "hashing" | "uploading" | "verification" | "complete";

const STATUS_LABELS: Record<UploadStatus, string> = {
  pending: "Preparing file",
  hashing: "Computing file hash",
  uploading: "Uploading to storage",
  verification: "Verifying content",
  complete: "Complete",
};

export function MediaInput() {
  const { setFile, setContentHash, setHashProgress, hashProgress } = useWizard();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isHashing, setIsHashing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("pending");
  const [hash, setHash] = useState("");
  const router = useRouter();

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = async (file: File) => {
    setSelectedFile(file);
    setFile(file);
    setIsHashing(true);
    setUploadStatus("hashing");
    setHashProgress(0);

    try {
      const fileHash = await hashFile(file, (progress) => {
        setHashProgress(progress);
      });
      setHash(fileHash);
      setContentHash(fileHash);
      setUploadStatus("complete");
    } catch (error) {
      console.error("Error hashing file:", error);
      setUploadStatus("pending");
    } finally {
      setIsHashing(false);
    }
  };

  const handleContinue = () => {
    if (hash) {
      router.push("/creator/upload-content/manifest-step");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Upload Media File</h2>

      {!selectedFile ? (
        <div className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-500 transition cursor-pointer"
          >
            <input type="file" onChange={handleFileSelect} className="hidden" id="file-input" />
            <label htmlFor="file-input" className="cursor-pointer">
              <p className="text-lg font-semibold mb-2">Drag and drop your file here</p>
              <p className="text-gray-600">or click to select a file</p>
            </label>
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
          >
            ← Back
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Rich media preview (image, video, audio, PDF, etc.) ── */}
          <MediaPreview file={selectedFile} />

          {isHashing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse mr-2" />
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {STATUS_LABELS[uploadStatus]}
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  {Math.round(hashProgress)}%
                </p>
              </div>
              <div
                className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(hashProgress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={STATUS_LABELS[uploadStatus]}
              >
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${hashProgress}%` }}
                />
              </div>
            </div>
          )}

          {hash && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Content Hash (SHA-256)</p>
              <p className="font-mono text-sm break-all">{hash}</p>
            </div>
          )}

          {hash && (
            <>
              <button
                type="button"
                onClick={() => router.back()}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
              >
                ← Back
              </button>
              <button
                onClick={handleContinue}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition"
              >
                Continue
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
