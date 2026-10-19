"use client";

/**
 * Timeline.tsx — #431
 *
 * Generic timeline component for certificate history and other chronological
 * event sequences.
 *
 * Features:
 * - Vertical layout (default)
 * - Alternate sides layout (even items on right, odd on left)
 * - Event items with icons and colour-coded connectors
 * - Timestamp display
 * - Expandable details section per event
 * - Responsive design
 *
 * Usage:
 * ─────────────────────────────────────────────────────────────────────────────
 * <Timeline>
 *   <TimelineItem
 *     icon={<CheckIcon />}
 *     color="emerald"
 *     title="Certificate Minted"
 *     timestamp={1700000000}
 *     details="Provenance record created on Stellar testnet."
 *   />
 *   <TimelineItem
 *     icon={<RefreshCwIcon />}
 *     color="amber"
 *     title="Metadata Updated"
 *     timestamp={1700500000}
 *   />
 * </Timeline>
 *
 * Alternate sides:
 *   <Timeline alternate>…</Timeline>
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { createContext, useContext, useState } from "react";

import { cn } from "@/utils/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Types & Context
// ─────────────────────────────────────────────────────────────────────────────

export type TimelineColor = "blue" | "emerald" | "amber" | "red" | "violet" | "cyan" | "gray";

const colorMap: Record<
  TimelineColor,
  { dot: string; icon: string; iconBg: string; connector: string }
> = {
  blue: {
    dot: "bg-blue-500 ring-blue-200 dark:ring-blue-900",
    icon: "text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-50 dark:bg-blue-900/40",
    connector: "border-blue-200 dark:border-blue-800",
  },
  emerald: {
    dot: "bg-emerald-500 ring-emerald-200 dark:ring-emerald-900",
    icon: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-50 dark:bg-emerald-900/40",
    connector: "border-emerald-200 dark:border-emerald-800",
  },
  amber: {
    dot: "bg-amber-500 ring-amber-200 dark:ring-amber-900",
    icon: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-50 dark:bg-amber-900/40",
    connector: "border-amber-200 dark:border-amber-800",
  },
  red: {
    dot: "bg-red-500 ring-red-200 dark:ring-red-900",
    icon: "text-red-600 dark:text-red-400",
    iconBg: "bg-red-50 dark:bg-red-900/40",
    connector: "border-red-200 dark:border-red-800",
  },
  violet: {
    dot: "bg-violet-500 ring-violet-200 dark:ring-violet-900",
    icon: "text-violet-600 dark:text-violet-400",
    iconBg: "bg-violet-50 dark:bg-violet-900/40",
    connector: "border-violet-200 dark:border-violet-800",
  },
  cyan: {
    dot: "bg-cyan-500 ring-cyan-200 dark:ring-cyan-900",
    icon: "text-cyan-600 dark:text-cyan-400",
    iconBg: "bg-cyan-50 dark:bg-cyan-900/40",
    connector: "border-cyan-200 dark:border-cyan-800",
  },
  gray: {
    dot: "bg-gray-400 ring-gray-200 dark:ring-gray-700",
    icon: "text-gray-500 dark:text-gray-400",
    iconBg: "bg-gray-100 dark:bg-gray-800",
    connector: "border-gray-200 dark:border-gray-700",
  },
};

interface TimelineContextValue {
  alternate: boolean;
  /** Item index from the parent Timeline (injected by React.Children.map) */
  index?: number;
  total?: number;
}

const TimelineContext = createContext<TimelineContextValue>({ alternate: false });

// ─────────────────────────────────────────────────────────────────────────────
// Timestamp helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number | string | Date): string {
  const date =
    ts instanceof Date
      ? ts
      : typeof ts === "number"
        ? new Date(ts > 1e10 ? ts : ts * 1000) // handle ms vs s
        : new Date(ts);

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline root
// ─────────────────────────────────────────────────────────────────────────────

export interface TimelineProps {
  /** If true, odd items appear on the right and even items on the left */
  alternate?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Timeline({ alternate = false, className, children }: TimelineProps) {
  const items = React.Children.toArray(children);
  const total = items.length;

  return (
    <TimelineContext.Provider value={{ alternate }}>
      <ol
        aria-label="Timeline"
        className={cn("relative", alternate ? "flex flex-col" : "flex flex-col", className)}
      >
        {items.map((child, index) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<TimelineItemInternalProps>, {
                _index: index,
                _total: total,
              })
            : child
        )}
      </ol>
    </TimelineContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TimelineItem
// ─────────────────────────────────────────────────────────────────────────────

interface TimelineItemInternalProps {
  _index?: number;
  _total?: number;
}

export interface TimelineItemProps {
  /** Main event title */
  title: string;
  /** Unix timestamp (seconds or milliseconds), ISO string, or Date */
  timestamp?: number | string | Date;
  /** Optional body text or JSX rendered below the title */
  children?: React.ReactNode;
  /** Expandable details string (shown when user clicks "Show details") */
  details?: string;
  /** Icon rendered inside the marker circle */
  icon?: React.ReactNode;
  /** Colour scheme for the marker and connector */
  color?: TimelineColor;
  /** Optional badge/tag text */
  badge?: string;
  /** If true, the item is rendered without the connector below it */
  isLast?: boolean;
  className?: string;
  /** @internal — injected by Timeline */
  _index?: number;
  /** @internal — injected by Timeline */
  _total?: number;
}

export function TimelineItem({
  title,
  timestamp,
  children,
  details,
  icon,
  color = "blue",
  badge,
  className,
  _index = 0,
  _total = 1,
}: TimelineItemProps) {
  const { alternate } = useContext(TimelineContext);
  const [expanded, setExpanded] = useState(false);
  const detailsId = React.useId();

  const isLast = _index === _total - 1;
  const colors = colorMap[color];

  // In alternate layout, even indices go on the left, odd on the right.
  const isRight = alternate && _index % 2 === 1;

  if (alternate) {
    // ── Alternate (two-column) layout ──────────────────────────────────────
    return (
      <li className={cn("relative flex flex-col md:flex-row gap-0 md:items-stretch", className)}>
        {/* Left content */}
        <div className="flex-1 flex justify-start md:justify-end md:pr-6 pb-4 md:pb-8">
          {!isRight && (
            <AlternateContent
              title={title}
              timestamp={timestamp}
              badge={badge}
              details={details}
              detailsId={detailsId}
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
              colors={colors}
              alignRight={false}
            >
              {children}
            </AlternateContent>
          )}
        </div>

        {/* Centre marker */}
        <div className="flex flex-col items-start md:items-center md:shrink-0 md:px-4">
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center ring-4 z-10 shrink-0",
              colors.iconBg,
              colors.dot.includes("ring")
                ? colors.dot.split(" ").slice(1).join(" ")
                : "ring-white dark:ring-gray-900"
            )}
            aria-hidden="true"
          >
            {icon ? (
              <span className={cn("w-5 h-5", colors.icon)}>{icon}</span>
            ) : (
              <span className={cn("w-2.5 h-2.5 rounded-full", colors.dot.split(" ")[0])} />
            )}
          </div>
          {!isLast && (
            <div className="w-0.5 h-8 bg-gray-200 dark:bg-gray-700 mt-1 md:flex-1" aria-hidden="true" />
          )}
        </div>

        {/* Right content */}
        <div className="flex-1 flex justify-start md:pl-6 pb-4 md:pb-8 ml-6 md:ml-0">
          {isRight && (
            <AlternateContent
              title={title}
              timestamp={timestamp}
              badge={badge}
              details={details}
              detailsId={detailsId}
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
              colors={colors}
              alignRight={false}
            >
              {children}
            </AlternateContent>
          )}
        </div>
      </li>
    );
  }

  // ── Standard vertical layout ───────────────────────────────────────────────
  return (
    <li className={cn("relative flex gap-2 sm:gap-4", !isLast && "pb-6 sm:pb-8", className)}>
      {/* Marker column */}
      <div className="flex flex-col items-center flex-shrink-0">
        {/* Icon circle */}
        <div
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center ring-4 z-10 flex-shrink-0",
            colors.iconBg,
            "ring-white dark:ring-gray-950"
          )}
          aria-hidden="true"
        >
          {icon ? (
            <span className={cn("w-5 h-5 flex items-center justify-center", colors.icon)}>
              {icon}
            </span>
          ) : (
            <span className={cn("w-2.5 h-2.5 rounded-full", colors.dot.split(" ")[0])} />
          )}
        </div>
        {/* Vertical connector */}
        {!isLast && (
          <div className="flex-1 w-0.5 bg-gray-200 dark:bg-gray-700 mt-2 min-h-12" aria-hidden="true" />
        )}
      </div>

      {/* Content */}
      <div className={cn("flex-1 min-w-0 pt-0.5 sm:pt-1.5", !isLast && "pb-1 sm:pb-2")}>
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white leading-tight break-words">
              {title}
            </h3>
            {badge && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 flex-shrink-0">
                {badge}
              </span>
            )}
          </div>
          {timestamp && (
            <time
              dateTime={
                timestamp instanceof Date
                  ? timestamp.toISOString()
                  : typeof timestamp === "number"
                    ? new Date(timestamp > 1e10 ? timestamp : timestamp * 1000).toISOString()
                    : timestamp
              }
              className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums"
            >
              {formatTimestamp(timestamp)}
            </time>
          )}
        </div>

        {/* Body */}
        {children && (
          <div className="mt-1 sm:mt-1.5 text-xs sm:text-sm text-gray-600 dark:text-gray-400 break-words">
            {children}
          </div>
        )}

        {/* Expandable details */}
        {details && (
          <div className="mt-1.5 sm:mt-2">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={() => setExpanded((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium transition-colors",
                "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              )}
            >
              <svg
                className={cn(
                  "w-3.5 h-3.5 transition-transform duration-150",
                  expanded && "rotate-180"
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              {expanded ? "Hide details" : "Show details"}
            </button>
            <div
              id={detailsId}
              hidden={!expanded}
              className="mt-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded-lg p-2 sm:p-3 leading-relaxed break-words"
            >
              {details}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AlternateContent — internal helper for two-column layout
// ─────────────────────────────────────────────────────────────────────────────

interface AlternateContentProps {
  title: string;
  timestamp?: number | string | Date | undefined;
  badge?: string | undefined;
  details?: string | undefined;
  detailsId: string;
  expanded: boolean;
  onToggle: () => void;
  colors: (typeof colorMap)[TimelineColor];
  alignRight: boolean;
  children?: React.ReactNode;
}

function AlternateContent({
  title,
  timestamp,
  badge,
  details,
  detailsId,
  expanded,
  onToggle,
  alignRight,
  children,
}: AlternateContentProps) {
  return (
    <div className={cn("max-w-sm", alignRight ? "text-right" : "text-left")}>
      <div className={cn("flex items-center gap-2 flex-wrap", alignRight && "justify-end")}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        {badge && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            {badge}
          </span>
        )}
      </div>
      {timestamp && (
        <time className="block text-xs text-gray-400 dark:text-gray-500 tabular-nums mt-0.5">
          {formatTimestamp(timestamp)}
        </time>
      )}
      {children && <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{children}</div>}
      {details && (
        <div className={cn("mt-2", alignRight && "flex flex-col items-end")}>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={onToggle}
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium transition-colors",
              "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            )}
          >
            <svg
              className={cn(
                "w-3.5 h-3.5 transition-transform duration-150",
                expanded && "rotate-180"
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            {expanded ? "Hide details" : "Show details"}
          </button>
          <div
            id={detailsId}
            hidden={!expanded}
            className="mt-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded-lg p-3 leading-relaxed text-left"
          >
            {details}
          </div>
        </div>
      )}
    </div>
  );
}
