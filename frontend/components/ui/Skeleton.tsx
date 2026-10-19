"use client";

/**
 * Skeleton.tsx
 *
 * Reusable skeleton loading components with pulse animation.
 * Provides content-aware loading states for better perceived performance.
 */

import { cn } from "@/lib/utils";
import { cardGridClassName } from "./CardGrid";

// ---------------------------------------------------------------------------
// Base Skeleton Component
// ---------------------------------------------------------------------------

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string | undefined;
  animate?: boolean | undefined;
  rounded?: "none" | "sm" | "md" | "lg" | "full" | undefined;
}

export function Skeleton({
  className,
  animate = true,
  rounded = "md",
  style,
  ...props
}: SkeletonProps) {
  const roundedClass = {
    none: "",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-full",
  };

  return (
    <div
      className={cn(
        "bg-gray-200 dark:bg-gray-800",
        animate && "animate-pulse",
        roundedClass[rounded],
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading content"
      style={style}
      {...props}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Certificate Card Skeleton
// ---------------------------------------------------------------------------

export function CertificateCardSkeleton() {
  return (
    <div
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
      role="status"
      aria-label="Loading certificate"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <Skeleton className="w-10 h-10" rounded="lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-6 w-20" rounded="full" />
      </div>

      {/* Body */}
      <div className="px-6 py-4 space-y-3">
        <div className="flex items-start justify-between py-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex items-start justify-between py-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="flex items-start justify-between py-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="flex items-start justify-between py-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex gap-3">
        <Skeleton className="h-10 flex-1" rounded="lg" />
        <Skeleton className="h-10 w-10" rounded="lg" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transaction List Skeleton
// ---------------------------------------------------------------------------

export function TransactionListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-px" role="status" aria-label="Loading transactions">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4"
        >
          <div className="flex items-center gap-4">
            {/* Status icon */}
            <Skeleton className="w-5 h-5" rounded="full" />

            {/* Type */}
            <Skeleton className="h-4 w-32" />

            {/* Description */}
            <Skeleton className="h-4 flex-1" />

            {/* Hash */}
            <Skeleton className="h-4 w-36" />

            {/* Date */}
            <Skeleton className="h-4 w-24" />

            {/* Actions */}
            <Skeleton className="h-8 w-16" rounded="md" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Widget Skeleton
// ---------------------------------------------------------------------------

export function DashboardWidgetSkeleton() {
  return (
    <div
      className="h-full bg-white dark:bg-gray-900 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-800"
      role="status"
      aria-label="Loading widget"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-20" />
        </div>
        <Skeleton className="w-8 h-8" rounded="full" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table Skeleton
// ---------------------------------------------------------------------------

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden"
      role="status"
      aria-label="Loading table"
    >
      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      </div>

      {/* Rows */}
      <div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 last:border-b-0"
          >
            <div className="flex gap-4">
              {Array.from({ length: cols }).map((_, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List Item Skeleton
// ---------------------------------------------------------------------------

export function ListItemSkeleton() {
  return (
    <div
      className="flex items-center gap-4 py-3 px-4 border-b border-gray-200 dark:border-gray-700"
      role="status"
      aria-label="Loading item"
    >
      <Skeleton className="w-12 h-12" rounded="full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-full max-w-xs" />
        <Skeleton className="h-3 w-full max-w-sm" />
      </div>
      <Skeleton className="h-8 w-20" rounded="md" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card Grid Skeleton
// ---------------------------------------------------------------------------

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      role="status"
      aria-label="Loading cards"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-800"
        >
          <div className="space-y-4">
            <Skeleton className="w-12 h-12" rounded="lg" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <Skeleton className="h-10 w-full" rounded="md" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail Gallery Grid Skeleton
// ---------------------------------------------------------------------------

/** Matches CertificateGallery's square-thumbnail card grid (2/3/4 cols responsive). */
export function GalleryGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div
      className={cardGridClassName("gallery")}
      role="status"
      aria-label="Loading gallery"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800"
        >
          <Skeleton className="aspect-square w-full" rounded="none" />
          <div className="space-y-1.5 p-3">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats Cards Skeleton
// ---------------------------------------------------------------------------

export function StatsCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className={cardGridClassName("stats-3")}
      role="status"
      aria-label="Loading statistics"
    >
      {Array.from({ length: count }).map((_, i) => (
        <DashboardWidgetSkeleton key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form Skeleton
// ---------------------------------------------------------------------------

export function FormSkeleton() {
  return (
    <div
      className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-800 space-y-6"
      role="status"
      aria-label="Loading form"
    >
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" rounded="md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" rounded="md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-24 w-full" rounded="md" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-10 w-24" rounded="md" />
        <Skeleton className="h-10 w-24" rounded="md" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Header Skeleton
// ---------------------------------------------------------------------------

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-3 mb-8" role="status" aria-label="Loading page header">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// List Skeleton (generic, content-agnostic list of items)
// ---------------------------------------------------------------------------

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading list">
      {Array.from({ length: count }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Skeleton (stat cards + widget grid)
// ---------------------------------------------------------------------------

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <PageHeaderSkeleton />
      <StatsCardsSkeleton />
      <CardGridSkeleton count={3} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text Line Skeleton
// ---------------------------------------------------------------------------

export function TextLineSkeleton({ width = "full" }: { width?: string | number }) {
  const widthClass = typeof width === "string" ? `w-${width}` : "";
  const widthStyle = typeof width === "number" ? { width: `${width}px` } : {};

  return (
    <Skeleton
      className={`h-4 ${widthClass}`}
      style={widthStyle}
      role="status"
      aria-label="Loading text"
    />
  );
}
