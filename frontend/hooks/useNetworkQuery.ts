/**
 * useNetworkQuery.ts
 *
 * React Query hook for live blockchain / network status.
 *
 * Uses a short TTL (30 s) so the network badge stays reasonably fresh
 * without hammering Horizon on every render.  The query is automatically
 * re-fetched when the browser tab regains focus only if the data is
 * already stale (controlled by `staleTime`).
 *
 * @module hooks/useNetworkQuery
 *
 * @example
 * ```tsx
 * const { data: networkStatus, isLoading } = useNetworkStatus();
 * ```
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys, STALE_TIMES } from "@/config/cache";
import { dedupeRequest } from "@/lib/requestDeduplicator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Live network status returned by the hook.
 */
export interface NetworkStatus {
  /** Whether the Horizon / Soroban RPC node is reachable. */
  online: boolean;
  /** Current Stellar network name. */
  network: "testnet" | "mainnet" | "futurenet";
  /** Latest ledger sequence number, if available. */
  latestLedger?: number;
  /** ISO 8601 timestamp of the latest ledger, if available. */
  latestLedgerCloseTime?: string;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

/**
 * Checks the browser's online state and performs a lightweight probe
 * against the Soroban RPC endpoint.
 *
 * In production this would hit `getLatestLedger` via `@stellar/stellar-sdk`.
 * The current implementation returns mock data so the frontend can be
 * exercised without a live node.
 *
 * @returns Current {@link NetworkStatus}.
 */
async function fetchNetworkStatus(): Promise<NetworkStatus> {
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  if (!isOnline) {
    return { online: false, network: "testnet" };
  }

  // TODO: replace with real Horizon / Soroban RPC call in production.
  return {
    online: true,
    network: (process.env.NEXT_PUBLIC_STELLAR_NETWORK as NetworkStatus["network"]) ?? "testnet",
    latestLedger: Math.floor(Date.now() / 5000), // approximate
    latestLedgerCloseTime: new Date().toISOString(),
  };
}

/**
 * Deduplicated wrapper around {@link fetchNetworkStatus}.
 *
 * Concurrent identical reads (e.g. rapid navigation or multiple components
 * mounting at once) share a single in-flight request.  This is a read-only
 * path, so deduplication is always safe here; mutation requests must never
 * be routed through this helper.
 *
 * @returns Current {@link NetworkStatus}, shared across concurrent callers.
 */
function fetchNetworkStatusDeduped(): Promise<NetworkStatus> {
  return dedupeRequest("network:status", fetchNetworkStatus);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns live Stellar network status.
 *
 * Data is re-fetched every {@link STALE_TIMES.blockchain} milliseconds
 * (default 30 s).  The query is also re-fetched when the browser goes
 * from offline → online via the `networkMode: "always"` option, ensuring
 * the badge updates as soon as connectivity is restored.
 *
 * @returns React Query result containing {@link NetworkStatus}.
 */
export function useNetworkStatus() {
  return useQuery({
    queryKey: queryKeys.network.status(),
    queryFn: fetchNetworkStatusDeduped,
    staleTime: STALE_TIMES.blockchain,
    // Retry immediately when connectivity is restored
    networkMode: "always",
    refetchOnWindowFocus: true,
  });
}
