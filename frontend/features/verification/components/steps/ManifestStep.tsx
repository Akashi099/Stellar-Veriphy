"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useWizard } from "@/context/WizardContext";
import { hashFile } from "@/utils/hashing";

export function ManifestStep() {
  const { setManifest, setManifestHash, setHashProgress, hashProgress } = useWizard();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manifestData, setManifestData] = useState<object | null>(null);
  const [isHashing, setIsHashing] = useState(false);
  const [hash, setHash] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = async (file: File) => {
    const isValidType = file.name.endsWith(".json") || file.name.endsWith(".xml");
    if (!isValidType) {
      setError("Manifest must be a .json or .xml file. Invalid file type detected.");
      return;
    }

    setSelectedFile(file);
    setError("");
    setIsHashing(true);
    setHashProgress(0);

    try {
      const fileHash = await hashFile(file, (progress) => {
        setHashProgress(progress);
      });
      setHash(fileHash);
      setManifestHash(fileHash);

      const content = await file.text();
      let parsed: Record<string, unknown>;
      if (file.name.endsWith(".json")) {
        parsed = JSON.parse(content) as Record<string, unknown>;
      } else {
        // For XML, store as string representation
        parsed = { xml: content };
      }
      setManifestData(parsed);
      setManifest(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error processing manifest file");
    } finally {
      setIsHashing(false);
    }
  };

  const handleContinue = () => {
    if (hash && manifestData) {
      router.push("/creator/upload-content/review");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Attach Manifest</h2>

      {!selectedFile ? (
        <div className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-500 transition cursor-pointer"
          >
            <input
              type="file"
              onChange={handleFileSelect}
              accept=".json,.xml"
              className="hidden"
              id="manifest-input"
            />
            <label htmlFor="manifest-input" className="cursor-pointer">
              <p className="text-lg font-semibold mb-2">Drag and drop your manifest here</p>
              <p className="text-gray-600">or click to select a .json or .xml file</p>
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
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">File Name</p>
            <p className="font-semibold">{selectedFile.name}</p>
          </div>

          {isHashing && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">Computing hash...</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${hashProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600">{Math.round(hashProgress)}%</p>
            </div>
          )}

          {hash && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Manifest Hash (SHA-256)</p>
              <p className="font-mono text-sm break-all">{hash}</p>
            </div>
          )}

          {manifestData && (
            <div className="bg-gray-50 p-4 rounded-lg max-h-64 overflow-auto">
              <p className="text-sm text-gray-600 mb-2">Manifest Preview</p>
              <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                {JSON.stringify(manifestData, null, 2)}
              </pre>
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

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
