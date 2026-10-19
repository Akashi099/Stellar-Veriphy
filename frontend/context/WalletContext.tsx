"use client";

/**
 * WalletContext.tsx — compatibility shim
 *
 * This file previously contained a React Context-based wallet implementation.
 * The wallet state has been migrated to a Zustand store (`@/store/useWalletStore`)
 * as part of issue #434.
 *
 * All existing imports like:
 *   import { useWallet } from "@/context/WalletContext"
 *   import { WalletProvider } from "@/context/WalletContext"
 *
 * continue to work unchanged — they now resolve to the Zustand-backed
 * implementations, so no consuming component needs to be edited.
 */

// Re-export everything from the canonical locations.
export { WalletProvider } from "@/components/WalletProvider";
export type { WalletActions, WalletState, WalletStore } from "@/store/useWalletStore";
export { useWallet, useWalletStore } from "@/store/useWalletStore";
export {
  isBrowser,
  isSSR,
  safeIsWalletAvailable,
  probeAllWallets,
  useSSRSafeWalletDetection,
} from "@/lib/walletDetection";
