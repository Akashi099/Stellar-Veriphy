/**
 * Unit tests for lib/network/chainCompatibility.ts
 *
 * Covers network identification, feature compatibility against the app's
 * configured network, and the actionable copy shown when they differ.
 */

import { FUTURENET_PASSPHRASE, MAINNET_PASSPHRASE, TESTNET_PASSPHRASE } from "../../config/network";
import type { WalletNetworkDetails } from "../../services/walletAdapters";
import {
  checkChainCompatibility,
  identifyNetwork,
  networkLabel,
} from "../network/chainCompatibility";

function details(networkPassphrase: string): WalletNetworkDetails {
  return {
    network: networkPassphrase,
    networkUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase,
  };
}

describe("identifyNetwork", () => {
  it("maps each known passphrase to its network", () => {
    expect(identifyNetwork(MAINNET_PASSPHRASE)).toBe("mainnet");
    expect(identifyNetwork(TESTNET_PASSPHRASE)).toBe("testnet");
    expect(identifyNetwork(FUTURENET_PASSPHRASE)).toBe("futurenet");
  });

  it("returns null for an unrecognised passphrase", () => {
    expect(identifyNetwork("Some Private Network ; 2024")).toBeNull();
  });
});

describe("networkLabel", () => {
  it("labels Futurenet as Futurenet rather than Testnet", () => {
    expect(networkLabel(FUTURENET_PASSPHRASE)).toBe("Futurenet");
  });

  it("falls back to Mainnet/Testnet wording for unknown passphrases", () => {
    expect(networkLabel("Public Global Stellar Network ; Other")).toBe("Mainnet");
    expect(networkLabel("Something else")).toBe("Testnet");
  });
});

describe("checkChainCompatibility", () => {
  it("passes when no wallet network is available", () => {
    expect(
      checkChainCompatibility({
        feature: "verification-submission",
        network: null,
        walletName: "Freighter",
        appPassphrase: TESTNET_PASSPHRASE,
      })
    ).toEqual({ compatible: true });
  });

  it("passes when no app network is configured", () => {
    expect(
      checkChainCompatibility({
        feature: "verification-submission",
        network: details(MAINNET_PASSPHRASE),
        walletName: "Freighter",
        appPassphrase: undefined,
      })
    ).toEqual({ compatible: true });
  });

  it("passes when the wallet is on the app's network", () => {
    expect(
      checkChainCompatibility({
        feature: "ownership-transfer",
        network: details(TESTNET_PASSPHRASE),
        walletName: "Freighter",
        appPassphrase: TESTNET_PASSPHRASE,
      })
    ).toEqual({ compatible: true });
  });

  it("names the feature, the wallet's network and the network to switch to on mismatch", () => {
    const result = checkChainCompatibility({
      feature: "verification-submission",
      network: details(MAINNET_PASSPHRASE),
      walletName: "Freighter",
      appPassphrase: TESTNET_PASSPHRASE,
    });

    expect(result).toEqual({
      compatible: false,
      reason: "network-mismatch",
      message:
        "Verification submission isn't available on Mainnet. Switch Freighter to Testnet, then try again.",
    });
  });

  it("reports an unknown network with the same actionable instruction", () => {
    const result = checkChainCompatibility({
      feature: "transaction-signing",
      network: details("Private Network ; 2024"),
      walletName: "xBull",
      appPassphrase: TESTNET_PASSPHRASE,
    });

    expect(result).toEqual({
      compatible: false,
      reason: "unknown-network",
      message:
        "xBull is on a network this app doesn't recognise. Switch xBull to Testnet, then try again.",
    });
  });

  it("uses a generic app-network phrase when the configured passphrase is unrecognised", () => {
    const result = checkChainCompatibility({
      feature: "ownership-transfer",
      network: details(TESTNET_PASSPHRASE),
      walletName: "Albedo",
      appPassphrase: "Private Network ; 2024",
    });

    expect(result).toMatchObject({ compatible: false, reason: "network-mismatch" });
    if (!result.compatible) {
      expect(result.message).toContain("Switch Albedo to the network this app is set up for");
    }
  });
});
