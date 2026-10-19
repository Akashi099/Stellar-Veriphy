"use client";

/**
 * VerificationStatusTracker.tsx
 *
 * Self-contained component that:
 *  1. Shows a step-by-step progress timeline for a verification request.
 *  2. Renders a live progress bar that fills as phases advance.
 *  3. Fires accessible toast notifications on every status change without
 *     requiring an external toast library (uses a built-in stack).
 *  4. Handles the "connection failure" and "expired" edge cases gracefully.
 *  5. Works with or without a transaction hash / request id — it degrades
 *     gracefully when only one identifier is available.
 *
 * Usage
 * -----
 *   <VerificationStatusTracker
 *     jobId="req-1"
 *     txHash="abc123…"
 *     requestId="42"
 *     autoStart          // begin polling immediately on mount
 *   />
 *
 *   // or start programmatically via the ref
 *   const ref = useRef<VerificationStatusTrackerHandle>(null);
 *   ref.current?.start();
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
} from "react";

import type { VerificationPhase,VerificationStatus } from "@/services/verificationStatusService";
import { PHASE_LABEL } from "@/services/verificationStatusService";
import { useVerificationStatus } from "@/src/hooks/useVerificationStatus";
import { formatDateTime } from "@/utils/formatDateTime";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerificationStatusTrackerProps {
  jobId: string;
  txHash?: string;
  requestId?: string;
  horizonUrl?: string;
  /** Start polling as soon as the component mounts. */
  autoStart?: boolean;
  /** Called when a terminal status is reached. */
  onComplete?: (status: VerificationStatus) => void;
}

export interface VerificationStatusTrackerHandle {
  start: () => void;
  stop: () => void;
}

// ---------------------------------------------------------------------------
// Phase pipeline (ordered)
// ---------------------------------------------------------------------------

const PIPELINE: VerificationPhase[] = ["submitted", "pending", "processing", "verified"];

const PHASE_ICON: Record<VerificationPhase, string> = {
  submitted: "⬆",
  pending: "⏳",
  processing: "🔄",
  verified: "✅",
  rejected: "❌",
  cancelled: "🚫",
  failed: "⚠️",
  expired: "⏰",
};

type PhaseVariant = "success" | "error" | "warning" | "info";

const PHASE_VARIANT: Record<VerificationPhase, PhaseVariant> = {
  submitted: "info",
  pending: "info",
  processing: "info",
  verified: "success",
  rejected: "error",
  cancelled: "warning",
  failed: "error",
  expired: "warning",
};

// ---------------------------------------------------------------------------
// Built-in toast stack
// ---------------------------------------------------------------------------

interface Toast {
  id: number;
  message: string;
  variant: PhaseVariant;
}

let _toastId = 0;

function toastReducer(
  state: Toast[],
  action: { type: "push"; payload: Omit<Toast, "id"> } | { type: "remove"; id: number }
): Toast[] {
  switch (action.type) {
    case "push":
      return [...state, { id: ++_toastId, ...action.payload }].slice(-5); // keep last 5
    case "remove":
      return state.filter((t) => t.id !== action.id);
    default:
      return state;
  }
}

const VARIANT_STYLES: Record<PhaseVariant, string> = {
  success: "bg-emerald-900/90 border-emerald-600 text-emerald-100",
  error: "bg-red-900/90 border-red-600 text-red-100",
  warning: "bg-amber-900/90 border-amber-600 text-amber-100",
  info: "bg-slate-800/90 border-slate-600 text-slate-100",
};

function ToastStack({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm transition-all duration-300 ${VARIANT_STYLES[t.variant]}`}
        >
          <span className="mt-0.5 shrink-0">
            {t.variant === "success"
              ? "✅"
              : t.variant === "error"
                ? "❌"
                : t.variant === "warning"
                  ? "⚠️"
                  : "ℹ️"}
          </span>
          <p className="flex-1 leading-snug">{t.message}</p>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ progress, variant }: { progress: number; variant: PhaseVariant }) {
  const track: Record<PhaseVariant, string> = {
    success: "bg-emerald-500",
    error: "bg-red-500",
    warning: "bg-amber-500",
    info: "bg-blue-500",
  };
  return (
    <div
      className="w-full h-2 bg-slate-700 rounded-full overflow-hidden"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${track[variant]}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step timeline
// ---------------------------------------------------------------------------

type StepState = "completed" | "active" | "upcoming";

function StepIndicator({ state, icon }: { state: StepState; icon: string }) {
  const ring: Record<StepState, string> = {
    completed: "border-emerald-500 bg-emerald-900/50 text-emerald-400",
    active: "border-blue-400 bg-blue-900/50 text-blue-300 animate-pulse",
    upcoming: "border-slate-600 bg-slate-800 text-slate-500",
  };
  return (
    <div
      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm shrink-0 ${ring[state]}`}
    >
      {state === "completed" ? "✓" : icon}
    </div>
  );
}

function PipelineTimeline({ currentPhase }: { currentPhase: VerificationPhase }) {
  const isTerminalOff = ["rejected", "cancelled", "failed", "expired"].includes(currentPhase);
  const activeIdx = PIPELINE.indexOf(currentPhase as VerificationPhase);

  return (
    <ol className="space-y-3">
      {PIPELINE.map((phase, idx) => {
        let state: StepState = "upcoming";
        if (isTerminalOff) {
          state = idx < activeIdx ? "completed" : "upcoming";
        } else if (idx < activeIdx) {
          state = "completed";
        } else if (idx === activeIdx) {
          state = currentPhase === "verified" ? "completed" : "active";
        }

        return (
          <li key={phase} className="flex items-center gap-3">
            <StepIndicator state={state} icon={PHASE_ICON[phase]} />
            <span
              className={`text-sm ${
                state === "completed"
                  ? "text-emerald-300"
                  : state === "active"
                    ? "text-white font-medium"
                    : "text-slate-500"
              }`}
            >
              {PHASE_LABEL[phase]}
            </span>
          </li>
        );
      })}

      {/* Off-pipeline terminal states get an extra row */}
      {isTerminalOff && (
        <li className="flex items-center gap-3">
          <StepIndicator state="active" icon={PHASE_ICON[currentPhase]} />
          <span
            className={`text-sm font-medium ${
              PHASE_VARIANT[currentPhase] === "error"
                ? "text-red-300"
                : PHASE_VARIANT[currentPhase] === "warning"
                  ? "text-amber-300"
                  : "text-slate-300"
            }`}
          >
            {PHASE_LABEL[currentPhase]}
          </span>
        </li>
      )}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const VerificationStatusTracker = forwardRef<
  VerificationStatusTrackerHandle,
  VerificationStatusTrackerProps
>(function VerificationStatusTracker(
  { jobId, txHash, requestId, horizonUrl, autoStart = false, onComplete },
  ref
) {
  const [toasts, dispatchToast] = useReducer(toastReducer, []);
  const toastTimeouts = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const pushToast = useCallback((message: string, variant: PhaseVariant) => {
    dispatchToast({ type: "push", payload: { message, variant } });
    // Auto-dismiss after 5 s
    const newId = _toastId + 1; // will match the id assigned inside reducer
    const tid = setTimeout(() => {
      dispatchToast({ type: "remove", id: newId });
      toastTimeouts.current.delete(newId);
    }, 5_000);
    toastTimeouts.current.set(newId, tid);
  }, []);

  const dismissToast = useCallback((id: number) => {
    dispatchToast({ type: "remove", id });
    const tid = toastTimeouts.current.get(id);
    if (tid) {
      clearTimeout(tid);
      toastTimeouts.current.delete(id);
    }
  }, []);

  // Clear all toast timeouts on unmount
  useEffect(() => {
    return () => {
      toastTimeouts.current.forEach(clearTimeout);
    };
  }, []);

  const { status, isPolling, start, stop } = useVerificationStatus({
    txHash,
    requestId,
    horizonUrl,
    onStatusChange(s) {
      pushToast(s.message, PHASE_VARIANT[s.phase]);
    },
    onComplete(s) {
      onComplete?.(s);
    },
    onError(err) {
      pushToast(`Polling error: ${err.message}`, "error");
    },
  });

  // Expose start/stop via ref
  useImperativeHandle(
    ref,
    () => ({
      start: () => start(jobId, { txHash, requestId, horizonUrl }),
      stop,
    }),
    [start, stop, jobId, txHash, requestId, horizonUrl]
  );

  // Auto-start on mount
  useEffect(() => {
    if (autoStart) {
      start(jobId, { txHash, requestId, horizonUrl });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPhase = status?.phase ?? "submitted";
  const variant = PHASE_VARIANT[currentPhase];
  const progress = status?.progress ?? 0;
  const lastUpdated = status?.updatedAt ? formatDateTime(status.updatedAt) : null;
  const explorerUrl = txHash ? `https://stellar.expert/explorer/testnet/tx/${txHash}` : null;

  return (
    <>
      {/* Main card */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white text-base">Verification Status</h3>
          {isPolling && (
            <span className="flex items-center gap-1.5 text-xs text-blue-400">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              Live
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-400">
            <span>{PHASE_LABEL[currentPhase]}</span>
            <span>{progress}%</span>
          </div>
          <ProgressBar progress={progress} variant={variant} />
        </div>

        {/* Step timeline */}
        <PipelineTimeline currentPhase={currentPhase} />

        {/* Detail rows */}
        {(txHash || requestId || status?.updatedAt) && (
          <dl className="space-y-1.5 border-t border-slate-800 pt-4">
            {requestId && (
              <div className="flex justify-between text-xs">
                <dt className="text-slate-400">Request ID</dt>
                <dd className="text-slate-200 font-mono">{requestId}</dd>
              </div>
            )}
            {txHash && (
              <div className="flex justify-between text-xs">
                <dt className="text-slate-400">Tx Hash</dt>
                <dd className="text-slate-200 font-mono truncate max-w-[180px]">{txHash}</dd>
              </div>
            )}
            {status?.updatedAt && lastUpdated && (
              <div className="flex justify-between text-xs">
                <dt className="text-slate-400">Last updated</dt>
                <dd className="text-slate-400">
                  <time dateTime={status.updatedAt}>{lastUpdated}</time>
                </dd>
              </div>
            )}
          </dl>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
            >
              View on Explorer ↗
            </a>
          )}
          {!isPolling && !status?.terminal && (
            <button
              onClick={() => start(jobId, { txHash, requestId, horizonUrl })}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white transition-colors"
            >
              Retry
            </button>
          )}
          {isPolling && (
            <button
              onClick={stop}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              Stop polling
            </button>
          )}
        </div>

        {/* Connection failure fallback message */}
        {currentPhase === "failed" && (
          <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            Could not reach the network. Check your connection and click Retry.
          </p>
        )}
      </div>

      {/* Toast stack rendered outside the card so it always floats */}
      <ToastStack toasts={toasts} dismiss={dismissToast} />
    </>
  );
});
