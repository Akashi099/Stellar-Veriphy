"use client";

import { type ReactNode, useEffect, useState } from "react";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiExternalLink,
  FiLoader,
  FiRefreshCw,
} from "react-icons/fi";

import {
  describeTransactionStatus,
  pollTransactionStatus,
  type TransactionStatus,
} from "@/utils/transaction";

interface TransactionTrackerProps {
  txHash: string;
}

const ICON_BY_STATUS: Record<TransactionStatus, ReactNode> = {
  PENDING: <FiLoader className="w-5 h-5 animate-spin text-blue-500" aria-hidden="true" />,
  CONFIRMED: <FiCheckCircle className="w-5 h-5 text-green-500" aria-hidden="true" />,
  FAILED: <FiAlertCircle className="w-5 h-5 text-red-500" aria-hidden="true" />,
  TIMEOUT: <FiAlertCircle className="w-5 h-5 text-amber-500" aria-hidden="true" />,
};

const TEXT_BY_TONE = {
  info: "text-blue-600",
  success: "text-green-600",
  warning: "text-amber-600",
  error: "text-red-600",
} as const;

/**
 * Shows a submitted transaction moving from pending to a final result (#808).
 *
 * Polling restarts when `txHash` changes or the user presses Retry. Without a hash there is
 * nothing to poll, so the component says so instead of spinning forever.
 */
export function TransactionTracker({ txHash }: TransactionTrackerProps) {
  const [status, setStatus] = useState<TransactionStatus>("PENDING");
  // Bumped by the Retry button to restart polling for the same hash.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!txHash) return;

    const controller = new AbortController();
    setStatus("PENDING");
    void pollTransactionStatus(txHash, {
      signal: controller.signal,
      onStatus: setStatus,
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("FAILED");
    });

    return () => controller.abort();
  }, [txHash, attempt]);

  if (!txHash) {
    return (
      <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No transaction yet. Status appears here once the transaction is submitted.
        </p>
      </div>
    );
  }

  const details = describeTransactionStatus(status);
  const explorerUrl = `https://stellar.expert/explorer/public/tx/${txHash}`;
  const confirmedLabel = status === "FAILED" ? "Did not succeed" : "Confirmed on ledger";
  const isConfirmedStep = status === "CONFIRMED" || status === "FAILED";

  return (
    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-3">
      <div className="flex items-start gap-3">
        <div className="pt-0.5">{ICON_BY_STATUS[status]}</div>
        <div className="flex-1 min-w-0" role="status" aria-live="polite">
          <p className={`font-medium ${TEXT_BY_TONE[details.tone]}`}>{details.label}</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{details.description}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{details.nextStep}</p>
        </div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
          title="View on Stellar Expert"
        >
          <FiExternalLink className="w-4 h-4 text-gray-600 dark:text-gray-400" aria-hidden="true" />
          <span className="sr-only">View transaction on Stellar Expert</span>
        </a>
      </div>

      <ol
        aria-label="Transaction progress"
        className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
      >
        <li className="font-medium text-gray-800 dark:text-gray-200">1. Submitted</li>
        <li aria-hidden="true">→</li>
        <li
          className={
            isConfirmedStep ? "font-medium text-gray-800 dark:text-gray-200" : "text-gray-500"
          }
          aria-current={isConfirmedStep ? "step" : undefined}
        >
          2. {isConfirmedStep ? confirmedLabel : "Waiting for ledger"}
        </li>
      </ol>

      {status === "TIMEOUT" && (
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
        >
          <FiRefreshCw className="w-4 h-4" aria-hidden="true" />
          Retry status check
        </button>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={txHash}>
        {txHash}
      </p>
    </div>
  );
}
