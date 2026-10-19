"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { computeConfidence } from "@stellarveriphy/shared/scoring";
import type { VerificationRecord } from "@stellarveriphy/shared/types";
import ConfidenceScore from "@/components/ConfidenceScore";
import StatusBadge from "@/components/StatusBadge";
import {
  matchesAssetStatusFilter,
  type AssetStatusFilter,
} from "@/components/AssetStatusFilterChips";
import { CollapsibleMetadataPanel } from "@/components/ui/CollapsibleMetadataPanel";
import { CardGrid } from "@/components/ui/CardGrid";
import { SearchFilters, type SearchFiltersState } from "@/components/ui/SearchFilters";

interface ExploreClientProps {
  initialRecords: VerificationRecord[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when a record's timestamp falls within the chosen time window. */
function matchesTimeRange(
  record: VerificationRecord,
  range: SearchFiltersState["timeRange"]
): boolean {
  if (range === "all") return true;
  const ts = new Date(record.manifest.timestamp).getTime();
  const now = Date.now();
  const cutoffs: Record<Exclude<SearchFiltersState["timeRange"], "all">, number> = {
    "24h": now - 24 * 60 * 60 * 1000,
    "7d": now - 7 * 24 * 60 * 60 * 1000,
    "30d": now - 30 * 24 * 60 * 60 * 1000,
  };
  return ts >= cutoffs[range];
}

/** Returns true when a record's mediaType matches the chosen asset type filter. */
function matchesAssetType(
  record: VerificationRecord,
  assetType: SearchFiltersState["assetType"]
): boolean {
  if (assetType === "all") return true;
  return record.mediaType?.toLowerCase() === assetType;
}

// ---------------------------------------------------------------------------
// ExploreClient
// ---------------------------------------------------------------------------

export function ExploreClient({ initialRecords }: ExploreClientProps) {
  const [filters, setFilters] = useState<SearchFiltersState>({
    status: "all",
    timeRange: "all",
    assetType: "all",
    query: "",
  });

  // Status counts (unaffected by status filter itself, so chips show totals)
  const statusCounts = useMemo(() => {
    const map: Partial<Record<AssetStatusFilter, number>> = {
      all: initialRecords.length,
      verified: 0,
      pending: 0,
      unverified: 0,
      disputed: 0,
      archived: 0,
    };
    for (const r of initialRecords) {
      if (matchesAssetStatusFilter(r.status, "verified")) map.verified = (map.verified ?? 0) + 1;
      if (matchesAssetStatusFilter(r.status, "pending")) map.pending = (map.pending ?? 0) + 1;
      if (matchesAssetStatusFilter(r.status, "unverified")) map.unverified = (map.unverified ?? 0) + 1;
      if (matchesAssetStatusFilter(r.status, "disputed")) map.disputed = (map.disputed ?? 0) + 1;
      if (matchesAssetStatusFilter(r.status, "archived")) map.archived = (map.archived ?? 0) + 1;
    }
    return map;
  }, [initialRecords]);

  const filteredRecords = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return initialRecords.filter((r) => {
      if (!matchesAssetStatusFilter(r.status, filters.status)) return false;
      if (!matchesTimeRange(r, filters.timeRange)) return false;
      if (!matchesAssetType(r, filters.assetType)) return false;
      if (q) {
        const haystack = [r.title, r.id, r.mediaType, r.manifest.creator]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [initialRecords, filters]);

  const hasActiveFilters =
    filters.status !== "all" ||
    filters.timeRange !== "all" ||
    filters.assetType !== "all" ||
    filters.query !== "";

  return (
    <div className="mt-6 space-y-6">
      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <SearchFilters
        value={filters}
        onChange={setFilters}
        statusCounts={statusCounts}
      />

      {/* ── Result count ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
        <span>
          Showing <strong className="text-slate-700 dark:text-gray-200">{filteredRecords.length}</strong> of {initialRecords.length} assets
        </span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() =>
              setFilters({ status: "all", timeRange: "all", assetType: "all", query: "" })
            }
            className="text-blue-600 dark:text-blue-400 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 rounded"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────────── */}
      {filteredRecords.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-gray-800 p-12 text-center text-slate-500">
          <p className="text-base font-medium">No assets found</p>
          <p className="mt-1 text-sm">Try adjusting your filters or search query.</p>
          <button
            type="button"
            onClick={() =>
              setFilters({ status: "all", timeRange: "all", assetType: "all", query: "" })
            }
            className="mt-4 inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <CardGrid as="ul" layout="listing">
          {filteredRecords.map((record) => (
            <li
              key={record.id}
              className="relative flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-indigo-600 dark:border-gray-800 dark:bg-gray-900 overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 px-5 pt-5 text-xs uppercase tracking-wide text-slate-500">
                <span>{record.mediaType}</span>
                <StatusBadge status={record.status} />
              </div>

              <div className="px-5 pt-3 pb-4 flex-1">
                <h2 className="font-semibold">
                  <Link
                    href={`/certificates/${record.id}`}
                    className="hover:underline focus:outline-none dark:text-white"
                  >
                    {record.title}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {new Date(record.manifest.timestamp).toLocaleDateString("en", {
                    dateStyle: "medium",
                  })}
                </p>
                <div className="mt-3">
                  <ConfidenceScore result={computeConfidence(record)} />
                </div>
              </div>

              {/* Collapsible metadata — only rendered when metadata exists */}
              {record.manifest.metadata &&
                Object.keys(record.manifest.metadata).length > 0 && (
                  <div className="border-t border-slate-100 dark:border-gray-800">
                    <CollapsibleMetadataPanel
                      title="File metadata"
                      metadata={
                        record.manifest.metadata as Record<
                          string,
                          string | number | boolean | null | undefined
                        >
                      }
                      previewCount={2}
                      bare
                    />
                  </div>
                )}
            </li>
          ))}
        </CardGrid>
      )}
    </div>
  );
}
export default ExploreClient;
