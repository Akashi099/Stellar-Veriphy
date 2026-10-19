/**
 * walletDetection.ts
 *
 * SSR-safe wallet detection and provider probing utilities.
 *
 * Addresses Issue #620:
 * Prevents hydration mismatches and server-side runtime errors by ensuring:
 * 1. All wallet detection strictly checks for browser environment (window/document).
 * 2. Missing wallet extension providers (Freighter, Albedo, xBull, Rabet) are handled gracefully without uncaught rejections.
 * 3. Asynchronous extension injection (extensions often inject scripts slightly after DOMContentLoaded) is handled with safe probing.
 * 4. React hook `useSSRSafeWalletDetection` ensures UI components only render client-specific detected state after mounting, completely eliminating hydration mismatches.
 */

import { useEffect, useState } from "react";
import { ALL_ADAPTERS, type WalletAdapter, type WalletType } from "@/services/walletAdapters";

/**
 * Returns true if running in a client browser environment.
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Returns true if executing during SSR (Server-Side Rendering).
 */
export function isSSR(): boolean {
  return !isBrowser();
}

/**
 * Safely inspects whether a specific wallet adapter is available in the current environment.
 * Always resolves to false instead of throwing if executed on SSR or if provider check throws.
 *
 * @param adapter The wallet adapter or wallet type string
 * @returns Promise<boolean> - true if installed & detected, false otherwise.
 */
export async function safeIsWalletAvailable(adapter: WalletAdapter | WalletType): Promise<boolean> {
  if (isSSR()) {
    return false;
  }

  try {
    const targetAdapter =
      typeof adapter === "string" ? ALL_ADAPTERS.find((a) => a.type === adapter) : adapter;

    if (!targetAdapter) {
      return false;
    }

    return await targetAdapter.isAvailable();
  } catch (error) {
    // Gracefully handle any unexpected errors during provider inspection
    console.debug(`[walletDetection] Failed to detect wallet "${String(adapter)}":`, error);
    return false;
  }
}

/**
 * Result record for wallet availability detection.
 */
export interface WalletAvailabilityMap {
  [type: string]: boolean;
}

/**
 * Safely probes all registered wallet providers in a batch.
 * Guarantees resolution with all false during SSR.
 */
export async function probeAllWallets(): Promise<WalletAvailabilityMap> {
  if (isSSR()) {
    return ALL_ADAPTERS.reduce<WalletAvailabilityMap>((acc, adapter) => {
      acc[adapter.type] = false;
      return acc;
    }, {});
  }

  const entries = await Promise.all(
    ALL_ADAPTERS.map(async (adapter) => {
      const available = await safeIsWalletAvailable(adapter);
      return [adapter.type, available] as const;
    })
  );

  return Object.fromEntries(entries);
}

/**
 * React hook to perform SSR-safe wallet detection without hydration mismatch.
 *
 * On server render and initial hydration, `isHydrated` is false and availability map
 * defaults to all false (matching the SSR HTML).
 * Once mounted on the client, it probes provider availability and updates state.
 *
 * @example
 * ```tsx
 * const { isHydrated, availability, isAvailable } = useSSRSafeWalletDetection();
 * if (!isHydrated) {
 *   // render loading or neutral fallback
 * }
 * ```
 */
export function useSSRSafeWalletDetection() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [availability, setAvailability] = useState<WalletAvailabilityMap>(() =>
    ALL_ADAPTERS.reduce<WalletAvailabilityMap>((acc, a) => {
      acc[a.type] = false;
      return acc;
    }, {})
  );

  useEffect(() => {
    setIsHydrated(true);
    let cancelled = false;

    probeAllWallets().then((results) => {
      if (!cancelled) {
        setAvailability(results);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const isAvailable = (type: WalletType): boolean => {
    return isHydrated && !!availability[type];
  };

  return {
    isHydrated,
    availability,
    isAvailable,
  };
}
