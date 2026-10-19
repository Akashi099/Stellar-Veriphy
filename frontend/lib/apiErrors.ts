import type { FieldError } from "@stellarveriphy/shared";

/**
 * Shared client-side error model for API calls (#763, #765, #766).
 *
 * Turns a failed `Response` into an `ApiError` that carries the request ID,
 * rate-limit metadata and a retryability hint, and turns any thrown error into
 * copy the UI can show directly via `describeError()`.
 */

export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  windowSeconds?: number;
  retryAfterSeconds?: number;
  /** ISO timestamp after which a retry is expected to succeed. */
  retryAt?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly errors: FieldError[] = [],
    readonly retryAfterSeconds?: number,
    readonly requestId?: string,
    readonly code?: string,
    readonly rateLimit?: RateLimitInfo
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isRateLimited(): boolean {
    return this.httpStatus === 429;
  }

  get isNetworkError(): boolean {
    return this.httpStatus === 0;
  }

  /** Transient failures the user can reasonably retry. */
  get isRetryable(): boolean {
    const s = this.httpStatus;
    return s === 0 || s === 408 || s === 425 || s === 429 || s >= 500;
  }
}

const NETWORK_MESSAGE = "Could not reach the server. Check your connection and try again.";

export function createRequestId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `req_${random}`;
}

function positiveNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** Reads rate-limit metadata from the body (preferred) and the standard headers. */
export function parseRateLimit(res: Response, body: unknown): RateLimitInfo | undefined {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const fromBody = (b.rateLimit && typeof b.rateLimit === "object" ? b.rateLimit : {}) as Record<string, unknown>;

  const info: RateLimitInfo = {
    limit: positiveNumber(fromBody.limit ?? res.headers.get("X-RateLimit-Limit")),
    remaining: nonNegativeNumber(fromBody.remaining ?? res.headers.get("X-RateLimit-Remaining")),
    windowSeconds: positiveNumber(fromBody.windowSeconds ?? res.headers.get("X-RateLimit-Window")),
    retryAfterSeconds: positiveNumber(
      fromBody.retryAfterSeconds ?? b.retryAfterSeconds ?? res.headers.get("Retry-After")
    ),
    retryAt: typeof fromBody.retryAt === "string" ? fromBody.retryAt : undefined,
  };

  return Object.values(info).some((v) => v !== undefined) ? info : undefined;
}

/** Builds a user-facing rate-limit message from whatever metadata is available. */
export function rateLimitMessage(info: RateLimitInfo | undefined): string {
  const parts = ["You're sending requests too quickly."];
  if (info?.limit && info.windowSeconds) {
    parts.push(`The limit is ${info.limit} per ${formatWait(info.windowSeconds)}.`);
  }
  parts.push(
    info?.retryAfterSeconds
      ? `Please wait ${formatWait(info.retryAfterSeconds)} before trying again.`
      : "Please wait a moment before trying again."
  );
  return parts.join(" ");
}

export function networkError(requestId?: string): ApiError {
  return new ApiError(NETWORK_MESSAGE, 0, [], undefined, requestId, "network_error");
}

/** Converts a non-OK response (and its parsed JSON body, if any) into an ApiError. */
export function apiErrorFromResponse(res: Response, body: unknown): ApiError {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const requestId =
    (typeof b.requestId === "string" ? b.requestId : undefined) ?? res.headers.get("X-Request-Id") ?? undefined;
  const code = typeof b.code === "string" ? b.code : typeof b.status === "string" ? b.status : undefined;
  const serverMessage =
    (typeof b.message === "string" && b.message) || (typeof b.error === "string" && b.error) || undefined;

  if (res.status === 429) {
    const rateLimit = parseRateLimit(res, body);
    return new ApiError(
      serverMessage ?? rateLimitMessage(rateLimit),
      429,
      [],
      rateLimit?.retryAfterSeconds,
      requestId,
      code ?? "rate_limited",
      rateLimit
    );
  }

  return new ApiError(
    serverMessage ?? `Request failed (${res.status}).`,
    res.status,
    Array.isArray(b.errors) ? (b.errors as FieldError[]) : [],
    positiveNumber(res.headers.get("Retry-After")),
    requestId,
    code
  );
}

/**
 * Like `fetch`, but throws an ApiError (with request ID / rate-limit info) on
 * network failure or a non-OK status. Returns the parsed JSON body.
 */
export async function fetchJson<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const requestId = createRequestId();
  const headers = new Headers(init?.headers);
  if (!headers.has("X-Request-Id")) headers.set("X-Request-Id", requestId);

  let res: Response;
  try {
    res = await fetch(input, { ...init, headers });
  } catch {
    throw networkError(requestId);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw apiErrorFromResponse(res, body);
  return body as T;
}

export interface ErrorDescription {
  title: string;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  requestId?: string;
}

/** Maps any thrown value to copy suitable for an error state with a retry action. */
export function describeError(error: unknown, fallback = "Something went wrong."): ErrorDescription {
  if (error instanceof ApiError) {
    if (error.isRateLimited) {
      return {
        title: "Slow down a little",
        message: error.message || rateLimitMessage(error.rateLimit),
        retryable: true,
        retryAfterSeconds: error.retryAfterSeconds,
        requestId: error.requestId,
      };
    }
    if (error.isNetworkError) {
      return { title: "Connection problem", message: error.message, retryable: true, requestId: error.requestId };
    }
    return {
      title: error.httpStatus >= 500 ? "Server error" : "Request failed",
      message: error.message || fallback,
      retryable: error.isRetryable,
      requestId: error.requestId,
    };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { title: "You're offline", message: NETWORK_MESSAGE, retryable: true };
  }
  if (error instanceof TypeError) {
    // fetch() rejects with a TypeError on network failure.
    return { title: "Connection problem", message: NETWORK_MESSAGE, retryable: true };
  }
  return {
    title: "Something went wrong",
    message: error instanceof Error && error.message ? error.message : fallback,
    retryable: true,
  };
}
