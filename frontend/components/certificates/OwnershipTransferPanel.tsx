"use client";

import { useEffect, useId, useState } from "react";

import { WalletSelector } from "@/components/wallet/WalletSelector";
import { CopyButton } from "@/components/CopyButton";
import { useWallet } from "@/context/WalletContext";
import {
  getCertificateOwner,
  getOwnershipTransferHistory,
  type OwnershipTransferRecord,
  transferCertificateOwnership,
} from "@/services/certificateOwnershipService";

interface OwnershipTransferPanelProps {
  certificateId: string;
  initialOwner: string;
}

const STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{55}$/;

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function OwnershipTransferPanel({
  certificateId,
  initialOwner,
}: OwnershipTransferPanelProps) {
  const { connected, publicKey } = useWallet();
  const recipientId = useId();
  const [currentOwner, setCurrentOwner] = useState(initialOwner);
  const [recipient, setRecipient] = useState("");
  const [history, setHistory] = useState<OwnershipTransferRecord[]>([]);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentOwner(getCertificateOwner(certificateId, initialOwner));
    setHistory(getOwnershipTransferHistory(certificateId));
  }, [certificateId, initialOwner]);

  const isCurrentOwner = connected && publicKey === currentOwner;
  const isValidRecipient = STELLAR_PUBLIC_KEY.test(recipient);

  const reviewTransfer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    if (!isCurrentOwner || !publicKey) {
      setError("Connect the current owner's wallet to initiate this transfer.");
      return;
    }
    if (!isValidRecipient) {
      setError("Enter a valid Stellar public address beginning with G.");
      return;
    }
    if (recipient === currentOwner) {
      setError("Choose an address different from the current owner.");
      return;
    }
    setConfirming(true);
  };

  const confirmTransfer = () => {
    if (!publicKey || !isCurrentOwner) {
      setError("The connected wallet is no longer the current owner.");
      setConfirming(false);
      return;
    }
    try {
      const transfer = transferCertificateOwnership({
        certificateId,
        expectedOwner: currentOwner,
        actor: publicKey,
        newOwner: recipient,
      });
      setCurrentOwner(transfer.to);
      setHistory(getOwnershipTransferHistory(certificateId));
      setRecipient("");
      setConfirming(false);
      setStatus("Preview updated in this browser. No on-chain transaction was sent.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not transfer ownership.");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-slate-700">Current owner</p>
        <div className="mt-1 flex items-start gap-1" aria-live="polite">
          <p className="min-w-0 break-all font-mono text-sm text-slate-900">{currentOwner}</p>
          <CopyButton text={currentOwner} label="Copy current owner wallet address" />
        </div>
      </div>

      <p className="border-l-2 border-amber-400 pl-3 text-sm text-amber-900" role="note">
        This page uses a local preview. Transfer history is saved in this browser; changing the owner
        here does not update the certificate on Stellar.
      </p>

      {isCurrentOwner ? (
        confirming ? (
          <div className="space-y-3 border-t border-slate-200 pt-4" aria-labelledby="transfer-confirm-title">
            <h3 id="transfer-confirm-title" className="font-semibold text-slate-900">
              Confirm ownership transfer
            </h3>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-slate-500">From</dt>
                <dd className="break-all font-mono text-slate-900">{currentOwner}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-500">To</dt>
                <dd className="break-all font-mono text-slate-900">{recipient}</dd>
              </div>
            </dl>
            <p className="text-sm text-slate-600">
              After confirmation, this browser will show the new owner. The original creator
              attribution and existing certificate metadata remain unchanged.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={confirmTransfer}
                className="rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
              >
                Confirm transfer
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={reviewTransfer} className="space-y-3 border-t border-slate-200 pt-4">
            <div>
              <label htmlFor={recipientId} className="block text-sm font-medium text-slate-800">
                Transfer to Stellar address
              </label>
              <input
                id={recipientId}
                value={recipient}
                onChange={(event) => setRecipient(event.target.value.trim().toUpperCase())}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="G…"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/30"
                aria-describedby={`${recipientId}-hint`}
              />
              <p id={`${recipientId}-hint`} className="mt-1 text-xs text-slate-500">
                The destination must be a valid Stellar public address.
              </p>
            </div>
            <button
              type="submit"
              disabled={!isValidRecipient}
              className="rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
            >
              Review transfer
            </button>
          </form>
        )
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-sm text-slate-600">
            {connected && publicKey
              ? `Connected account ${shortenAddress(publicKey)} is not the current owner.`
              : "Connect the current owner's wallet to initiate a transfer."}
          </p>
          <button
            type="button"
            onClick={() => setWalletPickerOpen(true)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          >
            {connected ? "Switch wallet" : "Connect owner wallet"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
      {status && <p className="text-sm text-emerald-700" role="status">{status}</p>}

      {history.length > 0 && (
        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-900">Transfer history preview</h3>
          <ol className="mt-2 divide-y divide-slate-100">
            {history.map((transfer) => (
              <li key={`${transfer.occurredAt}-${transfer.from}`} className="py-3 text-sm">
                <p className="font-medium text-slate-800">Ownership transfer recorded locally</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-600">
                  {transfer.from} <span aria-hidden="true">→</span> {transfer.to}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Initiated by {shortenAddress(transfer.actor)} ·{" "}
                  <time dateTime={transfer.occurredAt}>
                    {new Date(transfer.occurredAt).toLocaleString()}
                  </time>
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <WalletSelector open={walletPickerOpen} onClose={() => setWalletPickerOpen(false)} />
    </div>
  );
}
