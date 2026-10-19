"use client";

/**
 * RetryableError — #763
 *
 * One consistent error state for transient failures (network drops, 5xx,
 * rate limits). Shows what went wrong, a single retry action with a clear
 * in-progress state, a countdown when the server asked us to wait, and the
 * request ID for support (#765).
 *
 * Usage:
 *   <RetryableError error={error} onRetry={reload} retrying={loading} />
 *   <RetryableError error={error} onRetry={reload} variant="inline" />
 */

import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import React, { useEffect, useState } from "react";

import { describeError } from "@/lib/apiErrors";
import { cn } from "@/utils/cn";

import { Spinner } from "./Spinner";

export interface RetryableErrorProps {
  /** The thrown error (ApiError, TypeError from fetch, Error, string…). */
  error: unknown;
  /** Called when the user clicks retry. May return a promise; the button shows progress until it settles. */
  onRetry?: () => unknown;
  /** Externally controlled in-progress flag (e.g. the query's `isFetching`). */
  retrying?: boolean;
  /** Override the computed title. */
  title?: string;
  /** Fallback message when the error carries none. */
  fallbackMessage?: string;
  /** `block` for full panels, `inline` for a compact banner inside forms/cards. */
  variant?: "block" | "inline";
  retryLabel?: string;
  className?: string;
}

function useCountdown(seconds: number | undefined, key: unknown): number {
  const [remaining, setRemaining] = useState(seconds ?? 0);

  useEffect(() => {
    setRemaining(seconds ?? 0);
    if (!seconds) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const left = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setRemaining(left);
      if (left === 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [seconds, key]);

  return remaining;
}

export function RetryableError({
  error,
  onRetry,
  retrying: retryingProp,
  title,
  fallbackMessage,
  variant = "block",
  retryLabel = "Try again",
  className,
}: RetryableErrorProps) {
  const described = describeError(error, fallbackMessage);
  const [pending, setPending] = useState(false);
  const waitSeconds = useCountdown(described.retryAfterSeconds, error);
  const retrying = retryingProp ?? pending;
  const offline = described.title === "You're offline" || described.title === "Connection problem";

  async function handleRetry() {
    if (!onRetry || retrying || waitSeconds > 0) return;
    setPending(true);
    try {
      await onRetry();
    } catch {
      // The caller surfaces the new error through `error`; nothing to do here.
    } finally {
      setPending(false);
    }
  }

  const Icon = offline ? WifiOff : AlertTriangle;
  const canRetry = Boolean(onRetry) && described.retryable;
  const inline = variant === "inline";

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "rounded-xl border border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100",
        inline ? "flex flex-wrap items-start gap-3 p-3 text-sm" : "flex flex-col items-center gap-3 p-6 text-center",
        className
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("shrink-0 text-red-600 dark:text-red-400", inline ? "mt-0.5 h-4 w-4" : "h-8 w-8")}
      />
      <div className={cn("min-w-0", inline ? "flex-1" : "max-w-md space-y-1")}>
        <p className="font-semibold">{title ?? described.title}</p>
        <p className={cn("text-red-800 dark:text-red-200", !inline && "text-sm")}>{described.message}</p>
        {described.requestId && (
          <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">
            Reference ID: <code className="select-all font-mono">{described.requestId}</code>
          </p>
        )}
      </div>
      {canRetry && (
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying || waitSeconds > 0}
          aria-busy={retrying || undefined}
          className={cn(
            "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 transition-colors",
            "hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-70",
            "dark:border-red-800 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900"
          )}
        >
          {retrying ? (
            <>
              <Spinner size="sm" color="current" />
              Retrying…
            </>
          ) : waitSeconds > 0 ? (
            <>Retry in {waitSeconds}s</>
          ) : (
            <>
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              {retryLabel}
            </>
          )}
        </button>
      )}
    </div>
  );
}

export default RetryableError;
