import { NextResponse } from "next/server";
import type { ApiErrorBody, ApiErrorCode, ApiErrorEnvelope, FieldError } from "./types";

interface ErrorDefinition {
  status: number;
  retryable: boolean;
  message: string;
}

// Single source of truth for status codes, retry semantics and the public
// message used when a thrower doesn't supply one.
export const ERROR_DEFINITIONS: Record<ApiErrorCode, ErrorDefinition> = {
  BAD_REQUEST: { status: 400, retryable: false, message: "The request could not be processed." },
  INVALID_JSON: { status: 400, retryable: false, message: "Request body must be valid JSON." },
  VALIDATION_FAILED: { status: 422, retryable: false, message: "One or more fields are invalid." },
  UNAUTHENTICATED: { status: 401, retryable: false, message: "Authentication is required." },
  SESSION_INVALID: { status: 401, retryable: false, message: "The session token is not recognised. Sign in again." },
  SESSION_EXPIRED: { status: 401, retryable: false, message: "Your session has expired. Sign in again." },
  SESSION_REVOKED: { status: 401, retryable: false, message: "This session was signed out. Sign in again." },
  // Another tab or request already rotated this refresh token moments ago; the
  // client should pick up the newer tokens instead of signing the user out.
  SESSION_REFRESH_SUPERSEDED: { status: 409, retryable: true, message: "This session was just refreshed elsewhere. Retry with the latest tokens." },
  FORBIDDEN: { status: 403, retryable: false, message: "You do not have permission to perform this action." },
  NOT_FOUND: { status: 404, retryable: false, message: "The requested resource was not found." },
  CONFLICT: { status: 409, retryable: false, message: "The request conflicts with the current state of the resource." },
  UNSUPPORTED_API_VERSION: { status: 400, retryable: false, message: "The requested API version is not supported." },
  BULK_UPDATE_REJECTED: { status: 422, retryable: false, message: "No records were updated because at least one update was rejected." },
  RATE_LIMITED: { status: 429, retryable: true, message: "Too many requests. Please try again shortly." },
  SERVICE_UNAVAILABLE: { status: 503, retryable: true, message: "The service is temporarily unavailable. Please try again." },
  UPSTREAM_TIMEOUT: { status: 504, retryable: true, message: "The request timed out. Please try again." },
  // Unknown failures are not marked retryable: we can't know the request was
  // idempotent or that the fault is transient, so the client should surface it.
  INTERNAL_ERROR: { status: 500, retryable: false, message: "An unexpected error occurred. Please contact support if it persists." },
};

export interface ApiErrorOptions {
  message?: string;
  details?: ApiErrorBody["details"];
  retryAfterSeconds?: number;
  cause?: unknown;
}

// Throw this from route code for any failure the client should see. Its
// message and details are public; never put secrets or internals in them.
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: ApiErrorBody["details"];
  readonly retryAfterSeconds?: number;

  constructor(code: ApiErrorCode, options: ApiErrorOptions = {}) {
    const definition = ERROR_DEFINITIONS[code];
    super(options.message ?? definition.message, { cause: options.cause });
    this.name = "ApiError";
    this.code = code;
    this.status = definition.status;
    this.retryable = definition.retryable;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  static validation(fields: FieldError[]): ApiError {
    return new ApiError("VALIDATION_FAILED", { details: { fields } });
  }
}

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
]);

// Maps anything thrown into a public ApiError. Non-ApiError messages are
// discarded so stack traces, queries and hostnames never reach the client.
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return new ApiError("UPSTREAM_TIMEOUT", { cause: error });
    }
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && TRANSIENT_NETWORK_CODES.has(code)) {
      return new ApiError(code.includes("TIMEDOUT") ? "UPSTREAM_TIMEOUT" : "SERVICE_UNAVAILABLE", { cause: error });
    }
  }

  return new ApiError("INTERNAL_ERROR", { cause: error });
}

export function serializeError(error: ApiError, requestId: string): ApiErrorEnvelope {
  const body: ApiErrorBody = {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    requestId,
  };
  if (error.retryAfterSeconds !== undefined) body.retryAfterSeconds = error.retryAfterSeconds;
  if (error.details !== undefined) body.details = error.details;
  return { error: body };
}

function logError(apiError: ApiError, original: unknown, requestId: string) {
  const source = apiError.cause ?? original;
  const entry = {
    level: apiError.status >= 500 ? "error" : "warn",
    requestId,
    code: apiError.code,
    status: apiError.status,
    errorName: source instanceof Error ? source.name : typeof source,
    errorMessage: source instanceof Error ? source.message : String(source),
    stack: source instanceof Error ? source.stack : undefined,
  };
  if (apiError.status >= 500) console.error("[api]", JSON.stringify(entry));
  else console.warn("[api]", JSON.stringify(entry));
}

export function errorResponse(error: unknown, requestId: string, headers?: HeadersInit): NextResponse {
  const apiError = toApiError(error);
  // Expected client errors are noisy; only log unexpected and 5xx failures in full.
  if (!(error instanceof ApiError) || apiError.status >= 500) {
    logError(apiError, error, requestId);
  }

  const response = NextResponse.json(serializeError(apiError, requestId), {
    status: apiError.status,
    headers,
  });
  response.headers.set("Cache-Control", "no-store");
  if (apiError.retryAfterSeconds !== undefined) {
    response.headers.set("Retry-After", String(apiError.retryAfterSeconds));
  }
  return response;
}
