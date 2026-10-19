"use client";

/**
 * useWalletStore.ts — Zustand wallet store
 *
 * Replaces the React Context-based WalletContext with a Zustand store for
 * improved performance (components subscribe only to the state slices they
 * use, avoiding unnecessary re-renders).
 *
 * Persistence
 * ───────────
 * Selected wallet type  → localStorage key "sv_wallet_type"
 * Connected public key  → localStorage key "sv_wallet_key"
 *
 * Migration from WalletContext
 * ────────────────────────────
 * Replace:
 *   import { useWallet } from "@/context/WalletContext";
 *   const { publicKey, connect } = useWallet();
 * With:
 *   import { useWalletStore } from "@/store/useWalletStore";
 *   const publicKey = useWalletStore((s) => s.publicKey);
 *   const connect   = useWalletStore((s) => s.connect);
 *
 * Or use the convenience selector hooks:
 *   import { useWalletPublicKey, useWalletActions } from "@/store/useWalletStore";
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

import { CONTRACT_ADDRESSES } from "@/config/network";
import { APP_NETWORK_PASSPHRASE, networkLabel } from "@/lib/network/chainCompatibility";
import { auditLogger } from "@/lib/security/auditLogger";
import { checkSignerCompatibility, checkTransactionTarget } from "@/lib/wallet/signerCompatibility";
import { safeIsWalletAvailable } from "@/lib/walletDetection";
import {
  ALL_ADAPTERS,
  getAdapter,
  type WalletAdapter,
  type WalletNetworkDetails,
  type WalletType,
} from "@/services/walletAdapters";
import { useWizardStore } from "@/src/features/verification/store/wizard.store";

// ---------------------------------------------------------------------------
// Storage keys (kept identical to WalletContext for backward-compat)
// ---------------------------------------------------------------------------

const STORAGE_KEY_TYPE = "sv_wallet_type";
const STORAGE_KEY_KEY = "sv_wallet_key";
const POLL_INTERVAL = 4_000; // ms

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------
//
// Wallet extensions each throw their own raw, wallet-specific error text
// (e.g. Freighter's "User declined access"). Rather than surface that
// verbatim, classify the common cases — unsupported wallet, denied
// permission prompt, and unreachable/locked wallet — into a consistent,
// actionable message. Unrecognized errors still fall back to the raw
// message so nothing is silently swallowed.

function friendlyConnectError(e: unknown, walletName: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();

  // "Not installed" errors already carry an install link (see connect() below) —
  // keep them as-is rather than re-wrapping.
  if (lower.includes("not installed")) return raw;

  if (
    lower.includes("declin") ||
    lower.includes("reject") ||
    lower.includes("denied") ||
    lower.includes("permission") ||
    lower.includes("user cancel")
  ) {
    return `You didn't approve the connection request in ${walletName}. Open ${walletName} and approve the prompt to connect.`;
  }

  if (lower.includes("lock") || lower.includes("unlock")) {
    return `${walletName} appears to be locked. Unlock it and try connecting again.`;
  }

  return raw || `Couldn't connect to ${walletName}. Please try again.`;
}

/** Returns a human-readable mismatch message, or null when the network matches (or nothing is configured to compare against). */
function networkMismatchError(details: WalletNetworkDetails, walletName: string): string | null {
  if (!APP_NETWORK_PASSPHRASE) return null;
  if (details.networkPassphrase === APP_NETWORK_PASSPHRASE) return null;
  return `${walletName} is connected to ${networkLabel(details.networkPassphrase)}, but this app expects ${networkLabel(APP_NETWORK_PASSPHRASE)}. Switch ${walletName}'s network, then reconnect.`;
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface WalletState {
  /** Currently active Stellar public key, or null when disconnected. */
  publicKey: string | null;
  /** Active network details reported by the wallet. */
  network: WalletNetworkDetails | null;
  /** Derived: true when publicKey is non-null. */
  connected: boolean;
  /** The type of the currently connected wallet, or null. */
  walletType: WalletType | null;
  /** The adapter instance for the currently active wallet, or null. */
  adapter: WalletAdapter | null;
  /** All registered adapters — used to build the wallet selector UI. */
  adapters: WalletAdapter[];
  /** Last user-facing error message, or null. */
  error: string | null;
  /** Internal poll timer id. */
  _pollTimer: ReturnType<typeof setInterval> | null;
}

// ---------------------------------------------------------------------------
// Action shape
// ---------------------------------------------------------------------------

export interface WalletActions {
  /** Attempt to connect using the given wallet type. */
  connect: (type: WalletType) => Promise<void>;
  /** Disconnect the current wallet and clear persisted state. */
  disconnect: () => void;
  /** Disconnect, then connect with a different wallet type. */
  switchWallet: (type: WalletType) => Promise<void>;
  /** Sign a transaction XDR with the active wallet. Returns signed XDR. */
  signTx: (xdr: string) => Promise<string>;
  /** Fetch network details from the active wallet and refresh state. */
  refreshNetwork: () => Promise<void>;
  /** Clear the last error. */
  clearError: () => void;
  /**
   * Called once on app boot to restore persisted session and start polling.
   * Safe to call multiple times — will no-op if already connected.
   */
  init: () => Promise<void>;
}

export type WalletStore = WalletState & WalletActions;

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useWalletStore = create<WalletStore>()(
  subscribeWithSelector((set, get) => {
    // ── Internal helpers ─────────────────────────────────────────────────────

    const _stopPolling = () => {
      const { _pollTimer } = get();
      if (_pollTimer) {
        clearInterval(_pollTimer);
        set({ _pollTimer: null });
      }
    };

    const _startPolling = () => {
      _stopPolling();
      const timer = setInterval(async () => {
        await get().refreshNetwork();
      }, POLL_INTERVAL);
      set({ _pollTimer: timer });
    };

    // ── Initial state ────────────────────────────────────────────────────────

    return {
      publicKey: null,
      network: null,
      connected: false,
      walletType: null,
      adapter: null,
      adapters: ALL_ADAPTERS,
      error: null,
      _pollTimer: null,

      // ── init ──────────────────────────────────────────────────────────────

      init: async () => {
        // No-op when already connected (e.g. StrictMode double-invoke)
        if (get().connected) return;

        const savedType =
          typeof localStorage !== "undefined"
            ? (localStorage.getItem(STORAGE_KEY_TYPE) as WalletType | null)
            : null;
        const savedKey =
          typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY_KEY) : null;

        if (!savedType || !savedKey) return;

        try {
          const adpt = getAdapter(savedType);
          const available = await safeIsWalletAvailable(adpt);
          if (!available) {
            localStorage.removeItem(STORAGE_KEY_TYPE);
            localStorage.removeItem(STORAGE_KEY_KEY);
            return;
          }
          const details = await adpt.getNetwork();
          set({
            walletType: savedType,
            publicKey: savedKey,
            adapter: adpt,
            network: details,
            connected: true,
            error: null,
          });
          _startPolling();
        } catch {
          localStorage.removeItem(STORAGE_KEY_TYPE);
          localStorage.removeItem(STORAGE_KEY_KEY);
        }
      },

      // ── connect ───────────────────────────────────────────────────────────

      connect: async (type: WalletType) => {
        let walletName: string = type;
        try {
          const adpt = getAdapter(type);
          walletName = adpt.name;
          const available = await safeIsWalletAvailable(adpt);
          if (!available) {
            throw new Error(`${adpt.name} is not installed. Install it from: ${adpt.installUrl}`);
          }
          const address = await adpt.connect();
          const details = await adpt.getNetwork();

          if (typeof localStorage !== "undefined") {
            localStorage.setItem(STORAGE_KEY_TYPE, type);
            localStorage.setItem(STORAGE_KEY_KEY, address);
          }

          // A network mismatch isn't a connection failure — the wallet is
          // connected, it's just pointed at the wrong network — so we still
          // record the connection but surface it as an actionable error.
          const mismatch = networkMismatchError(details, adpt.name);

          set({
            walletType: type,
            publicKey: address,
            adapter: adpt,
            network: details,
            connected: true,
            error: mismatch,
          });
          _startPolling();

          void auditLogger.logEvent({
            actor: address,
            category: "auth",
            action: "wallet connected",
            details: `Connected via ${adpt.name}`,
          });
        } catch (e) {
          set({ error: friendlyConnectError(e, walletName) });
        }
      },

      // ── disconnect ────────────────────────────────────────────────────────

      disconnect: () => {
        const { publicKey } = get();
        _stopPolling();

        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(STORAGE_KEY_TYPE);
          localStorage.removeItem(STORAGE_KEY_KEY);
        }

        set({
          publicKey: null,
          network: null,
          walletType: null,
          adapter: null,
          connected: false,
          error: null,
        });

        useWizardStore.getState().reset();

        if (publicKey) {
          void auditLogger.logEvent({
            actor: publicKey,
            category: "auth",
            action: "wallet disconnected",
          });
        }
      },

      // ── switchWallet ──────────────────────────────────────────────────────

      switchWallet: async (type: WalletType) => {
        get().disconnect();
        await get().connect(type);
      },

      // ── signTx ────────────────────────────────────────────────────────────

      signTx: async (xdr: string): Promise<string> => {
        const { adapter, publicKey } = get();
        if (!adapter || !publicKey) throw new Error("Wallet not connected");

        // Read the wallet's current account and network rather than the polled
        // copy, so a switch made since the last poll is caught before signing.
        const walletAddress = await adapter.getAddress().catch(() => null);
        const liveNetwork = await adapter.getNetwork().catch(() => null);
        const issues = [
          ...checkSignerCompatibility({
            connectedAddress: publicKey,
            walletAddress,
            network: liveNetwork,
            walletName: adapter.name,
            feature: "transaction-signing",
            appPassphrase: APP_NETWORK_PASSPHRASE,
          }),
        ];
        if (liveNetwork) {
          issues.push(
            ...checkTransactionTarget({
              xdr,
              networkPassphrase: liveNetwork.networkPassphrase,
              allowedContractIds: Object.values(CONTRACT_ADDRESSES),
            })
          );
        }
        if (issues.length > 0 || !liveNetwork) {
          void auditLogger.logEvent({
            actor: publicKey,
            category: "contract",
            action: "signer compatibility check failed",
            severity: "warning",
            details: `${adapter.name}: ${issues.map((issue) => issue.code).join(", ")}`,
          });
          throw new Error(issues.map((issue) => issue.message).join(" "));
        }

        set({ network: liveNetwork });

        try {
          const signed = await adapter.signTransaction(
            xdr,
            liveNetwork.networkPassphrase,
            publicKey
          );
          void auditLogger.logEvent({
            actor: publicKey,
            category: "contract",
            action: "transaction signed",
            details: `Network: ${liveNetwork.network}`,
          });
          return signed;
        } catch (e) {
          void auditLogger.logEvent({
            actor: publicKey,
            category: "contract",
            action: "transaction signing failed",
            severity: "warning",
            details: e instanceof Error ? e.message : "Unknown error",
          });
          throw e;
        }
      },

      // ── refreshNetwork ────────────────────────────────────────────────────

      refreshNetwork: async () => {
        const { adapter } = get();
        if (!adapter) return;
        try {
          const details = await adapter.getNetwork();
          set({ network: details });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : "Failed to fetch network" });
        }
      },

      // ── clearError ────────────────────────────────────────────────────────

      clearError: () => set({ error: null }),
    };
  })
);

// ---------------------------------------------------------------------------
// Convenience selector hooks (stable references — won't trigger unnecessary renders)
// ---------------------------------------------------------------------------

/** Returns only the publicKey slice. Cheap re-render on key change only. */
export const useWalletPublicKey = () => useWalletStore((s) => s.publicKey);

/** Returns only the connected boolean. */
export const useWalletConnected = () => useWalletStore((s) => s.connected);

/** Returns only the network details. */
export const useWalletNetwork = () => useWalletStore((s) => s.network);

/** Returns only the walletType. */
export const useWalletType = () => useWalletStore((s) => s.walletType);

/** Returns only the last error. */
export const useWalletError = () => useWalletStore((s) => s.error);

/** Returns only the adapters list (stable — never changes). */
export const useWalletAdapters = () => useWalletStore((s) => s.adapters);

/** Returns all action functions as a stable object. */
export const useWalletActions = () =>
  useWalletStore((s) => ({
    connect: s.connect,
    disconnect: s.disconnect,
    switchWallet: s.switchWallet,
    signTx: s.signTx,
    refreshNetwork: s.refreshNetwork,
    clearError: s.clearError,
    init: s.init,
  }));

/**
 * Drop-in replacement for `useWallet()` from WalletContext.
 * Returns the full store state as a single object.
 * Prefer the fine-grained selector hooks above to avoid unnecessary renders.
 */
export const useWallet = () => useWalletStore((s) => s);
