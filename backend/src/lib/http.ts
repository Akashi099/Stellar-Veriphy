import { safeUrl } from "./url.js";
import type { Logger } from "./logger.js";
import {
  externalApiDuration,
  externalApiRequests,
  externalApiRetries,
  externalApiSlowResponses,
  externalApiTimeouts,
} from "./metrics.js";
import { backoffDelay, sleep } from "./retry.js";

/**
 * Client for third-party HTTP APIs (#788): Horizon, Soroban RPC, IPFS, KMS, the TEE oracle,
 * webhook receivers. Every call gets a per-attempt timeout, an overall deadline and a bounded,
 * opt-in retry policy, and every failure is an ExternalApiError carrying the same metadata.
 *
 * Runbook: docs/operations/external-api-timeouts.md
 */

/** Hard ceiling on configured retries so a bad env value can't create a retry storm. */
export const MAX_RETRIES = 5;

/**
 * Default slow-response threshold (ms) for a single external API attempt. Attempts that succeed
 * but exceed this are counted in `external_api_slow_responses_total` so slow endpoints surface in
 * dashboards before they start timing out. Overridable per client via `slowThresholdMs`.
 */
export const DEFAULT_SLOW_THRESHOLD_MS = 2_000;

/** Statuses worth retrying: the request may succeed unchanged if sent again. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
/** Methods that are safe to resend by definition. POST/PATCH need an explicit `idempotent: true`. */
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

export type ExternalFailureReason = "timeout" | "connection" | "http_error" | "invalid_response" | "aborted";

export interface ExternalApiPolicy {
  /** Per-attempt limit, covering connect, headers and body. */
  timeoutMs: number;
  /** Retries after the first attempt (capped at MAX_RETRIES). 0 disables retries. */
  retries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  /** Overall budget for all attempts and backoff; no retry starts once it would be exceeded. */
  totalTimeoutMs: number;
  /**
   * Attempts slower than this (ms) are counted as slow responses. Defaults to
   * DEFAULT_SLOW_THRESHOLD_MS. Should be below `timeoutMs` so slow calls are visible before timeouts.
   */
  slowThresholdMs?: number;
}

export interface ExternalApiErrorMeta {
  service: string;
  method: string;
  /** Credentials and query string stripped. */
  url: string;
  reason: ExternalFailureReason;
  status?: number;
  attempts: number;
  timeoutMs: number;
  durationMs: number;
  retryable: boolean;
}

export class ExternalApiError extends Error {
  constructor(
    message: string,
    readonly meta: ExternalApiErrorMeta,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ExternalApiError";
  }

  /** Stable, metric-safe code; picked up by errorCode() in the job queue and by log serialization. */
  get code(): string {
    return `EXTERNAL_${this.meta.reason.toUpperCase()}`;
  }
}

export interface ExternalRequestInit extends Omit<RequestInit, "signal" | "body" | "headers"> {
  headers?: Record<string, string>;
  /** Only string bodies, so a request can be resent unchanged on retry. */
  body?: string;
  /** Caller cancellation (e.g. a job's AbortSignal). Never retried. */
  signal?: AbortSignal;
  /** Allow retrying a non-idempotent method (e.g. a POST that carries an idempotency key). */
  idempotent?: boolean;
  /** Override the client's policy for this call. */
  policy?: Partial<ExternalApiPolicy>;
}

interface AttemptFailure {
  reason: ExternalFailureReason;
  status?: number;
  retryAfterMs?: number;
  message: string;
  cause?: unknown;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function classify(err: unknown, timedOut: boolean, callerAborted: boolean): AttemptFailure {
  const message = err instanceof Error ? err.message : String(err);
  if (callerAborted) return { reason: "aborted", message: "Request cancelled by caller", cause: err };
  if (timedOut || (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"))) {
    return { reason: "timeout", message: "Request timed out", cause: err };
  }
  if (err instanceof TypeError) return { reason: "connection", message: `Connection failed: ${message}`, cause: err };
  return { reason: "connection", message, cause: err };
}

export class ExternalApiClient {
  readonly policy: ExternalApiPolicy;

  constructor(
    readonly service: string,
    policy: ExternalApiPolicy,
    private readonly log?: Logger,
  ) {
    this.policy = {
      ...policy,
      retries: Math.min(Math.max(0, policy.retries), MAX_RETRIES),
      slowThresholdMs: policy.slowThresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS,
    };
  }

  /** Sends a request and returns the 2xx response with its body fully read as text. */
  async request(
    url: string,
    init: ExternalRequestInit = {},
  ): Promise<{ status: number; headers: Headers; text: string; attempts: number }> {
    const { signal: callerSignal, idempotent, policy: override, ...fetchInit } = init;
    const policy = { ...this.policy, ...override };
    policy.retries = Math.min(Math.max(0, policy.retries), MAX_RETRIES);
    const method = (fetchInit.method ?? "GET").toUpperCase();
    const canRetry = idempotent ?? IDEMPOTENT_METHODS.has(method);
    const started = performance.now();
    const deadline = started + policy.totalTimeoutMs;
    const target = safeUrl(url);

    for (let attempt = 1; ; attempt++) {
      const attemptStarted = performance.now();
      // Never let one attempt run past the overall deadline.
      const attemptTimeout = Math.max(1, Math.min(policy.timeoutMs, Math.round(deadline - attemptStarted)));
      const timeoutSignal = AbortSignal.timeout(attemptTimeout);
      const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;

      let failure: AttemptFailure;
      try {
        const res = await fetch(url, { ...fetchInit, method, signal });
        const text = await res.text();
        if (res.ok) {
          this.observe(method, "success", attemptStarted, policy);
          return { status: res.status, headers: res.headers, text, attempts: attempt };
        }
        failure = {
          reason: "http_error",
          status: res.status,
          retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
          message: `HTTP ${res.status}`,
        };
      } catch (err) {
        failure = classify(err, timeoutSignal.aborted, callerSignal?.aborted === true);
      }
      this.observe(method, failure.reason, attemptStarted, policy);

      const retryableFailure =
        failure.reason === "timeout" ||
        failure.reason === "connection" ||
        (failure.reason === "http_error" && RETRYABLE_STATUSES.has(failure.status!));
      const retryable = retryableFailure && canRetry;

      if (retryable && attempt <= policy.retries) {
        const backoff = backoffDelay(attempt, policy.retryBaseDelayMs, policy.retryMaxDelayMs);
        const delayMs = Math.min(policy.retryMaxDelayMs, Math.max(backoff, failure.retryAfterMs ?? 0));
        // Skip the retry if waiting would leave no time for another attempt.
        if (performance.now() + delayMs < deadline - 1) {
          externalApiRetries.inc({ service: this.service, reason: failure.reason });
          this.log?.warn("external api call failed, retrying", {
            service: this.service,
            method,
            url: target,
            reason: failure.reason,
            status: failure.status,
            attempt,
            maxAttempts: policy.retries + 1,
            retryInMs: delayMs,
          });
          await sleep(delayMs, callerSignal);
          if (!callerSignal?.aborted) continue;
          failure = { reason: "aborted", message: "Request cancelled by caller" };
        }
      }

      const meta: ExternalApiErrorMeta = {
        service: this.service,
        method,
        url: target,
        reason: failure.reason,
        status: failure.status,
        attempts: attempt,
        timeoutMs: attemptTimeout,
        durationMs: Math.round(performance.now() - started),
        retryable: retryableFailure,
      };
      const error = new ExternalApiError(
        `${this.service} ${method} ${target} failed after ${attempt} attempt(s): ${failure.message}`,
        meta,
        { cause: failure.cause },
      );
      if (failure.reason !== "aborted") this.log?.warn("external api call failed", { ...meta, err: error });
      throw error;
    }
  }

  /** Like request(), but parses the body as JSON; a non-JSON body is an `invalid_response` failure. */
  async json<T>(url: string, init: ExternalRequestInit = {}): Promise<T> {
    const started = performance.now();
    const res = await this.request(url, {
      ...init,
      headers: { accept: "application/json", ...(init.body !== undefined ? { "content-type": "application/json" } : {}), ...init.headers },
    });
    try {
      return JSON.parse(res.text) as T;
    } catch (err) {
      const method = (init.method ?? "GET").toUpperCase();
      throw new ExternalApiError(
        `${this.service} ${method} ${safeUrl(url)} returned a non-JSON response`,
        {
          service: this.service,
          method,
          url: safeUrl(url),
          reason: "invalid_response",
          status: res.status,
          attempts: res.attempts,
          timeoutMs: init.policy?.timeoutMs ?? this.policy.timeoutMs,
          durationMs: Math.round(performance.now() - started),
          retryable: false,
        },
        { cause: err },
      );
    }
  }

  private observe(method: string, outcome: string, attemptStarted: number, policy: ExternalApiPolicy): void {
    const durationMs = performance.now() - attemptStarted;
    externalApiRequests.inc({ service: this.service, method, outcome });
    externalApiDuration.observe({ service: this.service, outcome }, durationMs / 1000);
    if (outcome === "timeout") {
      externalApiTimeouts.inc({ service: this.service, method });
    } else if (outcome === "success" && durationMs > (policy.slowThresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS)) {
      externalApiSlowResponses.inc({ service: this.service, method });
      this.log?.warn("external api call exceeded slow threshold", {
        service: this.service,
        method,
        durationMs: Math.round(durationMs),
        slowThresholdMs: policy.slowThresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS,
      });
    }
  }
}
