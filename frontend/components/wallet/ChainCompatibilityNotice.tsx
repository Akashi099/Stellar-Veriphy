"use client";

import { type ChainFeature, checkChainCompatibility } from "@/lib/network/chainCompatibility";
import { useWalletStore } from "@/store/useWalletStore";

interface ChainCompatibilityNoticeProps {
  feature: ChainFeature;
}

/**
 * Shows an actionable warning when the connected wallet is on a network that
 * can't run `feature`. Renders nothing when no wallet is connected or the
 * network is compatible.
 */
export function ChainCompatibilityNotice({ feature }: ChainCompatibilityNoticeProps) {
  const connected = useWalletStore((s) => s.connected);
  const network = useWalletStore((s) => s.network);
  const walletName = useWalletStore((s) => s.adapter?.name) ?? "your wallet";

  if (!connected) return null;

  const result = checkChainCompatibility({ feature, network, walletName });
  if (result.compatible) return null;

  return (
    <div
      role="alert"
      className="mb-3 flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
    >
      <p>{result.message}</p>
    </div>
  );
}
