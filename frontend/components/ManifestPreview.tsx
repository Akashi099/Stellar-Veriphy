"use client";

import { ContentManifest } from "@stellarveriphy/shared/types";
import type { ReactNode } from "react";
import { formatDateTime } from "@/utils/formatDateTime";

interface ManifestPreviewProps {
  manifest: Partial<ContentManifest>;
}

function renderValue(value: unknown, depth = 0): ReactNode {
  if (Array.isArray(value)) {
    return (
      <details open={depth === 0} className="min-w-0">
        <summary className="cursor-pointer select-none text-gray-600 dark:text-gray-300">
          Array <span className="text-gray-400">({value.length})</span>
        </summary>
        <ol className="ml-4 border-l border-gray-300 dark:border-gray-700 pl-3">
          {value.map((item, index) => (
            <li key={index} className="min-w-0 py-1">
              <span className="mr-2 text-gray-400">[{index}]</span>
              {renderValue(item, depth + 1)}
            </li>
          ))}
        </ol>
      </details>
    );
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    return (
      <details open={depth === 0} className="min-w-0">
        <summary className="cursor-pointer select-none text-gray-600 dark:text-gray-300">
          Object <span className="text-gray-400">({entries.length})</span>
        </summary>
        <dl className="ml-4 border-l border-gray-300 dark:border-gray-700 pl-3">
          {entries.map(([key, entryValue]) => (
            <div
              key={key}
              className="grid min-w-0 grid-cols-[minmax(5rem,auto)_minmax(0,1fr)] gap-3 py-1"
            >
              <dt className="break-words font-medium text-blue-700 dark:text-blue-300">{key}</dt>
              <dd className="min-w-0">{renderValue(entryValue, depth + 1)}</dd>
            </div>
          ))}
        </dl>
      </details>
    );
  }

  const formatted = JSON.stringify(value);
  return (
    <span className="break-words text-green-700 dark:text-green-300">
      {formatted === undefined ? "undefined" : formatted}
    </span>
  );
}

export function ManifestPreview({ manifest }: ManifestPreviewProps) {
  const generatedAt = manifest.timestamp ? formatDateTime(manifest.timestamp) : null;

  return (
    <div className="min-w-0 rounded border border-gray-300 bg-gray-100 p-4 dark:border-gray-700 dark:bg-gray-900">
      <h2 className="mb-3 font-semibold text-black dark:text-white">Manifest Preview</h2>
      {generatedAt && manifest.timestamp && (
        <p className="mb-3 text-xs text-gray-600 dark:text-gray-300">
          Generated <time dateTime={manifest.timestamp}>{generatedAt}</time>
        </p>
      )}
      <div
        aria-label="Structured manifest preview"
        className="max-h-[70vh] min-w-0 overflow-auto rounded bg-white p-3 text-sm text-black dark:bg-gray-950 dark:text-white"
      >
        {renderValue(manifest)}
      </div>
    </div>
  );
}
