/**
 * Throw from a job handler to attach a stable error code (used in metrics, logs and the job's
 * error history) and to say whether retrying can help.
 */
export class JobError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable = true,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "JobError";
  }
}

/** A bounded, metric-safe code for any thrown value. */
export function errorCode(err: unknown): string {
  let code: string;
  if (err instanceof JobError) code = err.code;
  else {
    const raw = (err as { code?: unknown } | null)?.code;
    if (typeof raw === "string" && raw) code = raw;
    else if (typeof raw === "number") code = `${err instanceof Error ? err.name : "E"}_${raw}`;
    else code = err instanceof Error && err.name ? err.name : "UNKNOWN";
  }
  return code.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 64);
}

export function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return err.cause instanceof Error ? `${err.message}: ${err.cause.message}` : err.message;
}

export function isRetryable(err: unknown): boolean {
  return !(err instanceof JobError) || err.retryable;
}

/** Errors above this length are truncated in logs; the full message stays in the job's error history. */
const LOG_MESSAGE_MAX = 500;

/**
 * Standard failure fields for every job log line, so failed jobs of any type can be grouped and
 * correlated with the same keys: `errorCode` (metric-safe), `error` (truncated message), `retryable`.
 */
export function describeError(err: unknown): { errorCode: string; error: string; retryable: boolean } {
  return {
    errorCode: errorCode(err),
    error: errorMessage(err).slice(0, LOG_MESSAGE_MAX),
    retryable: isRetryable(err),
  };
}
