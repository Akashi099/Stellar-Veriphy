"use client";

/**
 * ConfidencePanel.tsx
 *
 * Self-contained, accessible panel that surfaces the full verification
 * confidence model. Shows the score badge with a "Why this score?"
 * disclosure button that expands to reveal the per-factor breakdown.
 *
 * Used on certificate detail pages and verification result cards.
 *
 * Anatomy:
 *   ┌─────────────────────────────────────────────────┐
 *   │  Score badge (e.g. 90/100 · High)  [?]          │
 *   │  [Why this score? ▾]                             │
 *   │  ┌─────────────────────────────────────────┐    │
 *   │  │ Expanded factor breakdown (disclosure)  │    │
 *   │  └─────────────────────────────────────────┘    │
 *   └─────────────────────────────────────────────────┘
 *
 * Accessibility:
 *   - The "Why this score?" button uses aria-expanded / aria-controls.
 *   - The breakdown panel is a <section> labelled by a visually-hidden heading.
 *   - Keyboard: Enter/Space toggles; Escape collapses.
 *   - Respects prefers-reduced-motion for the height animation.
 */

import { useEffect, useId, useRef, useState } from "react";

import type { ConfidenceResult } from "@stellarveriphy/shared/scoring";
import { CONFIDENCE_LEVELS } from "@stellarveriphy/shared/scoring";

import ConfidenceExplanation from "./ConfidenceExplanation";
import ConfidenceScore, { ConfidenceScoreHelp } from "./ConfidenceScore";
import Tooltip from "./Tooltip";

// ---------------------------------------------------------------------------
// Level-specific colours for the panel border accent
// ---------------------------------------------------------------------------

const LEVEL_BORDER: Record<string, string> = {
  high: "border-emerald-200 dark:border-emerald-800",
  medium: "border-amber-200 dark:border-amber-800",
  low: "border-rose-200 dark:border-rose-800",
};

const LEVEL_HEADER_BG: Record<string, string> = {
  high: "bg-emerald-50 dark:bg-emerald-900/20",
  medium: "bg-amber-50 dark:bg-amber-900/20",
  low: "bg-rose-50 dark:bg-rose-900/20",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConfidencePanelProps {
  result: ConfidenceResult;
  /**
   * When true the breakdown starts expanded. Useful on dedicated certificate
   * detail pages where space is not a concern.
   * @default false
   */
  defaultExpanded?: boolean;
  /**
   * Optional CSS class applied to the outer wrapper.
   */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConfidencePanel({
  result,
  defaultExpanded = false,
  className = "",
}: ConfidencePanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Collapse on Escape
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [expanded]);

  const levelConfig = CONFIDENCE_LEVELS.find((l) => l.level === result.level)!;

  return (
    <div
      className={`rounded-xl border ${LEVEL_BORDER[result.level]} overflow-hidden ${className}`}
      data-testid="confidence-panel"
    >
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${LEVEL_HEADER_BG[result.level]}`}
      >
        {/* Score badge + tooltip */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Verification confidence
          </span>
          <ConfidenceScore result={result} size="sm" />
          <Tooltip label="What does the confidence score mean?">
            <ConfidenceScoreHelp />
          </Tooltip>
        </div>

        {/* "Why this score?" disclosure toggle */}
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex items-center gap-1 rounded text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
        >
          Why this score?
          <svg
            className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* ── Level description (always visible, brief) ───────────────────────── */}
      <div className="px-4 pb-2 pt-1 bg-white dark:bg-gray-900 border-t border-slate-100 dark:border-slate-800">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          <strong className="text-slate-700 dark:text-slate-300">{levelConfig.label}:</strong>{" "}
          {levelConfig.description}
        </p>
      </div>

      {/* ── Expandable breakdown ─────────────────────────────────────────────── */}
      {expanded && (
        <section
          id={panelId}
          aria-label="Confidence score breakdown"
          className="border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-gray-900 px-4 py-4"
        >
          {/* Visually-hidden heading for screen readers */}
          <h3 className="sr-only">How the score was calculated</h3>
          <ConfidenceExplanation result={result} />
        </section>
      )}
    </div>
  );
}
