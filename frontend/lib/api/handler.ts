import { NextResponse, type NextRequest } from "next/server";
import { ApiError, errorResponse } from "./errors";
import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id";
import type { ApiSuccessEnvelope } from "./types";
import { versionHeaders, type ApiVersion } from "./versioning";

export interface ApiContext<P> {
  requestId: string;
  version: ApiVersion;
  params: P;
}

type NextRouteContext<P> = { params: Promise<P> };

type ApiHandler<P> = (req: NextRequest, ctx: ApiContext<P>) => Promise<Response>;

// Wraps a route handler so every response, success or failure, carries the
// request id and version headers, and every thrown value is serialized into
// the standard error envelope.
export function defineRoute<P = Record<string, never>>(version: ApiVersion, handler: ApiHandler<P>) {
  return async (req: NextRequest, routeContext: NextRouteContext<P>): Promise<Response> => {
    const requestId = resolveRequestId(req.headers);
    const headers = { ...versionHeaders(version), [REQUEST_ID_HEADER]: requestId };

    try {
      const params = (await routeContext?.params) ?? ({} as P);
      const response = await handler(req, { requestId, version, params });
      for (const [name, value] of Object.entries(headers)) {
        if (!response.headers.has(name)) response.headers.set(name, value);
      }
      return response;
    } catch (error) {
      return errorResponse(error, requestId, headers);
    }
  };
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccessEnvelope<T>> {
  return NextResponse.json({ data }, init);
}

export async function readJsonBody(req: NextRequest): Promise<unknown> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError("BAD_REQUEST", { message: "Content-Type must be application/json." });
  }
  try {
    return await req.json();
  } catch {
    throw new ApiError("INVALID_JSON");
  }
}

export function requireObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", { message: "Request body must be a JSON object." });
  }
  return body as Record<string, unknown>;
}
