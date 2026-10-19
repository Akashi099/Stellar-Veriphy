export type TransactionStatus = "PENDING" | "CONFIRMED" | "FAILED" | "TIMEOUT";

const HORIZON_URL = "https://horizon.stellar.org";
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 120000;

export async function fetchTransactionStatus(txHash: string): Promise<TransactionStatus> {
  try {
    const response = await fetch(`${HORIZON_URL}/transactions/${txHash}`);

    if (response.status === 404) {
      return "PENDING";
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.successful === false) {
      return "FAILED";
    }

    return "CONFIRMED";
  } catch (error) {
    console.error("Error fetching transaction status:", error);
    return "PENDING";
  }
}

export interface PollTransactionOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStatus?: (status: TransactionStatus) => void;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Polling aborted", "AbortError"));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new DOMException("Polling aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

export async function pollTransactionStatus(
  txHash: string,
  options: PollTransactionOptions = {}
): Promise<TransactionStatus> {
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const status = await fetchTransactionStatus(txHash);
    options.onStatus?.(status);
    if (status !== "PENDING") return status;

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await wait(Math.min(intervalMs, remaining), options.signal);
  }

  options.onStatus?.("TIMEOUT");
  return "TIMEOUT";
}

export interface TransactionStatusDetails {
  label: string;
  /** What is happening on the network right now. */
  description: string;
  /** What the user should expect or do next. */
  nextStep: string;
  tone: "info" | "success" | "warning" | "error";
  /** True when polling has finished and the status will not change again. */
  isFinal: boolean;
}

/**
 * Plain-language copy for each transaction status (#808).
 *
 * Kept next to the polling logic so every status view shows the same wording. `nextStep` tells
 * the user what to expect, which matters most in the TIMEOUT case: a timed-out transaction may
 * still apply, so resubmitting it could create a duplicate.
 */
export function describeTransactionStatus(status: TransactionStatus): TransactionStatusDetails {
  switch (status) {
    case "PENDING":
      return {
        label: "Pending",
        description: "Your transaction was submitted and is waiting to be included in a ledger.",
        nextStep:
          "This usually takes a few seconds. You can keep this page open; the status updates automatically.",
        tone: "info",
        isFinal: false,
      };
    case "CONFIRMED":
      return {
        label: "Confirmed",
        description: "The transaction is in the Stellar ledger and succeeded.",
        nextStep: "No action needed. Your verification result will appear shortly.",
        tone: "success",
        isFinal: true,
      };
    case "FAILED":
      return {
        label: "Failed",
        description: "The transaction did not succeed on the ledger.",
        nextStep: "Check your inputs, then submit the verification again.",
        tone: "error",
        isFinal: true,
      };
    case "TIMEOUT":
      return {
        label: "Still pending",
        description:
          "We have not seen a final result yet. The network may be slow, or the transaction has not reached it.",
        nextStep:
          "Check the transaction on the explorer, or retry the status check. Do not submit the transaction again, because the original may still apply and a second copy could be a duplicate.",
        tone: "warning",
        isFinal: false,
      };
  }
}
