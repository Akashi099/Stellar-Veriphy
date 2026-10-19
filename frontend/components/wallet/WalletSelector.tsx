"use client";

/**
 * WalletSelector.tsx
 *
 * Modal-style panel that lists all supported wallet providers.
 * Each row shows:
 *  - Wallet name + install link (when not detected)
 *  - Availability badge (detected / not installed)
 *  - Connect button
 *  - "Switch" indicator when it is the currently connected wallet
 *
 * Usage
 * -----
 *   <WalletSelector open={open} onClose={() => setOpen(false)} />
 */

import { useEffect, useState } from "react";

import { useWallet } from "@/context/WalletContext";
import { safeIsWalletAvailable } from "@/lib/walletDetection";
import type { WalletType } from "@/services/walletAdapters";
import { renderTextWithLink } from "@/utils/renderTextWithLink";

interface Props {
  /** Whether the selector panel is visible. */
  open: boolean;
  /** Called when the user dismisses the panel. */
  onClose: () => void;
}

interface AdapterStatus {
  type: WalletType;
  name: string;
  installUrl: string;
  available: boolean;
}

export function WalletSelector({ open, onClose }: Props) {
  const {
    adapters,
    walletType,
    connected,
    publicKey,
    connect,
    switchWallet,
    disconnect,
    error,
    clearError,
  } = useWallet();

  const [statuses, setStatuses] = useState<AdapterStatus[]>([]);
  const [connecting, setConnecting] = useState<WalletType | null>(null);

  // Probe availability for every adapter once the panel opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const probe = async () => {
      const results = await Promise.all(
        adapters.map(async (a) => ({
          type: a.type,
          name: a.name,
          installUrl: a.installUrl,
          available: await safeIsWalletAvailable(a),
        }))
      );
      if (!cancelled) setStatuses(results);
    };

    probe();
    return () => {
      cancelled = true;
    };
  }, [open, adapters]);

  if (!open) return null;

  const handleConnect = async (type: WalletType) => {
    clearError();
    setConnecting(type);
    try {
      if (connected && walletType === type) {
        // Already on this wallet — nothing to do
      } else if (connected) {
        await switchWallet(type);
      } else {
        await connect(type);
      }
      onClose();
    } finally {
      setConnecting(null);
    }
  };

  const truncate = (key: string) => `${key.slice(0, 6)}…${key.slice(-4)}`;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Connect Wallet</h2>
          <button
            onClick={onClose}
            aria-label="Close wallet selector"
            className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-lg bg-red-900/30 border border-red-700 px-4 py-3 text-sm text-red-300"
          >
            <p className="flex-1">{renderTextWithLink(error, "underline hover:text-red-100")}</p>
            <button
              onClick={clearError}
              aria-label="Dismiss error"
              className="shrink-0 text-red-400 hover:text-red-200 transition-colors leading-none"
            >
              ✕
            </button>
          </div>
        )}

        {/* Connected info */}
        {connected && publicKey && (
          <div className="mb-4 rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Connected</p>
              <p className="text-sm font-mono text-white">{truncate(publicKey)}</p>
            </div>
            <button
              onClick={() => {
                disconnect();
                onClose();
              }}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}

        {/* Wallet list */}
        <ul className="space-y-3">
          {adapters.map((adapter) => {
            const status = statuses.find((s) => s.type === adapter.type);
            const available = status?.available ?? false;
            const isCurrent = walletType === adapter.type && connected;
            const isLoading = connecting === adapter.type;

            return (
              <li key={adapter.type}>
                <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
                  {/* Left: name + badge */}
                  <div className="flex items-center gap-3">
                    <WalletIcon type={adapter.type} />
                    <div>
                      <p className="text-sm font-medium text-white">{adapter.name}</p>
                      {available ? (
                        <span className="text-xs text-emerald-400">Detected</span>
                      ) : (
                        <a
                          href={adapter.installUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-slate-400 hover:text-blue-400 transition-colors"
                        >
                          Install →
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Right: action */}
                  {isCurrent ? (
                    <span className="text-xs font-medium text-emerald-400 bg-emerald-900/30 border border-emerald-700 rounded-full px-3 py-1">
                      Connected
                    </span>
                  ) : (
                    <button
                      disabled={!available || isLoading}
                      onClick={() => handleConnect(adapter.type)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors
                        disabled:opacity-40 disabled:cursor-not-allowed
                        bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      {isLoading ? "Connecting…" : connected ? "Switch" : "Connect"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 text-center text-xs text-slate-500">
          By connecting, you agree to interact with the Stellar network.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minimal wallet icon (initials fallback — replace with SVG assets if needed)
// ---------------------------------------------------------------------------

function WalletIcon({ type }: { type: WalletType }) {
  const colours: Record<WalletType, string> = {
    freighter: "bg-blue-600",
    albedo: "bg-purple-600",
    xbull: "bg-amber-600",
    rabet: "bg-teal-600",
  };
  const labels: Record<WalletType, string> = {
    freighter: "Fr",
    albedo: "Al",
    xbull: "xB",
    rabet: "Rb",
  };
  return (
    <div
      className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${colours[type]}`}
    >
      {labels[type]}
    </div>
  );
}
