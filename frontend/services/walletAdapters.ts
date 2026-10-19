/**
 * walletAdapters.ts
 *
 * Uniform adapter interface for every supported Stellar wallet provider.
 * Each adapter wraps the wallet's native browser API behind a common shape
 * so the rest of the app never needs to branch on wallet type.
 *
 * Supported wallets
 * -----------------
 *  • Freighter — https://www.freighter.app/
 *  • Albedo    — https://albedo.link/
 *  • xBull     — https://xbull.app/
 *  • Rabet     — https://rabet.io/
 */

// ---------------------------------------------------------------------------
// Shared interface
// ---------------------------------------------------------------------------

export type WalletType = "freighter" | "albedo" | "xbull" | "rabet";

export interface WalletNetworkDetails {
  network: string;
  networkUrl: string;
  networkPassphrase: string;
  sorobanRpcUrl?: string | undefined;
}

export interface WalletAdapter {
  /** Human-readable name shown in the selector UI. */
  readonly name: string;
  /** Stable identifier used for localStorage persistence. */
  readonly type: WalletType;
  /** URL to the wallet's install page (Chrome Web Store or landing page). */
  readonly installUrl: string;

  /** True when the wallet extension / app is detectable in the browser. */
  isAvailable(): Promise<boolean>;

  /**
   * Prompt the user to grant access and return their public key.
   * Should throw with a human-readable message on failure.
   */
  connect(): Promise<string>;

  /** Return the currently-selected public key without a new permission prompt. */
  getAddress(): Promise<string>;

  /** Fetch the active network from the wallet. */
  getNetwork(): Promise<WalletNetworkDetails>;

  /**
   * Sign a transaction XDR and return the signed XDR string.
   * `networkPassphrase` and `address` are provided by the context for
   * wallets that require them explicitly.
   */
  signTransaction(xdr: string, networkPassphrase: string, address: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Freighter adapter
// ---------------------------------------------------------------------------

export const freighterAdapter: WalletAdapter = {
  name: "Freighter",
  type: "freighter",
  installUrl: "https://chromewebstore.google.com/detail/freighter/bcacfldlkkdogcffnhejadgmjllaphlm",

  async isAvailable() {
    if (typeof window === "undefined") return false;
    try {
      const { isConnected } = await import("@stellar/freighter-api");
      const res = await isConnected();
      return !!res?.isConnected;
    } catch {
      return false;
    }
  },

  async connect() {
    if (typeof window === "undefined") throw new Error("Freighter wallet is only accessible in the browser");
    const { getAddress } = await import("@stellar/freighter-api");
    const { address, error } = await getAddress();
    if (error) throw new Error(error.message);
    return address;
  },

  async getAddress() {
    if (typeof window === "undefined") throw new Error("Freighter wallet is only accessible in the browser");
    const { getAddress } = await import("@stellar/freighter-api");
    const { address, error } = await getAddress();
    if (error) throw new Error(error.message);
    return address;
  },

  async getNetwork() {
    if (typeof window === "undefined") throw new Error("Freighter wallet is only accessible in the browser");
    const { getNetworkDetails } = await import("@stellar/freighter-api");
    const res = await getNetworkDetails();
    if (res.error) throw new Error(res.error.message);
    return {
      network: res.network,
      networkUrl: res.networkUrl,
      networkPassphrase: res.networkPassphrase,
      sorobanRpcUrl: res.sorobanRpcUrl,
    };
  },

  async signTransaction(xdr, networkPassphrase, address) {
    if (typeof window === "undefined") throw new Error("Freighter wallet is only accessible in the browser");
    const { signTransaction } = await import("@stellar/freighter-api");
    const { signedTxXdr, error } = await signTransaction(xdr, {
      networkPassphrase,
      address,
    });
    if (error) throw new Error(error.message);
    return signedTxXdr;
  },
};

// ---------------------------------------------------------------------------
// Albedo adapter
// ---------------------------------------------------------------------------
// Albedo exposes window.albedo and also ships an npm package (@albedo-link/intent).
// We use the window object so we don't need an extra dependency; the npm
// package can be added later without changing this file's interface.

declare global {
  interface Window {
    albedo?: {
      publicKey(opts?: { token?: string }): Promise<{ pubkey: string; token: string }>;
      tx(opts: {
        xdr: string;
        network: string;
        submit?: boolean;
      }): Promise<{ signed_envelope_xdr: string; tx_hash: string }>;
    };
    xBullSDK?: {
      connect(): Promise<{ publicKey: string }>;
      getPublicKey(): Promise<string>;
      sign(opts: {
        xdr: string;
        networkPassphrase: string;
        publicKey?: string;
      }): Promise<{ signedXDR: string }>;
    };
    rabet?: {
      connect(): Promise<{ publicKey: string; network: string }>;
      sign(xdr: string, network: string): Promise<{ xdr: string }>;
    };
  }
}

// Albedo doesn't expose network details via the window API;
// we fall back to Freighter-style defaults for Testnet.
const ALBEDO_TESTNET_DETAILS: WalletNetworkDetails = {
  network: "TESTNET",
  networkUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  sorobanRpcUrl: "https://soroban-testnet.stellar.org",
};

export const albedoAdapter: WalletAdapter = {
  name: "Albedo",
  type: "albedo",
  installUrl: "https://albedo.link/",

  async isAvailable() {
    return typeof window !== "undefined" && typeof window.albedo !== "undefined";
  },

  async connect() {
    if (typeof window === "undefined" || !window.albedo) throw new Error("Albedo is not installed");
    const { pubkey } = await window.albedo.publicKey();
    return pubkey;
  },

  async getAddress() {
    if (typeof window === "undefined" || !window.albedo) throw new Error("Albedo is not installed");
    const { pubkey } = await window.albedo.publicKey();
    return pubkey;
  },

  async getNetwork() {
    // Albedo does not surface network info in the window API;
    // read from env or fall back to testnet.
    const passphrase =
      process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? ALBEDO_TESTNET_DETAILS.networkPassphrase;
    const isMainnet = passphrase.includes("Public Global");
    return isMainnet
      ? {
          network: "PUBLIC",
          networkUrl: "https://horizon.stellar.org",
          networkPassphrase: passphrase,
        }
      : { ...ALBEDO_TESTNET_DETAILS, networkPassphrase: passphrase };
  },

  async signTransaction(xdr, networkPassphrase) {
    if (typeof window === "undefined" || !window.albedo) throw new Error("Albedo is not installed");
    const isMainnet = networkPassphrase.includes("Public Global");
    const network = isMainnet ? "public" : "testnet";
    const { signed_envelope_xdr } = await window.albedo.tx({ xdr, network });
    return signed_envelope_xdr;
  },
};

// ---------------------------------------------------------------------------
// xBull adapter
// ---------------------------------------------------------------------------

export const xBullAdapter: WalletAdapter = {
  name: "xBull",
  type: "xbull",
  installUrl: "https://xbull.app/",

  async isAvailable() {
    return typeof window !== "undefined" && typeof window.xBullSDK !== "undefined";
  },

  async connect() {
    if (typeof window === "undefined" || !window.xBullSDK) throw new Error("xBull wallet is not installed");
    const { publicKey } = await window.xBullSDK.connect();
    return publicKey;
  },

  async getAddress() {
    if (typeof window === "undefined" || !window.xBullSDK) throw new Error("xBull wallet is not installed");
    return window.xBullSDK.getPublicKey();
  },

  async getNetwork() {
    // xBull doesn't expose a network-details call via the global SDK.
    // Fall back to reading the env variable or defaulting to testnet.
    const passphrase =
      process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
    const isMainnet = passphrase.includes("Public Global");
    return {
      network: isMainnet ? "PUBLIC" : "TESTNET",
      networkUrl: isMainnet ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org",
      networkPassphrase: passphrase,
      sorobanRpcUrl: isMainnet
        ? "https://mainnet.stellar.validationcloud.io/v1/soroban/rpc"
        : "https://soroban-testnet.stellar.org",
    };
  },

  async signTransaction(xdr, networkPassphrase, address) {
    if (typeof window === "undefined" || !window.xBullSDK) throw new Error("xBull wallet is not installed");
    const { signedXDR } = await window.xBullSDK.sign({
      xdr,
      networkPassphrase,
      publicKey: address,
    });
    return signedXDR;
  },
};

// ---------------------------------------------------------------------------
// Rabet adapter
// ---------------------------------------------------------------------------

export const rabetAdapter: WalletAdapter = {
  name: "Rabet",
  type: "rabet",
  installUrl: "https://chromewebstore.google.com/detail/rabet/hgmoaheomcjnaheggkfafnjilfcefbmo",

  async isAvailable() {
    return typeof window !== "undefined" && typeof window.rabet !== "undefined";
  },

  async connect() {
    if (typeof window === "undefined" || !window.rabet) throw new Error("Rabet wallet is not installed");
    const { publicKey } = await window.rabet.connect();
    return publicKey;
  },

  async getAddress() {
    if (typeof window === "undefined" || !window.rabet) throw new Error("Rabet wallet is not installed");
    const { publicKey } = await window.rabet.connect();
    return publicKey;
  },

  async getNetwork() {
    if (typeof window === "undefined" || !window.rabet) throw new Error("Rabet wallet is not installed");
    const { network } = await window.rabet.connect();
    const isMainnet = network === "mainnet";
    return {
      network: isMainnet ? "PUBLIC" : "TESTNET",
      networkUrl: isMainnet ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org",
      networkPassphrase: isMainnet
        ? "Public Global Stellar Network ; September 2015"
        : "Test SDF Network ; September 2015",
      sorobanRpcUrl: isMainnet
        ? "https://mainnet.stellar.validationcloud.io/v1/soroban/rpc"
        : "https://soroban-testnet.stellar.org",
    };
  },

  async signTransaction(xdr, networkPassphrase) {
    if (typeof window === "undefined" || !window.rabet) throw new Error("Rabet wallet is not installed");
    const isMainnet = networkPassphrase.includes("Public Global");
    const network = isMainnet ? "mainnet" : "testnet";
    const { xdr: signedXdr } = await window.rabet.sign(xdr, network);
    return signedXdr;
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** All supported adapters in display order. */
export const ALL_ADAPTERS: WalletAdapter[] = [
  freighterAdapter,
  albedoAdapter,
  xBullAdapter,
  rabetAdapter,
];

/** Look up an adapter by its stable type string. */
export function getAdapter(type: WalletType): WalletAdapter {
  const adapter = ALL_ADAPTERS.find((a) => a.type === type);
  if (!adapter) throw new Error(`Unknown wallet type: ${type}`);
  return adapter;
}
