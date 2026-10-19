"use client";

/**
 * SearchFilters.tsx
 *
 * Unified search + filter bar for verification-use-cases.
 * Combines:
 *   • Free-text search input
 *   • Status filter chips  (all / verified / pending / unverified / disputed / archived)
 *   • Time range selector  (all / last 24 h / last 7 days / last 30 days)
 *   • Asset type selector  (all / image / video / document / audio)
 *
 * Applied filters are always visible as active chips so users can see and
 * adjust what is active without opening a menu.  Search results update as
 * state changes — no submit button required.
 *
 * Accessibility:
 *   - Status chips use role="tablist" / role="tab" / aria-selected
 *   - Time-range and asset-type groups use role="group" with aria-labelledby
 *   - All interactive controls have focus-visible ring styles
 *   - Active filters summary is announced via aria-live="polite"
 *
 * Usage:
 * ─────────────────────────────────────────────────────────────────────────────
 *   const [filters, setFilters] = useState<SearchFiltersState>({
 *     status: "all",
 *     timeRange: "all",
 *     assetType: "all",
 *     query: "",
 *   });
 *
 *   <SearchFilters
 *     value={filters}
 *     onChange={setFilters}
 *     statusCounts={counts}
 *   />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useId } from "react";

import {
  AssetStatusFilterChips,
  type AssetStatusFilter,
} from "@/components/AssetStatusFilterChips";
import { Search } from "@/components/ui/Search";
import { cn } from "@/utils/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TimeRange = "all" | "24h" | "7d" | "30d";
export type AssetType = "all" | "image" | "video" | "document" | "audio";

export interface SearchFiltersState {
  query: string;
  status: AssetStatusFilter;
  timeRange: TimeRange;
  assetType: AssetType;
}

export interface SearchFiltersProps {
  value: SearchFiltersState;
  onChange: (next: SearchFiltersState) => void;
  /** Counts shown on status chips. */
  statusCounts?: Partial<Record<AssetStatusFilter, number>>;
  /** Placeholder text for the search input. */
  searchPlaceholder?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Option definitions
// ---------------------------------------------------------------------------

const TIME_RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: "all", label: "Any time" },
  { key: "24h", label: "Last 24 h" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

const ASSET_TYPE_OPTIONS: { key: AssetType; label: string }[] = [
  { key: "all", label: "All types" },
  { key: "image", label: "Image" },
  { key: "video", label: "Video" },
  { key: "document", label: "Document" },
  { key: "audio", label: "Audio" },
];

// ---------------------------------------------------------------------------
// Small reusable pill-button for time range / asset type
// ---------------------------------------------------------------------------

interface PillButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  id?: string;
}

function PillButton({ active, onClick, children, id }: PillButtonProps) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500",
        active
          ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900 shadow-sm"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Active filter pill (shows what is currently applied — dismissable)
// ---------------------------------------------------------------------------

interface ActiveFilterPillProps {
  label: string;
  onRemove: () => void;
}

function ActiveFilterPill({ label, onRemove }: ActiveFilterPillProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="ml-0.5 rounded-full hover:text-blue-900 dark:hover:text-blue-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// SearchFilters
// ---------------------------------------------------------------------------

export function SearchFilters({
  value,
  onChange,
  statusCounts,
  searchPlaceholder = "Search by title, creator address, or asset ID…",
  className,
}: SearchFiltersProps) {
  const timeGroupId = useId();
  const typeGroupId = useId();

  const set = <K extends keyof SearchFiltersState>(key: K, val: SearchFiltersState[K]) =>
    onChange({ ...value, [key]: val });

  // Build the list of active non-default filters for the summary bar
  const activeFilters: { label: string; clear: () => void }[] = [];
  if (value.status !== "all") {
    const label = value.status.charAt(0).toUpperCase() + value.status.slice(1);
    activeFilters.push({ label: `Status: ${label}`, clear: () => set("status", "all") });
  }
  if (value.timeRange !== "all") {
    const opt = TIME_RANGE_OPTIONS.find((o) => o.key === value.timeRange);
    activeFilters.push({ label: opt?.label ?? value.timeRange, clear: () => set("timeRange", "all") });
  }
  if (value.assetType !== "all") {
    const opt = ASSET_TYPE_OPTIONS.find((o) => o.key === value.assetType);
    activeFilters.push({ label: opt?.label ?? value.assetType, clear: () => set("assetType", "all") });
  }

  const hasActiveFilters = activeFilters.length > 0 || value.query !== "";

  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm divide-y divide-gray-100 dark:divide-gray-800",
        className
      )}
      data-testid="search-filters"
    >
      {/* ── Row 1: text search ─────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <Search
          value={value.query}
          onChange={(q) => set("query", q)}
          onSearch={(q) => set("query", q)}
          placeholder={searchPlaceholder}
          size="md"
          persistRecentSearches={false}
          aria-label="Search assets"
        />
      </div>

      {/* ── Row 2: status chips ────────────────────────────────────────────── */}
      <div className="px-4 py-2">
        <AssetStatusFilterChips
          selectedStatus={value.status}
          onSelectStatus={(s) => set("status", s)}
          counts={statusCounts}
          ariaLabel="Filter by verification status"
        />
      </div>

      {/* ── Row 3: time range + asset type ────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        {/* Time range */}
        <div
          role="tablist"
          aria-labelledby={`${timeGroupId}-label`}
          className="flex items-center gap-2"
        >
          <span
            id={`${timeGroupId}-label`}
            className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            Time
          </span>
          {TIME_RANGE_OPTIONS.map((opt) => (
            <PillButton
              key={opt.key}
              active={value.timeRange === opt.key}
              onClick={() => set("timeRange", opt.key)}
            >
              {opt.label}
            </PillButton>
          ))}
        </div>

        {/* Divider — hidden on small screens when they wrap */}
        <span className="hidden sm:block h-4 w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />

        {/* Asset type */}
        <div
          role="tablist"
          aria-labelledby={`${typeGroupId}-label`}
          className="flex items-center gap-2"
        >
          <span
            id={`${typeGroupId}-label`}
            className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            Type
          </span>
          {ASSET_TYPE_OPTIONS.map((opt) => (
            <PillButton
              key={opt.key}
              active={value.assetType === opt.key}
              onClick={() => set("assetType", opt.key)}
            >
              {opt.label}
            </PillButton>
          ))}
        </div>
      </div>

      {/* ── Row 4: active filter summary (visible only when filters are set) ─ */}
      {hasActiveFilters && (
        <div
          className="flex flex-wrap items-center gap-2 px-4 py-2"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Active:</span>

          {value.query !== "" && (
            <ActiveFilterPill
              label={`"${value.query}"`}
              onRemove={() => set("query", "")}
            />
          )}

          {activeFilters.map((f) => (
            <ActiveFilterPill key={f.label} label={f.label} onRemove={f.clear} />
          ))}

          <button
            type="button"
            onClick={() =>
              onChange({ status: "all", timeRange: "all", assetType: "all", query: "" })
            }
            className="ml-auto text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

export default SearchFilters;
