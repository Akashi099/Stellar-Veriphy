"use client";

/**
 * ProvenanceAnchors.tsx
 *
 * Renders the supplemental provenance anchors attached to a certificate.
 * Each anchor shows its type icon, a plain-language explanation, the
 * reference identifier, and a link to the appropriate explorer.
 *
 * Designed to be embedded in the Certificate section of a detail page,
 * below the primary Stellar anchor information.
 *
 * Accessibility:
 *   - Explorer links open in a new tab with aria-label and rel="noopener noreferrer".
 *   - The list uses role="list" with aria-label.
 *   - Anchor type descriptions are available via a disclosure button.
 *   - Keyboard-navigable; no motion unless prefers-reduced-motion allows it.
 */

import { useState } from "react";
import type { ProvenanceAnchor } from "@stellarveriphy/shared/types";
import {
  ANCHOR_TYPE_DESCRIPTIONS,
  ANCHOR_TYPE_ICONS,
  ANCHOR_TYPE_LABELS,
  anchorExplorerUrl,
  isAnchorCryptographicallyVerifiable,
} from "@stellarveriphy/shared/types";

// ---------------------------------------------------------------------------
// Single anchor card
// ---------------------------------------------------------------------------

function AnchorCard({ anchor }: { anchor: ProvenanceAnchor }) {
  const [descOpen, setDescOpen] = useState(false);
  const explorerHref = anchorExplorerUrl(anchor.anchorType, anchor.reference);
  const isVerifiable = isAnchorCryptographicallyVerifiable(anchor.anchorType);
  const icon = ANCHOR_TYPE_ICONS[anchor.anchorType];
  const typeLabel = ANCHOR_TYPE_LABELS[anchor.anchorType];
  const typeDescription = ANCHOR_TYPE_DESCRIPTIONS[anchor.anchorType];

  const anchoredDate = new Date(anchor.anchoredAt * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-900 p-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="text-xl leading-none"
            aria-hidden="true"
            title={typeLabel}
          >
            {icon}
          </span>
          <div>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {typeLabel}
            </span>
            {isVerifiable && (
              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Independently verifiable
              </span>
            )}
          </div>
        </div>
        <time
          dateTime={new Date(anchor.anchoredAt * 1000).toISOString()}
          className="shrink-0 text-xs text-slate-400 dark:text-slate-500"
        >
          {anchoredDate}
        </time>
      </div>

      {/* Description provided by the oracle */}
      {anchor.description && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{anchor.description}</p>
      )}

      {/* Reference */}
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs font-mono text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-700">
          {anchor.reference}
        </code>
        {explorerHref && (
          <a
            href={explorerHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${typeLabel} anchor in explorer (opens in new tab)`}
            className="shrink-0 inline-flex items-center gap-1 rounded text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
          >
            View
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
                clipRule="evenodd"
              />
              <path
                fillRule="evenodd"
                d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
                clipRule="evenodd"
              />
            </svg>
          </a>
        )}
      </div>

      {/* "What does this anchor prove?" disclosure */}
      <div>
        <button
          type="button"
          aria-expanded={descOpen}
          onClick={() => setDescOpen((o) => !o)}
          className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
        >
          {descOpen ? "Hide explanation ▲" : "What does this anchor prove? ▼"}
        </button>
        {descOpen && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {typeDescription}
          </p>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ProvenanceAnchorsProps {
  anchors: ProvenanceAnchor[];
  /** When true, shows the section even when there are no supplemental anchors. */
  showWhenEmpty?: boolean;
  className?: string;
}

export default function ProvenanceAnchors({
  anchors,
  showWhenEmpty = false,
  className = "",
}: ProvenanceAnchorsProps) {
  if (anchors.length === 0 && !showWhenEmpty) return null;

  return (
    <section
      aria-labelledby="anchors-heading"
      className={`space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between">
        <h3
          id="anchors-heading"
          className="text-sm font-semibold text-slate-700 dark:text-slate-300"
        >
          Provenance anchors
          {anchors.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              {anchors.length}
            </span>
          )}
        </h3>
      </div>

      {anchors.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No supplemental anchors have been attached to this certificate. The primary Stellar
          anchor is always the certificate's on-chain record.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            These are supplemental anchors attached after minting. The primary Stellar certificate
            is always the canonical record; anchors provide additional independent references.
          </p>
          <ul
            role="list"
            aria-label="Supplemental provenance anchors"
            className="space-y-3"
          >
            {anchors.map((anchor, idx) => (
              <AnchorCard key={`${anchor.anchorType}-${idx}`} anchor={anchor} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
