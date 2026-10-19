import type { UploadMetadata, UploadRecord, VerificationJobView } from "@stellarveriphy/shared";
import type {
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

export { ApiError };

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
  const { retry: _retry, ...fetchInit } = init ?? {};
  let lastError: ApiError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Sent so client logs and server logs share the same ID (see docs/api/request-ids.md).
    const requestId = createRequestId();
    const headers = new Headers(fetchInit.headers);
    headers.set("X-Request-Id", requestId);

    let res: Response | null = null;
    try {
      res = await fetch(url, { ...fetchInit, headers });
    } catch {
      res = null;
    }

    const status = res?.status ?? 0;
    const body = res ? await res.json().catch(() => null) : null;
    if (res?.ok) return body.data as T;

    lastError = res ? apiErrorFromResponse(res, body) : networkError(requestId);
    const retryAfter = Number(res?.headers.get("Retry-After") ?? body?.retryAfterSeconds);
    const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
    const rateLimitMessage =
      status === 429 && retryAfterSeconds
        ? `Too many requests. Please wait ${retryAfterSeconds} seconds before trying again.`
        : undefined;
    lastError = new ApiError(
      rateLimitMessage ??
        body?.message ??
        body?.error ??
        (status === 0 ? "Could not reach the server. Check your connection and try again." : `Request failed (${status}).`),
      status,
      body?.errors ?? [],
      retryAfterSeconds
    );

    if (attempt >= maxAttempts || !shouldRetry(status)) {
      if (attempt > 1) {
        console.error("API request failed after retry attempts", {
          url,
          attempts: attempt,
          status,
          requestId: lastError.requestId,
          message: lastError.message,
        });
      }
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
    console.warn("Transient API request failure; retrying", {
      url,
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
  options?: Pick<RequestOptions, "retry">,
  method: "POST" | "PATCH" = "POST"
): Promise<T> {
  return request<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    retry: options?.retry,
  });
}

export const api = {
  createUpload: (metadata: UploadMetadata, options?: Pick<RequestOptions, "retry">) =>
    postJson<UploadRecord>("/api/uploads", metadata, options),
  findUploadsByHash: (contentHash: string) =>
    request<UploadRecord[]>(`/api/uploads?contentHash=${encodeURIComponent(contentHash)}&pageSize=100`),
  getUpload: (id: string) => request<UploadRecord>(`/api/uploads/${encodeURIComponent(id)}`),
  createJob: (uploadId: string, options?: Pick<RequestOptions, "retry">) =>
    postJson<VerificationJobView>("/api/jobs", { uploadId }, options),
  getJobs: (ids: string[]) =>
    request<VerificationJobView[]>(`/api/jobs?ids=${ids.map(encodeURIComponent).join(",")}`),
  startUploadSession: (start: Omit<UploadSessionStart, "chunkSize"> & { chunkSize?: number }, options?: Pick<RequestOptions, "retry">) =>
    postJson<UploadSessionView>("/api/uploads/sessions", start, options),
  getUploadSession: (id: string) => request<UploadSessionView>(`/api/uploads/sessions/${encodeURIComponent(id)}`),
  updateUploadSession: (id: string, update: UploadSessionUpdate, options?: Pick<RequestOptions, "retry">) =>
    postJson<UploadSessionView>(`/api/uploads/sessions/${encodeURIComponent(id)}`, update, options, "PATCH"),
};
