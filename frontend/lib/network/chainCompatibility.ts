/**
 * chainCompatibility.ts
 *
 * Decides whether the wallet's active Stellar network can run a given app
 * feature, and builds the user-facing warning when it can't.
 *
 * The app's on-chain contracts are deployed per network (see config/network.ts
 * and the NEXT_PUBLIC_*_CONTRACT_ID variables), so any feature that talks to
 * them only works on the network the app is configured for. Everything here is
 * pure so it can be tested without a wallet or a browser.
 */

import { FUTURENET_PASSPHRASE, MAINNET_PASSPHRASE, TESTNET_PASSPHRASE } from "@/config/network";
import type { WalletNetworkDetails } from "@/services/walletAdapters";

export type KnownNetwork = "testnet" | "mainnet" | "futurenet";

export type ChainFeature = "verification-submission" | "transaction-signing" | "ownership-transfer";

const NETWORK_LABELS: Record<KnownNetwork, string> = {
  testnet: "Testnet",
  mainnet: "Mainnet",
  futurenet: "Futurenet",
};

const FEATURE_LABELS: Record<ChainFeature, string> = {
  "verification-submission": "Verification submission",
  "transaction-signing": "Transaction signing",
  "ownership-transfer": "Ownership transfer",
};

/** The network the app is configured for, from the same env var the adapters use. */
export const APP_NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE;

/** Maps a network passphrase to a network the app knows how to describe, or null. */
export function identifyNetwork(passphrase: string): KnownNetwork | null {
  switch (passphrase) {
    case MAINNET_PASSPHRASE:
      return "mainnet";
    case TESTNET_PASSPHRASE:
      return "testnet";
    case FUTURENET_PASSPHRASE:
      return "futurenet";
    default:
      return null;
  }
}

/** Human-readable network name. Falls back to the app's default wording for unknown passphrases. */
export function networkLabel(passphrase: string): string {
  const known = identifyNetwork(passphrase);
  if (known) return NETWORK_LABELS[known];
  return passphrase.includes("Public Global") ? NETWORK_LABELS.mainnet : NETWORK_LABELS.testnet;
}

export type ChainCompatibility =
  | { compatible: true }
  | {
      compatible: false;
      reason: "network-mismatch" | "unknown-network";
      message: string;
    };

interface CheckInput {
  feature: ChainFeature;
  /** Network the wallet reports. Null when no wallet is connected. */
  network: WalletNetworkDetails | null;
  walletName: string;
  /** Defaults to the app's configured network. Passed explicitly in tests. */
  appPassphrase?: string | undefined;
}

/**
 * Returns whether `feature` can run on the wallet's current network.
 *
 * Passes (compatible: true) when there is no wallet network to compare or no
 * configured app network, matching the behaviour of the connection check.
 */
export function checkChainCompatibility({
  feature,
  network,
  walletName,
  appPassphrase = APP_NETWORK_PASSPHRASE,
}: CheckInput): ChainCompatibility {
  if (!network || !appPassphrase) return { compatible: true };
  if (network.networkPassphrase === appPassphrase) return { compatible: true };

  const appKnown = identifyNetwork(appPassphrase);
  const appLabel = appKnown ? NETWORK_LABELS[appKnown] : "the network this app is set up for";
  const featureLabel = FEATURE_LABELS[feature];

  if (!identifyNetwork(network.networkPassphrase)) {
    return {
      compatible: false,
      reason: "unknown-network",
      message: `${walletName} is on a network this app doesn't recognise. Switch ${walletName} to ${appLabel}, then try again.`,
    };
  }

  return {
    compatible: false,
    reason: "network-mismatch",
    message: `${featureLabel} isn't available on ${networkLabel(network.networkPassphrase)}. Switch ${walletName} to ${appLabel}, then try again.`,
  };
}
