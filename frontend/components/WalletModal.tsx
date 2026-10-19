"use client";

/**
 * WalletModal.tsx
 *
 * Thin wrapper that keeps the original import path intact while delegating
 * all rendering to the new multi-wallet WalletSelector component.
 */

import { useState } from "react";

import { useToastHelpers } from "@/components/ToastProvider";
import { WalletSelector } from "@/components/wallet/WalletSelector";
import { useWallet } from "@/context/WalletContext";

export function WalletModal() {
  const { connected, publicKey, walletType, disconnect } = useWallet();
  const { success: showSuccess } = useToastHelpers();
  const [selectorOpen, setSelectorOpen] = useState(false);

  const handleDisconnect = () => {
    disconnect();
    showSuccess("Wallet disconnected successfully", {
      title: "Disconnected",
    });
  };

  const truncate = (key: string) => `${key.slice(0, 6)}…${key.slice(-4)}`;

  return (
    <>
      <div className="flex flex-col gap-4 p-4 bg-slate-900 rounded-lg border border-slate-800">
        {connected && publicKey ? (
          <div className="space-y-3">
            <div className="p-3 bg-slate-800 rounded">
              <p className="text-xs text-slate-400 mb-1">
                Connected via <span className="capitalize text-slate-300">{walletType}</span>
              </p>
              <p className="text-white font-mono text-sm">{truncate(publicKey)}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectorOpen(true)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors text-sm"
              >
                Switch Wallet
              </button>
              <button
                onClick={handleDisconnect}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors text-sm"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setSelectorOpen(true)}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Connect Wallet
          </button>
        )}
      </div>

      <WalletSelector open={selectorOpen} onClose={() => setSelectorOpen(false)} />
    </>
  );
}
