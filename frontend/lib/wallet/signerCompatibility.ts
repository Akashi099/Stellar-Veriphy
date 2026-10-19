/**
 * signerCompatibility.ts
 *
 * Checks that a wallet is about to sign the transaction the app expects,
 * before the wallet is asked to sign. Three things are verified:
 *
 *  1. The account the wallet is using now is the one the app is signed in as.
 *  2. The wallet's network is one the app can run on.
 *  3. The transaction only invokes this app's configured contracts.
 *
 * Every check returns actionable messages rather than throwing, so callers can
 * log the codes and show the messages. Everything here is pure.
 */

import {
  Address,
  FeeBumpTransaction,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { type ChainFeature, checkChainCompatibility } from "@/lib/network/chainCompatibility";
import type { WalletNetworkDetails } from "@/services/walletAdapters";

export type SignerIssueCode =
  | "not_connected"
  | "signer_unavailable"
  | "invalid_signer"
  | "signer_changed"
  | "network_unavailable"
  | "network_mismatch"
  | "unknown_network"
  | "unparseable_transaction"
  | "unexpected_contract";

export interface SignerIssue {
  code: SignerIssueCode;
  message: string;
}

const STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{55}$/;

const CHAIN_REASON_CODES = {
  "network-mismatch": "network_mismatch",
  "unknown-network": "unknown_network",
} as const satisfies Record<string, SignerIssueCode>;

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export interface SignerCheckInput {
  /** Account the app is signed in as. Null when no wallet is connected. */
  connectedAddress: string | null;
  /** Account the wallet reports right now. Null when the wallet did not answer. */
  walletAddress: string | null;
  /** Network the wallet reports right now. */
  network: WalletNetworkDetails | null;
  walletName: string;
  feature: ChainFeature;
  appPassphrase?: string | undefined;
}

/** Verifies the signer and network before a wallet is asked to sign. */
export function checkSignerCompatibility({
  connectedAddress,
  walletAddress,
  network,
  walletName,
  feature,
  appPassphrase,
}: SignerCheckInput): SignerIssue[] {
  if (!connectedAddress) {
    return [
      {
        code: "not_connected",
        message:
          "Connect your wallet before signing. Choose a wallet and approve the connection request.",
      },
    ];
  }

  if (!walletAddress) {
    return [
      {
        code: "signer_unavailable",
        message: `${walletName} didn't return an account. Unlock ${walletName}, select an account, then try again.`,
      },
    ];
  }

  if (!STELLAR_PUBLIC_KEY.test(walletAddress)) {
    return [
      {
        code: "invalid_signer",
        message: `${walletName} returned an address that isn't a Stellar account. Reconnect ${walletName} and try again.`,
      },
    ];
  }

  if (walletAddress !== connectedAddress) {
    return [
      {
        code: "signer_changed",
        message: `${walletName} is now using ${shortAddress(walletAddress)}, but this app is signed in as ${shortAddress(connectedAddress)}. Switch ${walletName} back to ${shortAddress(connectedAddress)}, or disconnect and reconnect.`,
      },
    ];
  }

  // Unlike the wizard, signing needs a positive answer: an unknown network
  // must not pass as compatible.
  if (!network) {
    return [
      {
        code: "network_unavailable",
        message: `${walletName} didn't report its network. Unlock ${walletName} and try again.`,
      },
    ];
  }

  const compatibility = checkChainCompatibility({ feature, network, walletName, appPassphrase });
  if (compatibility.compatible) return [];

  return [
    {
      code: CHAIN_REASON_CODES[compatibility.reason],
      message: compatibility.message,
    },
  ];
}

/**
 * Returns the contract ids a transaction invokes, in order. Non-invoke
 * operations (payments, trustlines and so on) contribute nothing.
 */
function invokedContractIds(transaction: Transaction | FeeBumpTransaction): string[] {
  const inner = "innerTransaction" in transaction ? transaction.innerTransaction : transaction;
  const ids: string[] = [];

  for (const operation of inner.operations) {
    if (operation.type !== "invokeHostFunction") continue;
    const func = (operation as Operation.InvokeHostFunction).func;
    if (func.switch().name !== "hostFunctionTypeInvokeContract") continue;
    const contractAddress = func.invokeContract().contractAddress();
    ids.push(Address.fromScAddress(contractAddress).toString());
  }

  return ids;
}

/**
 * Verifies that a transaction only invokes contracts in `allowedContractIds`.
 *
 * Passes when no allowed contracts are configured, since there is nothing to
 * compare against. Transactions without contract calls are not flagged.
 */
export function checkTransactionTarget({
  xdr: transactionXdr,
  networkPassphrase,
  allowedContractIds,
}: {
  xdr: string;
  networkPassphrase: string;
  allowedContractIds: readonly string[];
}): SignerIssue[] {
  let transaction: Transaction | FeeBumpTransaction;
  try {
    transaction = TransactionBuilder.fromXDR(transactionXdr, networkPassphrase);
  } catch {
    return [
      {
        code: "unparseable_transaction",
        message:
          "This transaction couldn't be read, so it wasn't sent to your wallet. Start the action again.",
      },
    ];
  }

  const allowed = new Set(allowedContractIds.filter(Boolean));
  if (allowed.size === 0) return [];

  const unexpected = invokedContractIds(transaction).filter((id) => !allowed.has(id));
  if (unexpected.length === 0) return [];

  return [
    {
      code: "unexpected_contract",
      message: `This transaction calls ${unexpected.map(shortAddress).join(", ")}, which isn't one of this app's contracts. Don't sign it. Start the action again from the app.`,
    },
  ];
}
