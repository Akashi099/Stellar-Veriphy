import { NextResponse } from "next/server";
import {
  parsePaginationParams,
  type FieldError,
  type PaginationMeta,
  type PaginationParams,
  type ValidationResult,
} from "@stellarveriphy/shared";
import { logOperationalEvent } from "./observability";

export type ApiStatus =
  | "ok"
  | "created"
  | "exists"
  | "queued"
  | "invalid_json"
  | "unsupported_media_type"
  | "validation_error"
  | "not_found"
  | "rate_limited"
  | "conflict"
  | "expired"
  | "server_error";

export interface ApiBody<T> {
  status: ApiStatus;
  message?: string;
  errors?: FieldError[];
  data?: T;
  requestId?: string;
  pagination?: PaginationMeta;
}

export function respond<T>(httpStatus: number, body: ApiBody<T>) {
  return NextResponse.json(body, { status: httpStatus });
}

// Parses a JSON request body, or returns the error response to send.
export async function readJson(req: Request): Promise<{ body: unknown } | { response: NextResponse }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return {
      response: respond(415, { status: "unsupported_media_type", message: "Send the request body as application/json." }),
    };
  }
  try {
    return { body: await req.json() };
  } catch {
    return { response: respond(400, { status: "invalid_json", message: "The request body is not valid JSON." }) };
  }
}

export function serverError(context: string, err: unknown, requestId?: string) {
// The one response shape for invalid input, used by every route (422 + field errors).
export function validationError(errors: FieldError[], message = "The request is invalid. See `errors` for details.") {
  return respond(422, { status: "validation_error", message, errors });
}

// Parses a JSON body and runs a shared validator on it, or returns the error response to send.
export async function readValidated<T>(
  req: Request,
  validate: (body: unknown) => ValidationResult<T>,
): Promise<{ value: T } | { response: NextResponse }> {
  const parsed = await readJson(req);
  if ("response" in parsed) return parsed;
  const result = validate(parsed.body);
  if (!result.ok) return { response: validationError(result.errors) };
  return { value: result.value };
}

// Reads page/pageSize/cursor query parameters, or returns the error response to send.
export function readPagination(
  req: Request,
  options?: { defaultPageSize?: number; maxPageSize?: number },
): { value: PaginationParams } | { response: NextResponse } {
  const result = parsePaginationParams(new URL(req.url).searchParams, options);
  if (!result.ok) return { response: validationError(result.errors, "Pagination parameters are invalid.") };
  return { value: result.value };
}

export function serverError(context: string, err: unknown) {
  logOperationalEvent("error", "api.server_error", {
    requestId,
    route: context,
    operation: "request",
    status: 500,
    error: err,
  });
  return respond(500, {
    status: "server_error",
    message: requestId
      ? `Something went wrong on our side. Please try again. If it keeps happening, contact support with reference ${requestId}.`
      : "Something went wrong on our side. Please try again.",
    requestId,
  });
}

// Validation error in the legacy `{ success, error }` envelope used by older
// routes. Same field errors as `validationError`, so clients can handle both.
export function legacyValidationError(errors: FieldError[], httpStatus = 400) {
  return NextResponse.json<{ success: false; error: string; errors: FieldError[] }>(
    {
      success: false,
      error: errors.map((e) => `${e.field}: ${e.message}`).join(" "),
      errors,
    },
    { status: httpStatus },
  );
}
