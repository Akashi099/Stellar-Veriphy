import type {
  AccessPermissionState,
  AccessRequest,
  AccessRequestCreate,
  FieldError,
  UploadMetadata,
  UploadRecord,
  UploadSessionStart,
  UploadSessionUpdate,
  UploadSessionView,
  VerificationJobView,
} from "@stellarveriphy/shared";
import { resolveApiEndpoint } from "@/config";
import { ApiError, apiErrorFromResponse, createRequestId, networkError } from "@/lib/apiErrors";
import { logger } from "@/lib/logger";

export { ApiError };

/**
 * Correlation identifiers captured from API responses. These are safe to show
 * to support staff: they never contain request bodies or auth headers.
 */
export interface SupportDiagnostics {
  method: string;
  path: string;
  status: number;
  timestamp: string;
  requestId: string | null;
  message: string;
}

/**
 * Builds a privacy-safe diagnostics payload for the support flow. Only
 * correlation metadata is included — never request bodies, headers or tokens.
 */
export function buildSupportDiagnostics(error: unknown): SupportDiagnostics {
  if (error instanceof ApiError) {
    return {
      method: error.method ?? "GET",
      path: error.path ?? "",
      status: error.status,
      timestamp: error.timestamp ?? new Date().toISOString(),
      requestId: error.requestId ?? null,
      message: error.message,
    };
  }
  return {
    method: "GET",
    path: "",
    status: 0,
    timestamp: new Date().toISOString(),
    requestId: null,
    message: error instanceof Error ? error.message : "Unknown error",
  };
}

/**
 * Reads the server-provided correlation ID from a response, preferring the
 * canonical `x-request-id` header and falling back to `request-id`.
 */
function responseRequestId(res: Response | null): string | null {
  if (!res) return null;
  return res.headers.get("x-request-id") ?? res.headers.get("request-id");
}

/**
 * Statuses that indicate the verification service is temporarily unavailable
 * (as opposed to a validation error or a permanent failure).
 */
const VERIFICATION_UNAVAILABLE_STATUSES = new Set([0, 502, 503, 504]);

/**
 * Returns true when an error represents a temporary verification-service outage
 * (network failure or 502/503/504). Screens can use this to render a fallback
 * panel with retry/recovery actions instead of a spinner or broken state.
 */
export function isVerificationUnavailable(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false;
  return VERIFICATION_UNAVAILABLE_STATUSES.has(error.status);
}

export interface RetryUpdate {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  reason: string;
}

interface RequestOptions extends RequestInit {
  retry?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (update: RetryUpdate) => void;
  };
  /**
   * Opt out of in-flight request deduplication. Mutations are never deduplicated
   * regardless of this flag; it only affects idempotent reads (GET/HEAD).
   */
  dedupe?: boolean;
  traceContext?: { traceId: string; spanId?: string };
}

/**
 * Standard placeholder state returned when a media thumbnail cannot be loaded
 * from either the primary or the fallback source.
 */
export const MEDIA_PLACEHOLDER_SRC = "/media/placeholder.svg";

/**
 * Origins permitted to serve media thumbnails. Anything else is rejected so
 * that fallback resolution cannot be used to leak requests to arbitrary hosts.
 */
const ALLOWED_MEDIA_ORIGINS = new Set<string>([
  "https://media.stellarveriphy.app",
  "https://cdn.stellarveriphy.app",
]);

/**
 * Paths that must never be proxied through the media fallback (private or
 * authenticated resources). Privacy restrictions remain enforced.
 */
const PRIVATE_MEDIA_PATH_PREFIXES = ["/api/", "/private/", "/access-requests/"];

function isAllowedMediaUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw, typeof window !== "undefined" ? window.location.origin : "https://stellarveriphy.app");
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (!ALLOWED_MEDIA_ORIGINS.has(parsed.origin)) return false;
  if (PRIVATE_MEDIA_PATH_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix))) return false;
  return true;
}

export interface MediaFallbackResult {
  src: string;
  usedFallback: boolean;
  failed: boolean;
}

/**
 * Resolves a thumbnail through the primary source and, on failure, retries at
 * most once through the fallback source. Both sources must pass origin and
 * privacy checks; otherwise the standard placeholder is returned.
 */
export async function resolveMediaThumbnail(
  primarySrc: string,
  fallbackSrc: string | undefined,
  load: (src: string) => Promise<boolean> = defaultMediaLoader
): Promise<MediaFallbackResult> {
  if (isAllowedMediaUrl(primarySrc)) {
    try {
      if (await load(primarySrc)) return { src: primarySrc, usedFallback: false, failed: false };
    } catch {
      // fall through to the single fallback attempt
    }
  }
  if (fallbackSrc && isAllowedMediaUrl(fallbackSrc)) {
    try {
      if (await load(fallbackSrc)) return { src: fallbackSrc, usedFallback: true, failed: false };
    } catch {
      // fall through to placeholder
    }
  }
  return { src: MEDIA_PLACEHOLDER_SRC, usedFallback: false, failed: true };
}

function defaultMediaLoader(src: string): Promise<boolean> {
  if (typeof Image === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

/**
 * In-flight read requests keyed by method + URL + auth-relevant headers.
 * Only idempotent reads are stored here; mutations bypass deduplication.
 */
const inFlightReads = new Map<string, Promise<unknown>>();

function isIdempotentRead(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized === "GET" || normalized === "HEAD";
}

function dedupeKey(url: string, method: string, headers: Headers): string {
  const auth = headers.get("Authorization") ?? "";
  return `${method.toUpperCase()} ${url} ${auth}`;
}

/** Clears the in-flight read cache. Exposed for deterministic tests. */
export function clearInFlightRequests(): void {
  inFlightReads.clear();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number): boolean {
  return status === 0 || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  const jitter = Math.round(exponential * (0.75 + Math.random() * 0.5));
  return Math.min(maxDelayMs, jitter);
}

async function request<T>(pathOrUrl: string, init?: RequestOptions): Promise<T> {
  const url = resolveApiEndpoint(pathOrUrl);
  const retry = init?.retry;
  const maxAttempts = retry?.maxAttempts ?? 1;
  const baseDelayMs = retry?.baseDelayMs ?? 600;
  const maxDelayMs = retry?.maxDelayMs ?? 6000;
  const { retry: _retry, dedupe, traceContext, ...fetchInit } = init ?? {};

  const method = (fetchInit.method ?? "GET").toUpperCase();
  const dedupeEnabled = dedupe !== false && isIdempotentRead(method);
  if (dedupeEnabled) {
    const key = dedupeKey(url, method, new Headers(fetchInit.headers));
    const existing = inFlightReads.get(key);
    if (existing) return existing as Promise<T>;
    const pending = performRequest<T>(url, fetchInit, retry, maxAttempts, baseDelayMs, maxDelayMs, traceContext);
    inFlightReads.set(key, pending);
    try {
      return await pending;
    } finally {
      inFlightReads.delete(key);
    }
  }

  return performRequest<T>(url, fetchInit, retry, maxAttempts, baseDelayMs, maxDelayMs, traceContext);
}

async function performRequest<T>(
  url: string,
  fetchInit: RequestInit,
  retry: RequestOptions["retry"],
  maxAttempts: number,
  baseDelayMs: number,
  maxDelayMs: number,
  traceContext?: RequestOptions["traceContext"],
): Promise<T> {
  let lastError: ApiError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Sent so client logs and server logs share the same ID (see docs/api/request-ids.md).
    const requestId = createRequestId();
    const headers = new Headers(fetchInit.headers);
    headers.set("X-Request-Id", requestId);
    if (traceContext) {
      headers.set("X-Trace-Id", traceContext.traceId);
      if (traceContext.spanId) headers.set("X-Span-Id", traceContext.spanId);
    }

    let res: Response | null = null;
    try {
      res = await fetch(url, { ...fetchInit, headers });
    } catch {
      res = null;
    }

    const status = res?.status ?? 0;
    const body = res ? await res.json().catch(() => null) : null;
    if (res?.ok) return body.data as T;

    // Prefer the server-provided correlation ID so client and server logs agree.
    const correlationId = responseRequestId(res) ?? requestId;
    lastError = res ? apiErrorFromResponse(res, body) : networkError(requestId);
    lastError.requestId = correlationId;
    lastError.method = (fetchInit.method ?? "GET").toUpperCase();
    lastError.path = pathOrUrl;
    lastError.timestamp = new Date().toISOString();
    const retryAfter = Number(res?.headers.get("Retry-After") ?? body?.retryAfterSeconds);
    const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
    const rateLimitMessage =
      status === 429 && retryAfterSeconds
        ? `Too many requests. Please wait ${retryAfterSeconds} seconds before trying again.`
        : undefined;
    const unavailableMessage = VERIFICATION_UNAVAILABLE_STATUSES.has(status)
      ? status === 0
        ? "Could not reach the verification service. Check your connection and try again."
        : "The verification service is temporarily unavailable. Please try again in a moment."
      : undefined;
    lastError = new ApiError(
      rateLimitMessage ??
        unavailableMessage ??
        body?.message ??
        body?.error ??
        (status === 0 ? "Could not reach the server. Check your connection and try again." : `Request failed (${status}).`),
      status,
      body?.errors ?? [],
      retryAfterSeconds
    );

    if (attempt >= maxAttempts || !shouldRetry(status)) {
      // Structured log with correlation metadata only — never bodies or headers.
      logger.error("API request failed", {
        component: "api",
        operation: lastError.method,
        path: lastError.path,
        status,
        requestId: lastError.requestId,
        attempts: attempt,
      });
      throw lastError;
    }

    // Honour the server's Retry-After instead of hammering a rate-limited endpoint.
    const backoffMs = retryDelay(attempt, baseDelayMs, maxDelayMs);
    const delayMs = lastError.retryAfterSeconds ? Math.max(backoffMs, lastError.retryAfterSeconds * 1000) : backoffMs;
    retry?.onRetry?.({
      attempt,
      maxAttempts,
      delayMs,
      reason: status === 0 ? "network unavailable" : status === 429 ? "rate limited" : `HTTP ${status}`,
    });
    logger.warn("Transient API request failure; retrying", {
      component: "api",
      operation: lastError.method,
      path: lastError.path,
      attempt,
      nextAttempt: attempt + 1,
      maxAttempts,
      delayMs,
      status,
      requestId: lastError.requestId,
    });
    await wait(delayMs);
  }

  throw lastError ?? new ApiError("Request failed.", 0);
}

function postJson<T>(
  url: string,
  payload: unknown,
  options?: Pick<RequestOptions, "retry" | "traceContext">,
  method: "POST" | "PATCH" = "POST"
): Promise<T> {
  return request<T>(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(options?.traceContext ? { "X-Trace-Id": options.traceContext.traceId } : {}),
      ...(options?.traceContext?.spanId ? { "X-Span-Id": options.traceContext.spanId } : {}),
    },
    body: JSON.stringify(payload),
    retry: options?.retry,
    // Mutations must never be deduplicated.
    dedupe: false,
  });
}

export const api = {
  createUpload: (metadata: UploadMetadata, options?: Pick<RequestOptions, "retry" | "traceContext">) =>
    postJson<UploadRecord>("/api/uploads", metadata, options),
  findUploadsByHash: (contentHash: string) =>
    request<UploadRecord[]>(`/api/uploads?contentHash=${encodeURIComponent(contentHash)}&pageSize=100`),
  getUpload: (id: string) => request<UploadRecord>(`/api/uploads/${encodeURIComponent(id)}`),
  createJob: (uploadId: string, options?: Pick<RequestOptions, "retry">) =>
    postJson<VerificationJobView>("/api/jobs", { uploadId }, options),
  getJobs: (ids: string[]) =>
    request<VerificationJobView[]>(`/api/jobs?ids=${ids.map(encodeURIComponent).join(",")}`),
  startUploadSession: (
    start: Omit<UploadSessionStart, "chunkSize"> & { chunkSize?: number },
    options?: Pick<RequestOptions, "retry" | "traceContext">,
  ) =>
    postJson<UploadSessionView>("/api/uploads/sessions", start, options),
  getUploadSession: (id: string) => request<UploadSessionView>(`/api/uploads/sessions/${encodeURIComponent(id)}`),
  updateUploadSession: (
    id: string,
    update: UploadSessionUpdate,
    options?: Pick<RequestOptions, "retry" | "traceContext">,
  ) =>
    postJson<UploadSessionView>(`/api/uploads/sessions/${encodeURIComponent(id)}`, update, options, "PATCH"),
  getAccessState: () => request<AccessPermissionState>("/api/access-requests/me"),
  createAccessRequest: (payload: AccessRequestCreate, options?: Pick<RequestOptions, "retry">) =>
    postJson<AccessRequest>("/api/access-requests", payload, options),
};
