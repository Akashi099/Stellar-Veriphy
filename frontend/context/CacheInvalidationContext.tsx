"use client";

import React, { createContext, useContext, useEffect, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/config/cache";

export type InvalidationDomain = "certificates" | "manifests" | "assets" | "transactions" | "jobs" | "all";

export interface CacheInvalidationContextValue {
  /** Invalidate specific certificate by id, or all certificate queries if omitted */
  invalidateCertificates: (id?: string) => Promise<void>;
  /** Invalidate specific manifest by id, or all manifest queries if omitted */
  invalidateManifests: (manifestId?: string) => Promise<void>;
  /** Invalidate specific asset/upload by id or hash, or all asset queries if omitted */
  invalidateAssets: (assetId?: string) => Promise<void>;
  /** Invalidate verification jobs */
  invalidateJobs: (jobId?: string) => Promise<void>;
  /** Invalidate by domain or all caches */
  invalidateDomain: (domain: InvalidationDomain, id?: string) => Promise<void>;
  /** Actively revalidate all queries relevant to the current page route */
  refreshCurrentView: () => Promise<void>;
}

const CacheInvalidationContext = createContext<CacheInvalidationContextValue | undefined>(undefined);

export function CacheInvalidationProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const pathname = usePathname();

  // Invalidate certificate cache entries
  const invalidateCertificates = useCallback(
    async (id?: string) => {
      if (id) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.certificates.detail(id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.certificates.byId(id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.certificates.searches() }),
        ]);
      } else {
        await queryClient.invalidateQueries({ queryKey: queryKeys.certificates.all });
      }
    },
    [queryClient]
  );

  // Invalidate manifest cache entries
  const invalidateManifests = useCallback(
    async (manifestId?: string) => {
      if (manifestId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["manifests", "detail", manifestId] }),
          queryClient.invalidateQueries({ queryKey: ["manifests", "list"] }),
        ]);
      } else {
        await queryClient.invalidateQueries({ queryKey: ["manifests"] });
      }
    },
    [queryClient]
  );

  // Invalidate asset and upload cache entries
  const invalidateAssets = useCallback(
    async (assetId?: string) => {
      if (assetId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["assets", "detail", assetId] }),
          queryClient.invalidateQueries({ queryKey: ["uploads", assetId] }),
          queryClient.invalidateQueries({ queryKey: ["assets", "list"] }),
        ]);
      } else {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["assets"] }),
          queryClient.invalidateQueries({ queryKey: ["uploads"] }),
        ]);
      }
    },
    [queryClient]
  );

  // Invalidate verification job cache entries
  const invalidateJobs = useCallback(
    async (jobId?: string) => {
      if (jobId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["jobs", jobId] }),
          queryClient.invalidateQueries({ queryKey: ["jobs", "list"] }),
        ]);
      } else {
        await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      }
    },
    [queryClient]
  );

  // Generic domain invalidator
  const invalidateDomain = useCallback(
    async (domain: InvalidationDomain, id?: string) => {
      switch (domain) {
        case "certificates":
          return invalidateCertificates(id);
        case "manifests":
          return invalidateManifests(id);
        case "assets":
          return invalidateAssets(id);
        case "jobs":
          return invalidateJobs(id);
        case "transactions":
          return queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all });
        case "all":
        default:
          return queryClient.invalidateQueries();
      }
    },
    [invalidateCertificates, invalidateManifests, invalidateAssets, invalidateJobs, queryClient]
  );

  // Refresh current view based on active route
  const refreshCurrentView = useCallback(async () => {
    if (!pathname) return;

    if (pathname.startsWith("/certificates") || pathname.startsWith("/certificate")) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.certificates.all, refetchType: "active" });
    } else if (pathname.startsWith("/creator") || pathname.includes("/jobs")) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["jobs"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["uploads"], refetchType: "active" }),
      ]);
    } else if (pathname.startsWith("/dashboard")) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.certificates.all, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["jobs"], refetchType: "active" }),
      ]);
    } else if (pathname.startsWith("/transactions")) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all, refetchType: "active" });
    }
  }, [pathname, queryClient]);

  // Acceptance Criterion: "The status of a record is refreshed when the user navigates back to a view."
  useEffect(() => {
    refreshCurrentView();
  }, [pathname, refreshCurrentView]);

  // Cross-tab synchronization via BroadcastChannel
  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;

    const channel = new BroadcastChannel("stellar_cache_sync");
    channel.onmessage = (event) => {
      const { domain, id } = event.data || {};
      if (domain) {
        invalidateDomain(domain, id);
      }
    };

    return () => {
      channel.close();
    };
  }, [invalidateDomain]);

  const value = useMemo(
    () => ({
      invalidateCertificates,
      invalidateManifests,
      invalidateAssets,
      invalidateJobs,
      invalidateDomain,
      refreshCurrentView,
    }),
    [invalidateCertificates, invalidateManifests, invalidateAssets, invalidateJobs, invalidateDomain, refreshCurrentView]
  );

  return (
    <CacheInvalidationContext.Provider value={value}>
      {children}
    </CacheInvalidationContext.Provider>
  );
}

/**
 * Custom hook for triggering smarter cache invalidations across components.
 */
export function useCacheInvalidation(): CacheInvalidationContextValue {
  const context = useContext(CacheInvalidationContext);
  if (!context) {
    throw new Error("useCacheInvalidation must be used within a CacheInvalidationProvider");
  }
  return context;
}
