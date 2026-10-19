"use client";

import { ContentManifest } from "@stellarveriphy/shared/types";
import { useState } from "react";

import { jsonToXml } from "@/utils/manifestConverter";

import { FormatToggle } from "./FormatToggle";
import { ManifestPreview } from "./ManifestPreview";

interface ManifestModalProps {
  manifest: ContentManifest;
  isOpen: boolean;
  onClose: () => void;
}

export function ManifestModal({ manifest, isOpen, onClose }: ManifestModalProps) {
  const [format, setFormat] = useState<"json" | "xml">("json");

  if (!isOpen) return null;

  const downloadManifest = () => {
    const content =
      format === "json"
        ? JSON.stringify(manifest, null, 2)
        : jsonToXml(manifest as unknown as Parameters<typeof jsonToXml>[0], "manifest");

    const filename = `manifest.${format}`;
    const blob = new Blob([content], {
      type: format === "json" ? "application/json" : "application/xml",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold">Manifest</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <FormatToggle format={format} onChange={setFormat} />
            <button
              onClick={downloadManifest}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
            >
              Download
            </button>
          </div>

          <ManifestPreview
            content={
              format === "json"
                ? JSON.stringify(manifest, null, 2)
                : jsonToXml(manifest as unknown as Parameters<typeof jsonToXml>[0], "manifest")
            }
            format={format}
          />
        </div>
      </div>
    </div>
  );
}
