/** Resolves after `ms`, or immediately when `signal` aborts. Never rejects. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Exponential backoff with "equal jitter": half fixed, half random, capped at `maxMs`. */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

export interface RetryOptions {
  /** Retries after the first attempt (total attempts = retries + 1). */
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt > opts.retries) throw err;
      const delayMs = backoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
      opts.onRetry?.(err, attempt, delayMs);
      await sleep(delayMs);
    }
  }
}
