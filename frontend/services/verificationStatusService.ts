/**
 * verificationStatusService.ts
 *
 * Polls the Stellar Horizon API (and optionally the oracle contract state)
 * for updates on a verification request.  Fires callbacks on every status
 * change so the UI can react without a page refresh.
 *
 * Architecture
 * ------------
 *  VerificationStatusService  — singleton-friendly class
 *    .watch(jobId, opts)       — start polling a job, returns an unsubscribe fn
 *    .unwatch(jobId)           — stop polling a specific job
 *    .unwatchAll()             — tear down all active polls
 *
 * Each "job" is identified by a caller-supplied string (e.g. request id or
 * transaction hash).  Multiple subscribers can watch the same job; they all
 * receive the same status objects.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VerificationPhase =
  | "submitted" // tx sent, not yet on ledger
  | "pending" // oracle request is Pending
  | "processing" // picked up by a provider
  | "verified" // oracle state → Verified
  | "rejected" // oracle state → Rejected
  | "cancelled" // request was cancelled
  | "failed" // unrecoverable error (network, timeout, etc.)
  | "expired"; // TTL elapsed before resolution

export interface VerificationStatus {
  jobId: string;
  phase: VerificationPhase;
  /** 0-100 progress estimate based on phase. */
  progress: number;
  /** Human-readable description for the current phase. */
  message: string;
  /** Stellar transaction hash, if known. */
  txHash?: string | undefined;
  /** Oracle request ID (u64 as string), if known. */
  requestId?: string | undefined;
  /** ISO timestamp of the last status change. */
  updatedAt: string;
  /** Whether the status is terminal (polling should stop). */
  terminal: boolean;
}

export interface WatchOptions {
  /** Stellar transaction hash to follow (optional if requestId is supplied). */
  txHash?: string | undefined;
  /** Oracle request ID to poll (optional if txHash is supplied). */
  requestId?: string | undefined;
  /** Horizon base URL.  Defaults to testnet. */
  horizonUrl?: string | undefined;
  /** How often to poll, in ms.  Default 3 000. */
  intervalMs?: number | undefined;
  /** Stop polling after this many ms.  Default 5 min. */
  timeoutMs?: number | undefined;
  /** Called on every status update. */
  onUpdate: (status: VerificationStatus) => void;
  /** Called once when a terminal status is reached. */
  onTerminal?: ((status: VerificationStatus) => void) | undefined;
  /** Called when polling fails (network error, etc.). */
  onError?: ((err: Error, jobId: string) => void) | undefined;
}

// ---------------------------------------------------------------------------
// Phase helpers
// ---------------------------------------------------------------------------

const PHASE_PROGRESS: Record<VerificationPhase, number> = {
  submitted: 10,
  pending: 25,
  processing: 55,
  verified: 100,
  rejected: 100,
  cancelled: 100,
  failed: 100,
  expired: 100,
};

const PHASE_MESSAGE: Record<VerificationPhase, string> = {
  submitted: "Transaction submitted — waiting for ledger confirmation…",
  pending: "Request received — awaiting provider assignment…",
  processing: "Provider is processing your verification request…",
  verified: "Verification complete — certificate issued.",
  rejected: "Verification rejected by provider.",
  cancelled: "Request was cancelled.",
  failed: "An error occurred. Please try again.",
  expired: "Request expired before it could be processed.",
};

/**
 * Short, canonical label per phase — the single source of truth for status
 * text shown in badges, timelines, and anywhere else a compact label (as
 * opposed to the longer `PHASE_MESSAGE` description) is needed. Components
 * should import this rather than defining their own copy, to avoid the
 * labels drifting out of sync with each other.
 */
export const PHASE_LABEL: Record<VerificationPhase, string> = {
  submitted: "Transaction submitted",
  pending: "Request received",
  processing: "Provider processing",
  verified: "Verification complete",
  rejected: "Rejected",
  cancelled: "Cancelled",
  failed: "Error",
  expired: "Expired",
};

const TERMINAL_PHASES = new Set<VerificationPhase>([
  "verified",
  "rejected",
  "cancelled",
  "failed",
  "expired",
]);

function makeStatus(
  jobId: string,
  phase: VerificationPhase,
  extras?: {
    txHash?: string | undefined;
    requestId?: string | undefined;
    message?: string | undefined;
  }
): VerificationStatus {
  return {
    jobId,
    phase,
    progress: PHASE_PROGRESS[phase],
    message: extras?.message ?? PHASE_MESSAGE[phase],
    txHash: extras?.txHash,
    requestId: extras?.requestId,
    updatedAt: new Date().toISOString(),
    terminal: TERMINAL_PHASES.has(phase),
  };
}

// ---------------------------------------------------------------------------
// Horizon transaction poller
// ---------------------------------------------------------------------------

const DEFAULT_HORIZON = "https://horizon-testnet.stellar.org";

type HorizonTxStatus = "SUCCESS" | "FAILED" | "NOT_FOUND" | "PENDING";

async function fetchTxStatus(txHash: string, horizonUrl: string): Promise<HorizonTxStatus> {
  try {
    const res = await fetch(`${horizonUrl}/transactions/${txHash}`, { cache: "no-store" });
    if (res.status === 404) return "NOT_FOUND";
    if (!res.ok) return "PENDING";
    const data = await res.json();
    return data.successful === true ? "SUCCESS" : "FAILED";
  } catch {
    return "PENDING";
  }
}

// ---------------------------------------------------------------------------
// Internal poll record
// ---------------------------------------------------------------------------

interface PollRecord {
  jobId: string;
  opts: Required<WatchOptions>;
  timerId: ReturnType<typeof setInterval>;
  timeoutId: ReturnType<typeof setTimeout>;
  lastPhase: VerificationPhase;
  cancelled: boolean;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

class VerificationStatusService {
  private polls = new Map<string, PollRecord>();

  /**
   * Begin polling for `jobId`.
   * Returns an unsubscribe function that stops polling for this job.
   */
  watch(jobId: string, opts: WatchOptions): () => void {
    // Stop any existing poll for this job before starting a fresh one
    this.unwatch(jobId);

    const fullOpts = {
      txHash: opts.txHash ?? "",
      requestId: opts.requestId ?? "",
      horizonUrl: opts.horizonUrl ?? DEFAULT_HORIZON,
      intervalMs: opts.intervalMs ?? 3_000,
      timeoutMs: opts.timeoutMs ?? 5 * 60 * 1_000,
      onUpdate: opts.onUpdate,
      onTerminal: opts.onTerminal,
      onError: opts.onError,
    };

    // Emit the initial "submitted" status immediately
    const initial = makeStatus(jobId, "submitted", {
      txHash: fullOpts.txHash || undefined,
      requestId: fullOpts.requestId || undefined,
    });
    fullOpts.onUpdate(initial);

    const record: PollRecord = {
      jobId,
      opts: fullOpts as Required<WatchOptions>,
      timerId: 0 as unknown as ReturnType<typeof setInterval>,
      timeoutId: 0 as unknown as ReturnType<typeof setTimeout>,
      lastPhase: "submitted",
      cancelled: false,
    };

    const emit = (
      phase: VerificationPhase,
      extras?: {
        txHash?: string | undefined;
        requestId?: string | undefined;
        message?: string | undefined;
      }
    ) => {
      if (record.cancelled) return;
      if (phase === record.lastPhase) return; // debounce identical updates
      record.lastPhase = phase;
      const status = makeStatus(jobId, phase, {
        txHash: fullOpts.txHash || extras?.txHash || undefined,
        requestId: fullOpts.requestId || extras?.requestId || undefined,
        message: extras?.message,
      });
      fullOpts.onUpdate(status);
      if (status.terminal) {
        fullOpts.onTerminal?.(status);
        this.unwatch(jobId);
      }
    };

    const tick = async () => {
      if (record.cancelled) return;
      try {
        // Step 1 — confirm the transaction landed on the ledger
        if (record.lastPhase === "submitted" && fullOpts.txHash) {
          const txStatus = await fetchTxStatus(fullOpts.txHash, fullOpts.horizonUrl);
          if (txStatus === "FAILED") {
            emit("failed");
            return;
          }
          if (txStatus === "SUCCESS") emit("pending");
          // NOT_FOUND / PENDING → stay in "submitted"
          return;
        }

        // Step 2 — poll oracle contract state via Horizon (contract data endpoint)
        // When a real Soroban RPC is wired up this can call the oracle directly.
        // For now we advance through plausible states based on elapsed time so
        // the UI is fully exercised without requiring a live contract deployment.
        if (record.lastPhase === "pending") {
          emit("processing");
          return;
        }

        if (record.lastPhase === "processing") {
          // In production: call oracle.get_request(requestId) via Soroban RPC
          // and map RequestState → VerificationPhase.
          // Here we resolve to "verified" to complete the demo flow.
          emit("verified");
          return;
        }
      } catch (err) {
        fullOpts.onError?.(err instanceof Error ? err : new Error(String(err)), jobId);
      }
    };

    record.timerId = setInterval(tick, fullOpts.intervalMs);

    // Hard timeout — mark as expired if still running after timeoutMs
    record.timeoutId = setTimeout(() => {
      if (!record.cancelled && !TERMINAL_PHASES.has(record.lastPhase)) {
        emit("expired");
      }
    }, fullOpts.timeoutMs);

    this.polls.set(jobId, record);
    return () => this.unwatch(jobId);
  }

  /** Stop polling a specific job. */
  unwatch(jobId: string): void {
    const record = this.polls.get(jobId);
    if (!record) return;
    record.cancelled = true;
    clearInterval(record.timerId);
    clearTimeout(record.timeoutId);
    this.polls.delete(jobId);
  }

  /** Stop all active polls. */
  unwatchAll(): void {
    for (const jobId of this.polls.keys()) {
      this.unwatch(jobId);
    }
  }

  /** True when a poll is active for the given jobId. */
  isWatching(jobId: string): boolean {
    return this.polls.has(jobId);
  }
}

// Export a single shared instance for the application
export const verificationStatusService = new VerificationStatusService();
export type { VerificationStatusService };
