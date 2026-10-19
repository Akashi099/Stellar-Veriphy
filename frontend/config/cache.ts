/**
 * cache.ts
 *
 * React Query cache configuration — TTLs, retry policies, and query-key
 * factories for every data domain in the application.
 *
 * Import `queryClient` for use in React Query Provider, or use the
 * `queryKeys` factory to build consistent cache keys across hooks.
 *
 * @module config/cache
 */

import { QueryClient } from "@tanstack/react-query";

import {
  CACHE_GC_TIME_MS,
  CACHE_RETRY_COUNT,
  CACHE_RETRY_DELAY_MS,
  CACHE_TTL_BLOCKCHAIN_MS,
  CACHE_TTL_CERTIFICATE_MS,
  CACHE_TTL_SEARCH_MS,
  CACHE_TTL_TX_HISTORY_MS,
} from "./app";

// ---------------------------------------------------------------------------
// Singleton QueryClient
// ---------------------------------------------------------------------------

/**
 * Singleton React Query client shared by the whole application.
 *
 * Default options:
 * - `staleTime`  — per-domain TTL; see `CACHE_TTL_*` in `config/app.ts`
 * - `gcTime`     — 10 min (keep unused data in memory before GC)
 * - `retry`      — 3 attempts with exponential back-off capped at 30 s
 * - `refetchOnWindowFocus` — disabled to prevent over-fetching on tab switch
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: CACHE_TTL_CERTIFICATE_MS,
      gcTime: CACHE_GC_TIME_MS,
      retry: CACHE_RETRY_COUNT,
      retryDelay: (attempt) =>
        Math.min(CACHE_RETRY_DELAY_MS * 2 ** attempt, 30_000),
      refetchOnWindowFocus: false,
    },
  },
});

// ---------------------------------------------------------------------------
// Per-domain stale times
// ---------------------------------------------------------------------------

/**
 * Domain-specific stale times consumed by `useQuery` `staleTime` option.
 *
 * Usage:
 * ```ts
 * useQuery({ queryKey: queryKeys.certificate(id), staleTime: STALE_TIMES.certificate })
 * ```
 */
export const STALE_TIMES = {
  /** Individual certificate details (5 min). */
  certificate: CACHE_TTL_CERTIFICATE_MS,
  /** Search / list results (2 min). */
  search: CACHE_TTL_SEARCH_MS,
  /** Live blockchain data, e.g. network status (30 s). */
  blockchain: CACHE_TTL_BLOCKCHAIN_MS,
  /** Transaction history (1 min). */
  txHistory: CACHE_TTL_TX_HISTORY_MS,
} as const;

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------

/**
 * Typed query-key factory.
 *
 * All keys are arrays so React Query can perform hierarchical invalidation.
 * For example, invalidating `queryKeys.certificates.all` removes every
 * certificate-related entry from the cache.
 *
 * @example
 * ```ts
 * // Fetch a certificate by id
 * useQuery({ queryKey: queryKeys.certificates.detail("cert-1") })
 *
 * // Invalidate all certificate search results
 * queryClient.invalidateQueries({ queryKey: queryKeys.certificates.searches() })
 * ```
 */
export const queryKeys = {
  certificates: {
    /** Root key — invalidates everything under `certificates`. */
    all: ["certificates"] as const,
    /** All paginated list / search results. */
    searches: () => [...queryKeys.certificates.all, "search"] as const,
    /** A specific search with its filter parameters. */
    search: (filters: unknown) =>
      [...queryKeys.certificates.searches(), filters] as const,
    /** All individual certificate details. */
    details: () => [...queryKeys.certificates.all, "detail"] as const,
    /** A single certificate by its on-chain id. */
    detail: (id: string) => [...queryKeys.certificates.details(), id] as const,
    /** Certificates searched by on-chain id. */
    byId: (id: string) =>
      [...queryKeys.certificates.all, "byId", id] as const,
    /** Certificates looked up via verification code. */
    byCode: (code: string) =>
      [...queryKeys.certificates.all, "byCode", code] as const,
    /** All certificates belonging to a creator address. */
    byCreator: (creator: string, offset?: number, limit?: number) =>
      [...queryKeys.certificates.all, "byCreator", creator, offset, limit] as const,
    /** Cryptographic authenticity check for one certificate. */
    authenticity: (id: string) =>
      [...queryKeys.certificates.all, "authenticity", id] as const,
  },

  transactions: {
    /** Root key — invalidates all transaction cache entries. */
    all: ["transactions"] as const,
    /** Paginated history for a wallet address. */
    history: (address: string, filters?: unknown, page?: number) =>
      [...queryKeys.transactions.all, "history", address, filters, page] as const,
    /** A single transaction by its Stellar hash. */
    detail: (hash: string) =>
      [...queryKeys.transactions.all, "detail", hash] as const,
    /** Aggregate statistics for a wallet address. */
    stats: (address: string) =>
      [...queryKeys.transactions.all, "stats", address] as const,
  },

  network: {
    /** Root key — invalidates all network / blockchain cache entries. */
    all: ["network"] as const,
    /** Current network status / health. */
    status: () => [...queryKeys.network.all, "status"] as const,
    /** Fee estimate from Horizon. */
    fees: () => [...queryKeys.network.all, "fees"] as const,
  },

  manifests: {
    all: ["manifests"] as const,
    list: () => [...queryKeys.manifests.all, "list"] as const,
    detail: (id: string) => [...queryKeys.manifests.all, "detail", id] as const,
  },

  assets: {
    all: ["assets"] as const,
    list: () => [...queryKeys.assets.all, "list"] as const,
    detail: (id: string) => [...queryKeys.assets.all, "detail", id] as const,
    byHash: (hash: string) => [...queryKeys.assets.all, "hash", hash] as const,
  },

  uploads: {
    all: ["uploads"] as const,
    detail: (id: string) => [...queryKeys.uploads.all, id] as const,
    byHash: (hash: string) => [...queryKeys.uploads.all, "hash", hash] as const,
  },

  jobs: {
    all: ["jobs"] as const,
    list: () => [...queryKeys.jobs.all, "list"] as const,
    detail: (id: string) => [...queryKeys.jobs.all, id] as const,
  },
} as const;
