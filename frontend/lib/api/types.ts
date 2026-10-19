// Wire types shared by route handlers and browser code. Keep this file free of
// server-only imports so client components can depend on it.

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "INVALID_JSON"
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "SESSION_INVALID"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "SESSION_REFRESH_SUPERSEDED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNSUPPORTED_API_VERSION"
  | "BULK_UPDATE_REJECTED"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "UPSTREAM_TIMEOUT"
  | "INTERNAL_ERROR";

export type FieldErrorCode =
  | "required"
  | "invalid_type"
  | "too_short"
  | "too_long"
  | "invalid_format"
  | "must_accept"
  | "unknown_field";

export interface FieldError {
  field: string;
  code: FieldErrorCode;
  message: string;
}

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  // True when the same request may succeed if sent again later.
  retryable: boolean;
  retryAfterSeconds?: number;
  requestId: string;
  details?: {
    fields?: FieldError[];
    [key: string]: unknown;
  };
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}

export interface ApiSuccessEnvelope<T> {
  data: T;
}
