"use client";

import React from "react";

export type AssetStatusFilter = "all" | "verified" | "pending" | "unverified" | "disputed" | "archived";

export interface StatusFilterOption {
  key: AssetStatusFilter;
  label: string;
  badgeClass: string;
  activeClass: string;
}

export const STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
  {
    key: "all",
    label: "All",
    badgeClass: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    activeClass: "bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm border-gray-900 dark:border-white",
  },
  {
    key: "verified",
    label: "Verified",
    badgeClass: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    activeClass: "bg-emerald-600 text-white border-emerald-600 shadow-sm",
  },
  {
    key: "pending",
    label: "Pending",
    badgeClass: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    activeClass: "bg-amber-600 text-white border-amber-600 shadow-sm",
  },
  {
    key: "unverified",
    label: "Unverified",
    badgeClass: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    activeClass: "bg-rose-600 text-white border-rose-600 shadow-sm",
  },
  {
    key: "disputed",
    label: "Disputed",
    badgeClass: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    activeClass: "bg-purple-600 text-white border-purple-600 shadow-sm",
  },
  {
    key: "archived",
    label: "Archived",
    badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    activeClass: "bg-slate-700 text-white border-slate-700 shadow-sm",
  },
];

export interface AssetStatusFilterChipsProps {
  selectedStatus: AssetStatusFilter;
  onSelectStatus: (status: AssetStatusFilter) => void;
  counts?: Partial<Record<AssetStatusFilter, number>>;
  className?: string;
  ariaLabel?: string;
}

/**
 * Helper to match an asset/record status with the selected filter.
 */
export function matchesAssetStatusFilter(
  assetStatus: string | undefined | null,
  filter: AssetStatusFilter
): boolean {
  if (filter === "all") return true;
  if (!assetStatus) return filter === "unverified";

  const normalized = assetStatus.toLowerCase();

  switch (filter) {
    case "verified":
      return normalized === "certified" || normalized === "verified" || normalized === "valid";
    case "pending":
      return normalized === "pending" || normalized === "processing" || normalized === "in_progress";
    case "unverified":
      return normalized === "unverified" || normalized === "failed" || normalized === "rejected";
    case "disputed":
      return normalized === "disputed" || normalized === "flagged" || normalized === "challenged";
    case "archived":
      return normalized === "archived" || normalized === "deprecated";
    default:
      return true;
  }
}

export function AssetStatusFilterChips({
  selectedStatus,
  onSelectStatus,
  counts,
  className = "",
  ariaLabel = "Filter assets by status",
}: AssetStatusFilterChipsProps) {
  return (
    <nav
      className={`flex flex-wrap items-center gap-2 py-2 ${className}`}
      aria-label={ariaLabel}
      role="tablist"
    >
      {STATUS_FILTER_OPTIONS.map((opt) => {
        const isActive = selectedStatus === opt.key;
        const count = counts?.[opt.key];

        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${opt.key}`}
            onClick={() => onSelectStatus(opt.key)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium leading-5 transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 cursor-pointer ${
              isActive
                ? opt.activeClass
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
            data-testid={`filter-chip-${opt.key}`}
            data-active={isActive ? "true" : "false"}
          >
            {isActive && <span aria-hidden="true">✓</span>}
            <span>{opt.label}</span>
            {count !== undefined && (
              <span
                className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
export default AssetStatusFilterChips;
