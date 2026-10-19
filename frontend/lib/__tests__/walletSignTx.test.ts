/**
 * Tests for the wallet store's signTx guard (#802).
 *
 * The store reads the app's network and contract ids from the environment when
 * it loads, so each test sets them and loads a fresh copy of the store.
 */

import { Account, Contract, Keypair, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";

import { MAINNET_PASSPHRASE, TESTNET_PASSPHRASE } from "../../config/network";
import type { WalletAdapter, WalletNetworkDetails } from "../../services/walletAdapters";

const logEvent = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/security/auditLogger", () => ({
  auditLogger: { logEvent: (...args: unknown[]) => logEvent(...args) },
}));

const SIGNER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const OTHER_SIGNER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
const APP_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 3));
const OTHER_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 4));

function details(networkPassphrase: string): WalletNetworkDetails {
  return {
    network: networkPassphrase === MAINNET_PASSPHRASE ? "PUBLIC" : "TESTNET",
    networkUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase,
  };
}

function invokeXdr(contractId: string): string {
  return new TransactionBuilder(new Account(SIGNER, "1"), {
    fee: "100",
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call("mint"))
    .setTimeout(60)
    .build()
    .toXDR();
}

function makeAdapter(overrides: Partial<Record<"getAddress" | "getNetwork", unknown>> = {}) {
  return {
    name: "Freighter",
    type: "freighter",
    installUrl: "https://example.test/freighter",
    isAvailable: jest.fn(),
    connect: jest.fn(),
    getAddress: jest.fn().mockResolvedValue(SIGNER),
    getNetwork: jest.fn().mockResolvedValue(details(TESTNET_PASSPHRASE)),
    signTransaction: jest.fn(async (_xdr: string, passphrase: string, address: string) => {
      return `signed:${passphrase}:${address}`;
    }),
    ...overrides,
  } as unknown as WalletAdapter & {
    getAddress: jest.Mock;
    getNetwork: jest.Mock;
    signTransaction: jest.Mock;
  };
}

/** Loads a fresh store configured for the given app network. */
function loadStore(appPassphrase: string) {
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE = appPassphrase;
  process.env.NEXT_PUBLIC_ORACLE_CONTRACT_ID = APP_CONTRACT;
  process.env.NEXT_PUBLIC_PROVENANCE_CONTRACT_ID = "";
  process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID = "";

  let store: typeof import("@/store/useWalletStore").useWalletStore | undefined;
  jest.isolateModules(() => {
    store = require("@/store/useWalletStore").useWalletStore;
  });
  if (!store) throw new Error("store failed to load");
  return store;
}

function connectedStore(appPassphrase: string, adapter: WalletAdapter) {
  const store = loadStore(appPassphrase);
  store.setState({
    adapter,
    publicKey: SIGNER,
    connected: true,
    network: details(TESTNET_PASSPHRASE),
  });
  return store;
}

beforeEach(() => {
  logEvent.mockClear();
});

describe("useWalletStore.signTx", () => {
  it("signs with the wallet's current network and account when everything matches", async () => {
    const adapter = makeAdapter();
    const store = connectedStore(TESTNET_PASSPHRASE, adapter);

    const signed = await store.getState().signTx(invokeXdr(APP_CONTRACT));

    expect(signed).toBe(`signed:${TESTNET_PASSPHRASE}:${SIGNER}`);
    expect(adapter.signTransaction).toHaveBeenCalledTimes(1);
  });

  it("refuses to sign after the wallet switches account", async () => {
    const adapter = makeAdapter({ getAddress: jest.fn().mockResolvedValue(OTHER_SIGNER) });
    const store = connectedStore(TESTNET_PASSPHRASE, adapter);

    await expect(store.getState().signTx(invokeXdr(APP_CONTRACT))).rejects.toThrow(
      /Switch Freighter back to/
    );
    expect(adapter.signTransaction).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "signer compatibility check failed",
        severity: "warning",
        details: expect.stringContaining("signer_changed"),
      })
    );
  });

  it("refuses to sign when the wallet is on a different network than the app", async () => {
    const adapter = makeAdapter({
      getNetwork: jest.fn().mockResolvedValue(details(MAINNET_PASSPHRASE)),
    });
    const store = connectedStore(TESTNET_PASSPHRASE, adapter);

    await expect(store.getState().signTx(invokeXdr(APP_CONTRACT))).rejects.toThrow(
      /isn't available on Mainnet/
    );
    expect(adapter.signTransaction).not.toHaveBeenCalled();
  });

  it("refuses to sign a transaction that calls a contract the app does not use", async () => {
    const adapter = makeAdapter();
    const store = connectedStore(TESTNET_PASSPHRASE, adapter);

    await expect(store.getState().signTx(invokeXdr(OTHER_CONTRACT))).rejects.toThrow(
      /isn't one of this app's contracts/
    );
    expect(adapter.signTransaction).not.toHaveBeenCalled();
  });

  it("refuses to sign when the wallet does not report its account", async () => {
    const adapter = makeAdapter({ getAddress: jest.fn().mockRejectedValue(new Error("locked")) });
    const store = connectedStore(TESTNET_PASSPHRASE, adapter);

    await expect(store.getState().signTx(invokeXdr(APP_CONTRACT))).rejects.toThrow(
      /didn't return an account/
    );
    expect(adapter.signTransaction).not.toHaveBeenCalled();
  });
});
