"use client";

/**
 * CollapsibleMetadataPanel.tsx
 *
 * Prevents dense metadata panels from becoming unreadable by providing a
 * compact expandable view. Long metadata lists can be collapsed or expanded
 * with a clearly labelled toggle that works for both sighted users and
 * screen readers.
 *
 * Anatomy:
 *   ┌──────────────────────────────────────────────────────┐
 *   │  Title                        [Show details ▾]       │
 *   │  ┌──────────────────────────────────────────────┐    │
 *   │  │ key  value                                   │    │
 *   │  │ key  value                                   │    │
 *   │  │ ...                                          │    │
 *   │  └──────────────────────────────────────────────┘    │
 *   └──────────────────────────────────────────────────────┘
 *
 * Default state:
 *   - Collapsed by default, so the panel is compact in common workflows.
 *   - Pass `defaultExpanded` to open it initially on detail pages.
 *
 * Accessibility:
 *   - Toggle button has aria-expanded and aria-controls.
 *   - The content region is a <dl> labelled via aria-labelledby.
 *   - Keyboard: Enter/Space toggles; Escape collapses.
 *   - Chevron is aria-hidden; visible label changes with state.
 *   - Respects prefers-reduced-motion for the height animation.
 *
 * Usage:
 * ─────────────────────────────────────────────────────────────────────────────
 *   // Simple key/value object
 *   <CollapsibleMetadataPanel
 *     title="File metadata"
 *     metadata={{ device: "Canon R5", lens: "50mm f/1.8", iso: "400" }}
 *   />
 *
 *   // Pre-built entries array (for custom formatting)
 *   <CollapsibleMetadataPanel
 *     title="Manifest details"
 *     entries={[
 *       { key: "Hash", value: "sha256:9f2c…" },
 *       { key: "Creator", value: <AddressBadge address={creator} /> },
 *     ]}
 *   />
 *
 *   // Start expanded on a detail page
 *   <CollapsibleMetadataPanel title="Metadata" metadata={record.manifest.metadata} defaultExpanded />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { cn } from "@/utils/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetadataEntry {
  /** The field name / label shown on the left. */
  key: string;
  /** The field value — can be a plain string or any React node. */
  value: React.ReactNode;
  /** Optional className applied to the value cell. */
  valueClassName?: string;
}

export interface CollapsibleMetadataPanelProps {
  /**
   * Section heading displayed in the toggle bar.
   * @example "File metadata" | "Manifest details"
   */
  title?: string;

  /**
   * Convenience prop: pass a plain key/value object and the panel converts
   * each entry automatically.  Entries are shown in insertion order.
   * Mutually exclusive with `entries` — if both are provided, `entries`
   * takes precedence.
   */
  metadata?: Record<string, string | number | boolean | null | undefined>;

  /**
   * Explicit array of entries for cases where you need custom React node
   * values or control over ordering.
   */
  entries?: MetadataEntry[];

  /**
   * Maximum number of entries to show while collapsed.
   * Entries beyond this limit are hidden until the panel is expanded.
   * @default 3
   */
  previewCount?: number;

  /**
   * If true the panel starts in the expanded state.
   * Default is `false` (collapsed) for compact common workflows.
   */
  defaultExpanded?: boolean;

  /** Optional className applied to the outer wrapper. */
  className?: string;

  /** If true, renders without the outer border/card chrome. */
  bare?: boolean;
}

// ---------------------------------------------------------------------------
// ChevronIcon (inline — no external dep)
// ---------------------------------------------------------------------------

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helper: coerce metadata record → MetadataEntry[]
// ---------------------------------------------------------------------------

function recordToEntries(
  record: Record<string, string | number | boolean | null | undefined>
): MetadataEntry[] {
  return Object.entries(record)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => ({
      key: k
        // camelCase / snake_case → "Title Case"
        .replace(/_/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (c) => c.toUpperCase()),
      value: String(v),
    }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CollapsibleMetadataPanel({
  title = "Metadata",
  metadata,
  entries: entriesProp,
  previewCount = 3,
  defaultExpanded = false,
  className,
  bare = false,
}: CollapsibleMetadataPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Resolve entries — explicit `entries` prop wins over `metadata`
  const allEntries: MetadataEntry[] = React.useMemo(() => {
    if (entriesProp && entriesProp.length > 0) return entriesProp;
    if (metadata) return recordToEntries(metadata);
    return [];
  }, [entriesProp, metadata]);

  const hasOverflow = allEntries.length > previewCount;
  const visibleEntries = expanded ? allEntries : allEntries.slice(0, previewCount);
  const hiddenCount = allEntries.length - previewCount;

  // Collapse on Escape
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [expanded]);

  // Height animation via max-height
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string>(defaultExpanded ? "none" : "0px");
  const [overflow, setOverflow] = useState<"hidden" | "visible">(
    defaultExpanded ? "visible" : "hidden"
  );

  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip animation on initial render — just snap to the default state
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!contentRef.current) return;
    const height = contentRef.current.scrollHeight;

    if (expanded) {
      setOverflow("hidden");
      setMaxHeight(`${height}px`);
      const t = setTimeout(() => {
        setMaxHeight("none");
        setOverflow("visible");
      }, 220);
      return () => clearTimeout(t);
    } else {
      setMaxHeight(`${height}px`);
      setOverflow("hidden");
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setMaxHeight("0px"))
      );
      return () => cancelAnimationFrame(raf);
    }
  }, [expanded]);

  const toggle = useCallback(() => setExpanded((e) => !e), []);

  if (allEntries.length === 0) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  const inner = (
    <>
      {/* ── Toggle bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <span
          id={`${panelId}-title`}
          className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
        >
          {title}
        </span>

        {hasOverflow && (
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={toggle}
            className={cn(
              "inline-flex items-center gap-1 rounded text-xs font-medium",
              "text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300",
              "transition-colors focus-visible:outline focus-visible:outline-2",
              "focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            )}
          >
            <span>
              {expanded
                ? "Show less"
                : `Show ${hiddenCount} more`}
            </span>
            <ChevronIcon
              className={cn(
                "transition-transform duration-200 motion-reduce:transition-none",
                expanded && "rotate-180"
              )}
            />
          </button>
        )}
      </div>

      {/* ── Preview entries (always visible) ─────────────────────────────── */}
      <dl
        id={`${panelId}-preview`}
        aria-labelledby={`${panelId}-title`}
        className="px-4 pb-1"
      >
        {visibleEntries.slice(0, hasOverflow ? previewCount : undefined).map((entry) => (
          <MetadataRow key={entry.key} entry={entry} />
        ))}
      </dl>

      {/* ── Hidden entries (animated) ─────────────────────────────────────── */}
      {hasOverflow && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={`${panelId}-title`}
          ref={contentRef}
          style={{
            maxHeight,
            overflow,
            transition: "max-height 200ms ease-in-out",
          }}
        >
          <dl
            className="px-4"
            aria-label={`Additional ${title.toLowerCase()} fields`}
          >
            {allEntries.slice(previewCount).map((entry) => (
              <MetadataRow key={entry.key} entry={entry} />
            ))}
          </dl>
        </div>
      )}

      {/* ── Collapsed hint ───────────────────────────────────────────────── */}
      {hasOverflow && !expanded && (
        <p
          aria-hidden="true"
          className="px-4 pb-2.5 text-xs text-gray-400 dark:text-gray-500"
        >
          {hiddenCount} field{hiddenCount !== 1 ? "s" : ""} hidden
        </p>
      )}
    </>
  );

  if (bare) {
    return <div className={cn("w-full", className)}>{inner}</div>;
  }

  return (
    <div
      className={cn(
        "w-full rounded-xl border border-gray-200 dark:border-gray-700",
        "bg-white dark:bg-gray-900 shadow-sm overflow-hidden",
        className
      )}
      data-testid="collapsible-metadata-panel"
    >
      {inner}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetadataRow — single key/value pair
// ---------------------------------------------------------------------------

function MetadataRow({ entry }: { entry: MetadataEntry }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <dt className="shrink-0 min-w-[7rem] text-xs text-gray-500 dark:text-gray-400 font-medium">
        {entry.key}
      </dt>
      <dd
        className={cn(
          "text-xs text-right text-gray-800 dark:text-gray-200 font-mono break-all",
          entry.valueClassName
        )}
      >
        {entry.value}
      </dd>
    </div>
  );
}

export default CollapsibleMetadataPanel;
