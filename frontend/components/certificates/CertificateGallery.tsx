"use client";

/**
 * CertificateGallery.tsx
 *
 * Grid gallery for browsing certificates (Issue #461).
 *
 * Features:
 * - Responsive grid layout with deterministic gradient thumbnails
 * - Lightbox modal on click showing full certificate details
 * - Filter by creator, sort by newest/oldest
 * - Infinite scroll (via {@link useInfiniteScroll}) that pages through
 *   {@link searchCertificates}
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { CopyButton } from "@/components/CopyButton";
import { CardGrid } from "@/components/ui/CardGrid";
import { RetryableError } from "@/components/ui/RetryableError";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import {
  type CertificateDetails,
  searchCertificates,
} from "@/services/certificateVerificationService";

const PAGE_SIZE = 9;

type SortOrder = "newest" | "oldest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic hue from a certificate id/hash so thumbnails don't flicker on re-render. */
function hueFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % 360;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CertificateGalleryProps {
  className?: string;
}

export function CertificateGallery({ className = "" }: CertificateGalleryProps) {
  const [items, setItems] = useState<CertificateDetails[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<{ error: unknown; offset: number } | null>(null);
  const [creatorFilter, setCreatorFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [selected, setSelected] = useState<CertificateDetails | null>(null);

  const loadPage = useCallback(
    async (nextOffset: number) => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await searchCertificates({
          creator: creatorFilter || undefined,
          offset: nextOffset,
          limit: PAGE_SIZE,
        });
        if (res.success && res.data) {
          setItems((prev) =>
            nextOffset === 0 ? res.data!.certificates : [...prev, ...res.data!.certificates]
          );
          setTotal(res.data.total);
          setOffset(nextOffset + res.data.certificates.length);
        } else {
          setLoadError({ error: new Error(res.error ?? "Could not load certificates."), offset: nextOffset });
        }
      } catch (err) {
        setLoadError({ error: err, offset: nextOffset });
      } finally {
        setLoading(false);
      }
    },
    [creatorFilter]
  );

  // Reload from scratch whenever the filter changes.
  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  const { sentinelRef, isIntersecting, reset } = useInfiniteScroll({
    enabled: !loading && !loadError && items.length < total,
  });

  useEffect(() => {
    if (isIntersecting && !loading && !loadError && items.length < total) {
      loadPage(offset).then(reset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntersecting]);

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) =>
      sortOrder === "newest" ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
    );
    return copy;
  }, [items, sortOrder]);

  return (
    <div className={className}>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={creatorFilter}
          onChange={(e) => setCreatorFilter(e.target.value)}
          placeholder="Search by creator address (e.g., GXYZ…)"
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {/* Initial load: skeleton grid instead of an abrupt blank area */}
      {items.length === 0 && loading && <GalleryGridSkeleton />}

      {/* Grid */}
      {items.length > 0 && (
        <CardGrid layout="gallery">
          {sorted.map((cert) => {
            const hue = hueFromId(cert.id);
            return (
              <button
                key={cert.id}
                onClick={() => setSelected(cert)}
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-800 dark:bg-gray-900"
                aria-label={`View certificate ${cert.id}`}
              >
                <div
                  className="flex aspect-square items-center justify-center text-3xl font-bold text-white/90"
                  style={{
                    background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 60) % 360} 70% 55%))`,
                  }}
                >
                  #{cert.id}
                </div>
                <div className="p-3">
                  <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">
                    {cert.creator.slice(0, 8)}…{cert.creator.slice(-4)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(cert.timestamp)}
                  </p>
                </div>
              </button>
            );
          })}
        </CardGrid>
      )}

      {/* First page failed: replace the grid with a retryable error, not a misleading empty state */}
      {items.length === 0 && loadError && (
        <RetryableError
          error={loadError.error}
          title="Couldn't load certificates"
          onRetry={() => loadPage(loadError.offset)}
          retrying={loading}
        />
      )}

      {items.length === 0 && !loading && !loadError && (
        <div className="py-16 text-center">
          <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No certificates found
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            {creatorFilter
              ? "No certificates match your current filter. Try adjusting your search criteria."
              : "There are no certificates available yet. Start by creating one or browsing existing content."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {creatorFilter && (
              <button
                onClick={() => setCreatorFilter("")}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                Clear filter
              </button>
            )}
            <a
              href="/verify"
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
            >
              Create certificate
            </a>
          </div>
        </div>
      )}

      {items.length === 0 && !loading && !loadError && !creatorFilter && (
        <EmptyState
          illustration="certificates"
          heading="No verified assets yet"
          body="Certificates you create will show up here as soon as they're verified. Upload your first piece of content to generate its provenance record."
          primaryAction={{
            label: "Upload content",
            href: "/creator/upload-content",
          }}
          secondaryAction={{
            label: "Learn how verification works",
            href: "/learn",
          }}
        />
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-8" />
      {/* Subsequent pages (items already showing): a lightweight inline indicator rather than re-showing the full skeleton grid. */}
      {items.length > 0 && loading && (
        <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400" role="status">Loading more…</p>
      )}
      {/* A later page failed: keep what's loaded and offer to retry just that page */}
      {items.length > 0 && loadError && !loading && (
        <RetryableError
          variant="inline"
          error={loadError.error}
          title="Couldn't load more certificates"
          onRetry={() => loadPage(loadError.offset)}
        />
      )}

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Certificate #{selected.id}
              </h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => {
                    const manifestData = {
                      id: selected.id,
                      creator: selected.creator,
                      storageRef: selected.storageRef,
                      manifestHash: selected.manifestHash,
                      timestamp: selected.timestamp,
                    };
                    const blob = new Blob([JSON.stringify(manifestData, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `certificate-${selected.id}-manifest.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  aria-label="Download certificate manifest"
                  title="Download certificate as JSON"
                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Creator</dt>
                <dd className="break-all font-mono text-gray-800 dark:text-gray-200">
                  {selected.creator}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Storage reference</dt>
                <dd className="break-all font-mono text-gray-800 dark:text-gray-200">
                  {selected.storageRef}
                </dd>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <dt className="text-gray-500 dark:text-gray-400">Manifest hash</dt>
                  <CopyButton
                    text={selected.manifestHash}
                    label="Copy manifest hash"
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
                  />
                </div>
                <dd className="break-all font-mono text-xs text-gray-800 dark:text-gray-200">
                  {selected.manifestHash}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Created</dt>
                <dd className="text-gray-800 dark:text-gray-200">
                  {formatDate(selected.timestamp)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

export default CertificateGallery;
