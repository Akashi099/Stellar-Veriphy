"use client";

/**
 * useVerificationStatus
 *
 * React hook that wraps verificationStatusService for easy component
 * consumption.  Automatically cleans up the poll on unmount.
 *
 * Usage
 * -----
 *   const { status, isPolling, start, stop } = useVerificationStatus();
 *
 *   // kick off polling after submitting a request
 *   start("job-123", { txHash: "abc…", onToast: showToast });
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type VerificationStatus,
  type CancellationRequest,
  verificationStatusService,
  type WatchOptions,
} from "@/services/verificationStatusService";

// ---------------------------------------------------------------------------
// Public hook API
// ---------------------------------------------------------------------------

export interface UseVerificationStatusOptions extends Omit<
  WatchOptions,
  "onUpdate" | "onTerminal" | "onError"
> {
  /**
   * Optional callback fired whenever the status advances.
   * Use this to trigger toast notifications from outside the hook.
   */
  onStatusChange?: (status: VerificationStatus) => void;
  /**
   * Optional callback fired when a terminal status is reached.
   */
  onComplete?: (status: VerificationStatus) => void;
  /**
   * Optional error callback.
   */
  onError?: (err: Error, jobId: string) => void;
}

export interface UseVerificationStatusReturn {
  /** Latest status snapshot, or null before polling starts. */
  status: VerificationStatus | null;
  /** True while a poll is running. */
  isPolling: boolean;
  /**
   * Start (or restart) polling for the given jobId.
   * Supplying a new jobId to a running hook stops the previous poll first.
   */
  start: (jobId: string, opts?: UseVerificationStatusOptions) => void;
  /** Manually stop the current poll. */
  stop: () => void;
  cancel: (request?: CancellationRequest) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function useVerificationStatus(
  defaultOpts?: UseVerificationStatusOptions
): UseVerificationStatusReturn {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Keep a ref to the active jobId so the cleanup effect always sees the
  // latest value without being listed as a dependency.
  const activeJobId = useRef<string | null>(null);
  // Stable ref to the latest opts so callbacks are always fresh.
  const optsRef = useRef<UseVerificationStatusOptions | undefined>(defaultOpts);
  useEffect(() => {
    optsRef.current = defaultOpts;
  }, [defaultOpts]);

  // ── stop ──────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    if (activeJobId.current) {
      verificationStatusService.unwatch(activeJobId.current);
      activeJobId.current = null;
    }
    setIsPolling(false);
  }, []);

  // ── start ─────────────────────────────────────────────────────────────────

  const start = useCallback(
    (jobId: string, callOpts?: UseVerificationStatusOptions) => {
      // Stop any previous poll
      stop();

      const merged = { ...optsRef.current, ...callOpts };

      activeJobId.current = jobId;
      setIsPolling(true);
      setStatus(null);

      verificationStatusService.watch(jobId, {
        txHash: merged.txHash,
        requestId: merged.requestId,
        horizonUrl: merged.horizonUrl,
        intervalMs: merged.intervalMs,
        timeoutMs: merged.timeoutMs,

        onUpdate(s) {
          setStatus(s);
          merged.onStatusChange?.(s);
        },

        onTerminal(s) {
          setIsPolling(false);
          activeJobId.current = null;
          merged.onComplete?.(s);
        },

        onError(err, id) {
          setIsPolling(verificationStatusService.isWatching(id));
          merged.onError?.(err, id);
        },
      });
    },
    [stop]
  );

  // ── cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (activeJobId.current) {
        verificationStatusService.unwatch(activeJobId.current);
      }
    };
  }, []);

  const cancel = useCallback(async (request?: CancellationRequest) => {
    const jobId = activeJobId.current;
    if (!jobId) return;
    await verificationStatusService.cancel(jobId, request);
  }, []);

  return { status, isPolling, start, stop, cancel };
}
