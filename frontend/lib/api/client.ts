import type { ApiErrorBody, ApiErrorCode, ApiErrorEnvelope, ApiSuccessEnvelope, FieldError } from "./types";
import { API_VERSION_HEADER, LATEST_API_VERSION, type ApiVersion } from "./versioning";

export type ClientErrorCode = ApiErrorCode | "NETWORK_ERROR" | "INVALID_RESPONSE";

export class ApiClientError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly requestId?: string;
  readonly details?: ApiErrorBody["details"];

  constructor(init: {
    code: ClientErrorCode;
    message: string;
    status: number;
    retryable: boolean;
    retryAfterMs?: number;
    requestId?: string;
    details?: ApiErrorBody["details"];
    cause?: unknown;
  }) {
    super(init.message, { cause: init.cause });
    this.name = "ApiClientError";
    this.code = init.code;
    this.status = init.status;
    this.retryable = init.retryable;
    this.retryAfterMs = init.retryAfterMs;
    this.requestId = init.requestId;
    this.details = init.details;
  }

  // Non-retryable failures need a human: fix the input, sign in, or report it.
  get shouldAlertUser(): boolean {
    return !this.retryable;
  }

  get fieldErrors(): FieldError[] {
    return this.details?.fields ?? [];
  }
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  const error = (value as ApiErrorEnvelope | null)?.error;
  return !!error && typeof error.code === "string" && typeof error.message === "string";
}

function parseRetryAfter(header: string | null, bodySeconds?: number): number | undefined {
  if (bodySeconds !== undefined) return bodySeconds * 1000;
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

// Used when the body isn't our envelope, e.g. an HTML page from a proxy.
function fallbackError(response: Response): ApiClientError {
  const retryable = response.status === 408 || response.status === 429 || response.status >= 502;
  return new ApiClientError({
    code: retryable ? "SERVICE_UNAVAILABLE" : response.status >= 500 ? "INTERNAL_ERROR" : "INVALID_RESPONSE",
    message: retryable
      ? "The service is temporarily unavailable. Please try again."
      : "Something went wrong. Please try again later.",
    status: response.status,
    retryable,
    retryAfterMs: parseRetryAfter(response.headers.get("Retry-After")),
    requestId: response.headers.get("X-Request-Id") ?? undefined,
  });
}

export async function toClientError(response: Response): Promise<ApiClientError> {
  const body = await response.json().catch(() => null);
  if (!isErrorEnvelope(body)) return fallbackError(response);
  const { error } = body;
  return new ApiClientError({
    code: error.code,
    message: error.message,
    status: response.status,
    retryable: error.retryable,
    retryAfterMs: parseRetryAfter(response.headers.get("Retry-After"), error.retryAfterSeconds),
    requestId: error.requestId,
    details: error.details,
  });
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  version?: ApiVersion;
  // Extra attempts for retryable failures. Only honoured for idempotent methods.
  retries?: number;
}

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, version = LATEST_API_VERSION, retries = 0, headers, ...init } = options;
  const method = (init.method ?? "GET").toUpperCase();
  const maxAttempts = IDEMPOTENT_METHODS.has(method) ? retries + 1 : 1;

  const requestHeaders = new Headers(headers);
  requestHeaders.set(API_VERSION_HEADER, version);
  if (body !== undefined) requestHeaders.set("Content-Type", "application/json");

  for (let attempt = 1; ; attempt++) {
    let response: Response | undefined;
    let networkError: ApiClientError | undefined;
    try {
      response = await fetch(path, {
        ...init,
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      if ((cause as Error)?.name === "AbortError") throw cause;
      networkError = new ApiClientError({
        code: "NETWORK_ERROR",
        message: "Unable to reach the server. Check your connection and try again.",
        status: 0,
        retryable: true,
        cause,
      });
    }

    if (response?.ok) {
      const envelope = (await response.json().catch(() => null)) as ApiSuccessEnvelope<T> | null;
      if (envelope && "data" in envelope) return envelope.data;
      throw new ApiClientError({
        code: "INVALID_RESPONSE",
        message: "Received an unexpected response from the server.",
        status: response.status,
        retryable: false,
        requestId: response.headers.get("X-Request-Id") ?? undefined,
      });
    }
    const error = response ? await toClientError(response) : networkError!;

    if (!error.retryable || attempt >= maxAttempts) throw error;
    const backoff = error.retryAfterMs ?? Math.min(250 * 2 ** (attempt - 1), 4000);
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }
}
