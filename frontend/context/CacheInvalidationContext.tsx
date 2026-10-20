"use client";

import React, { createContext, useContext, useEffect, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/config/cache";

export type InvalidationDomain = "certificates" | "manifests" | "assets" | "transactions" | "jobs" | "all";

/** BroadcastChannel name used for cross-tab cache synchronization */
export const CACHE_SYNC_CHANNEL = "stellar_cache_sync";

/** Message type emitted by the service worker when a new cache version is activated */
export const CACHE_VERSION_MESSAGE = "CACHE_VERSION_CHANGED";

export interface CacheVersionEventDetail {
  /** The newly activated cache version (e.g. build id or timestamp) */
  version: string;
  /** The previously active cache version, if known */
  previousVersion?: string;
}

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
  /** The currently active service worker cache version, if known */
  cacheVersion: string | null;
  /** Safely invalidate stale caches after a version change without disrupting sessions */
  handleCacheVersionChange: (version: string, previousVersion?: string) => Promise<void>;
}

/**
 * Keys that must never be purged during cache invalidation because they hold
 * authentication/session state. Preserving these keeps existing user sessions
 * stable while stale public data is refreshed.
 */
const PROTECTED_STORAGE_PREFIXES = [
  "auth",
  "token",
  "session",
  "stellar_auth",
  "supabase.auth",
  "wallet",
];

function isProtectedStorageKey(key: string): boolean {
  const lower = key.toLowerCase();
  return PROTECTED_STORAGE_PREFIXES.some((prefix) => lower.startsWith(prefix) || lower.includes(prefix));
}

/**
 * Remove stale, non-protected entries from localStorage/sessionStorage.
 * Auth and session keys are always preserved.
 */
function purgeStaleStorage(): void {
  if (typeof window === "undefined") return;

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && !isProtectedStorageKey(key) && key.startsWith("cache:")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => storage.removeItem(key));
    } catch {
      // Storage may be unavailable (private mode, quota); ignore safely.
    }
  }
}

const CacheInvalidationContext = createContext<CacheInvalidationContextValue | undefined>(undefined);

export function CacheInvalidationProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [cacheVersion, setCacheVersion] = React.useState<string | null>(null);
  const cacheVersionRef = React.useRef<string | null>(null);

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

  // Safely handle a service worker cache version change.
  // Only public/query caches are invalidated; auth storage and active sessions are preserved.
  const handleCacheVersionChange = useCallback(
    async (version: string, previousVersion?: string) => {
      if (!version || cacheVersionRef.current === version) return;

      const previous = previousVersion ?? cacheVersionRef.current ?? undefined;
      cacheVersionRef.current = version;
      setCacheVersion(version);

      // Purge only stale, non-protected cache entries from web storage.
      purgeStaleStorage();

      // Refresh active queries so new asset versions are reflected promptly,
      // while leaving inactive queries intact to avoid disrupting the session.
      await queryClient.invalidateQueries({ refetchType: "active" });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent<CacheVersionEventDetail>("cache-version-change", {
            detail: { version, previousVersion: previous },
          })
        );
      }
    },
    [queryClient]
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

  // Listen for cache version changes broadcast by the service worker or other tabs.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === CACHE_VERSION_MESSAGE && typeof data.version === "string") {
        handleCacheVersionChange(data.version, data.previousVersion);
      }
    };

    // Service worker -> page messages
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
    }

    // Cross-tab cache version propagation
    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(CACHE_SYNC_CHANNEL);
      channel.onmessage = (event) => {
        const data = event.data || {};
        if (data.type === CACHE_VERSION_MESSAGE && typeof data.version === "string") {
          handleCacheVersionChange(data.version, data.previousVersion);
        } else if (data.domain) {
          invalidateDomain(data.domain, data.id);
        }
      };
    }

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMessage);
      }
      channel?.close();
    };
  }, [handleCacheVersionChange, invalidateDomain]);

  const value = useMemo(
    () => ({
      invalidateCertificates,
      invalidateManifests,
      invalidateAssets,
      invalidateJobs,
      invalidateDomain,
      refreshCurrentView,
      cacheVersion,
      handleCacheVersionChange,
    }),
    [
      invalidateCertificates,
      invalidateManifests,
      invalidateAssets,
      invalidateJobs,
      invalidateDomain,
      refreshCurrentView,
      cacheVersion,
      handleCacheVersionChange,
    ]
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
