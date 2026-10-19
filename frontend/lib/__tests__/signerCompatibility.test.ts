/**
 * Unit tests for lib/wallet/signerCompatibility.ts
 *
 * Transactions are built with the Stellar SDK so the contract-target check
 * runs against real transaction envelopes, not hand-written XDR.
 */

import {
  Account,
  Asset,
  Contract,
  Keypair,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { MAINNET_PASSPHRASE, TESTNET_PASSPHRASE } from "../../config/network";
import type { WalletNetworkDetails } from "../../services/walletAdapters";
import { checkSignerCompatibility, checkTransactionTarget } from "../wallet/signerCompatibility";

const SIGNER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const OTHER_SIGNER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
const APP_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 3));
const OTHER_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 4));

function network(networkPassphrase: string): WalletNetworkDetails {
  return {
    network: networkPassphrase,
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

function paymentXdr(): string {
  return new TransactionBuilder(new Account(SIGNER, "1"), {
    fee: "100",
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({ destination: OTHER_SIGNER, asset: Asset.native(), amount: "1" })
    )
    .setTimeout(60)
    .build()
    .toXDR();
}

const baseInput = {
  connectedAddress: SIGNER,
  walletAddress: SIGNER,
  network: network(TESTNET_PASSPHRASE),
  walletName: "Freighter",
  feature: "transaction-signing" as const,
  appPassphrase: TESTNET_PASSPHRASE,
};

describe("checkSignerCompatibility", () => {
  it("passes when the wallet account and network match the app", () => {
    expect(checkSignerCompatibility(baseInput)).toEqual([]);
  });

  it("asks the user to connect when no account is connected", () => {
    const issues = checkSignerCompatibility({ ...baseInput, connectedAddress: null });
    expect(issues).toEqual([expect.objectContaining({ code: "not_connected" })]);
  });

  it("explains what to do when the wallet returns no account", () => {
    const issues = checkSignerCompatibility({ ...baseInput, walletAddress: null });
    expect(issues).toEqual([
      expect.objectContaining({
        code: "signer_unavailable",
        message: expect.stringContaining("Unlock Freighter"),
      }),
    ]);
  });

  it("rejects an address that is not a Stellar public key", () => {
    const issues = checkSignerCompatibility({ ...baseInput, walletAddress: "GABC" });
    expect(issues).toEqual([expect.objectContaining({ code: "invalid_signer" })]);
  });

  it("blocks signing when the wallet has switched to a different account", () => {
    const issues = checkSignerCompatibility({ ...baseInput, walletAddress: OTHER_SIGNER });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "signer_changed" });
    expect(issues[0]?.message).toContain(`${OTHER_SIGNER.slice(0, 6)}…${OTHER_SIGNER.slice(-4)}`);
    expect(issues[0]?.message).toContain(`Switch Freighter back to ${SIGNER.slice(0, 6)}`);
  });

  it("blocks signing when the wallet does not report its network", () => {
    const issues = checkSignerCompatibility({ ...baseInput, network: null });
    expect(issues).toEqual([
      expect.objectContaining({
        code: "network_unavailable",
        message: expect.stringContaining("Unlock Freighter"),
      }),
    ]);
  });

  it("blocks signing on a network that differs from the app's", () => {
    const issues = checkSignerCompatibility({
      ...baseInput,
      network: network(MAINNET_PASSPHRASE),
    });
    expect(issues).toEqual([
      expect.objectContaining({
        code: "network_mismatch",
        message: expect.stringContaining("Switch Freighter to Testnet"),
      }),
    ]);
  });

  it("uses the wallet's current account, not the stored one, to decide", () => {
    const issues = checkSignerCompatibility({
      ...baseInput,
      connectedAddress: OTHER_SIGNER,
      walletAddress: SIGNER,
    });
    expect(issues).toEqual([expect.objectContaining({ code: "signer_changed" })]);
  });
});

describe("checkTransactionTarget", () => {
  it("passes when the transaction invokes an allowed contract", () => {
    expect(
      checkTransactionTarget({
        xdr: invokeXdr(APP_CONTRACT),
        networkPassphrase: TESTNET_PASSPHRASE,
        allowedContractIds: [APP_CONTRACT],
      })
    ).toEqual([]);
  });

  it("blocks a transaction that invokes a contract the app does not use", () => {
    const issues = checkTransactionTarget({
      xdr: invokeXdr(OTHER_CONTRACT),
      networkPassphrase: TESTNET_PASSPHRASE,
      allowedContractIds: [APP_CONTRACT],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "unexpected_contract" });
    expect(issues[0]?.message).toContain(OTHER_CONTRACT.slice(0, 6));
    expect(issues[0]?.message).toContain("Don't sign it");
  });

  it("flags a mixed transaction when any invoked contract is unexpected", () => {
    const xdr = new TransactionBuilder(new Account(SIGNER, "1"), {
      fee: "200",
      networkPassphrase: TESTNET_PASSPHRASE,
    })
      .addOperation(new Contract(APP_CONTRACT).call("mint"))
      .addOperation(new Contract(OTHER_CONTRACT).call("drain"))
      .setTimeout(60)
      .build()
      .toXDR();

    const issues = checkTransactionTarget({
      xdr,
      networkPassphrase: TESTNET_PASSPHRASE,
      allowedContractIds: [APP_CONTRACT],
    });
    expect(issues).toEqual([expect.objectContaining({ code: "unexpected_contract" })]);
  });

  it("does not flag transactions that only move funds", () => {
    expect(
      checkTransactionTarget({
        xdr: paymentXdr(),
        networkPassphrase: TESTNET_PASSPHRASE,
        allowedContractIds: [APP_CONTRACT],
      })
    ).toEqual([]);
  });

  it("skips the contract check when no contracts are configured", () => {
    expect(
      checkTransactionTarget({
        xdr: invokeXdr(OTHER_CONTRACT),
        networkPassphrase: TESTNET_PASSPHRASE,
        allowedContractIds: ["", ""],
      })
    ).toEqual([]);
  });

  it("reports a transaction it cannot read instead of passing it", () => {
    expect(
      checkTransactionTarget({
        xdr: "not-a-transaction",
        networkPassphrase: TESTNET_PASSPHRASE,
        allowedContractIds: [APP_CONTRACT],
      })
    ).toEqual([expect.objectContaining({ code: "unparseable_transaction" })]);
  });
});
