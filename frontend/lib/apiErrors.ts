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

/** Canonical error code for a 403 caused by missing verification permissions (#850). */
export const ACCESS_DENIED_CODE = "ACCESS_DENIED";

/** Details attached to an access-denied error so the UI can request the missing scope. */
export interface AccessDeniedDetails {
  /** Permission/scope the action requires, e.g. `verification:approve`. */
  requiredPermission?: string;
  /** Broader scope the permission belongs to, e.g. `verification`. */
  requiredScope?: string;
  /** Human-readable reason the access is restricted. */
  reason?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly errors: FieldError[] = [],
    readonly retryAfterSeconds?: number,
    readonly requestId?: string,
    readonly code?: string,
    readonly rateLimit?: RateLimitInfo,
    readonly accessDenied?: AccessDeniedDetails
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

  /** True when the action was rejected because the user lacks the required permission. */
  get isAccessDenied(): boolean {
    return this.httpStatus === 403 || this.code === ACCESS_DENIED_CODE;
  }

  /** Transient failures the user can reasonably retry. */
  get isRetryable(): boolean {
    const s = this.httpStatus;
    return s === 0 || s === 408 || s === 425 || s === 429 || s >= 500;
  }

  /** Verification service is temporarily unavailable (gateway/timeout/network). */
  get isServiceUnavailable(): boolean {
    const s = this.httpStatus;
    return s === 0 || s === 502 || s === 503 || s === 504;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Extracts access-denied details from a response body (`details` or top-level fields). */
export function parseAccessDenied(body: unknown): AccessDeniedDetails | undefined {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const details = (b.details && typeof b.details === "object" ? b.details : {}) as Record<string, unknown>;

  const info: AccessDeniedDetails = {
    requiredPermission: stringValue(details.requiredPermission ?? b.requiredPermission),
    requiredScope: stringValue(details.requiredScope ?? b.requiredScope),
    reason: stringValue(details.reason ?? b.reason),
  };

  return Object.values(info).some((v) => v !== undefined) ? info : undefined;
}

/** Type guard for access-denied errors, so the UI can trigger the request-access flow. */
export function isAccessDeniedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.isAccessDenied;
}

const NETWORK_MESSAGE = "Could not reach the server. Check your connection and try again.";

const SERVICE_UNAVAILABLE_MESSAGE =
  "The verification service is temporarily unavailable. Please try again in a moment.";

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

  if (res.status === 403) {
    const accessDenied = parseAccessDenied(body);
    return new ApiError(
      serverMessage ?? "You don't have permission to perform this action.",
      403,
      Array.isArray(b.errors) ? (b.errors as FieldError[]) : [],
      positiveNumber(res.headers.get("Retry-After")),
      requestId,
      code ?? ACCESS_DENIED_CODE,
      undefined,
      accessDenied
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
  /** Set when the failure is a permission problem; the UI should offer "Request access". */
  accessDenied?: AccessDeniedDetails;
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
    if (error.isServiceUnavailable) {
      return {
        title: "Verification service is temporarily unavailable",
        message: error.message || SERVICE_UNAVAILABLE_MESSAGE,
        retryable: true,
        retryAfterSeconds: error.retryAfterSeconds,
        requestId: error.requestId,
    if (error.isAccessDenied) {
      const permission = error.accessDenied?.requiredPermission ?? error.accessDenied?.requiredScope;
      return {
        title: "Access restricted",
        message:
          error.message ||
          (permission
            ? `This action requires the "${permission}" permission. You can request access from the verification team.`
            : "You don't have permission to perform this action. You can request access from the verification team."),
        retryable: false,
        requestId: error.requestId,
        accessDenied: error.accessDenied,
      };
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
