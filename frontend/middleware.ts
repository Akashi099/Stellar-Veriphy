import { NextRequest, NextResponse } from "next/server";

/**
 * Request correlation (#765).
 *
 * Every API request gets a request ID. A well-formed `X-Request-Id` (or
 * `X-Correlation-Id`) sent by the client is reused so client and server events
 * can be matched; otherwise a new one is generated. The ID is forwarded to the
 * route handler (where `requestIdFrom()` picks it up for structured logs) and
 * echoed back on the response as `X-Request-Id`.
 */

const REQUEST_ID_HEADER = "x-request-id";
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

function resolveRequestId(req: NextRequest): string {
  const incoming = req.headers.get(REQUEST_ID_HEADER) ?? req.headers.get("x-correlation-id");
  if (incoming && VALID_REQUEST_ID.test(incoming)) return incoming;
  return `req_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function middleware(req: NextRequest) {
  const requestId = resolveRequestId(req);

  const headers = new Headers(req.headers);
  headers.set(REQUEST_ID_HEADER, requestId);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("X-Request-Id", requestId);
  return res;
import { NextResponse, type NextRequest } from "next/server";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/api/request-id";
import {
  API_VERSION_HEADER,
  DEFAULT_API_VERSION,
  UNVERSIONED_API_PATHS,
  isSupportedVersion,
  parseApiVersion,
  supportedVersionsDetail,
  versionFromPath,
} from "@/lib/api/versioning";

// Routes unversioned /api/* requests to the version requested via header (or
// the default), and rejects unknown versions with the standard error shape.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (UNVERSIONED_API_PATHS.has(pathname)) return NextResponse.next();

  const requestId = resolveRequestId(req.headers);
  const fromPath = versionFromPath(pathname);

  if (fromPath) {
    if (isSupportedVersion(fromPath.raw)) return NextResponse.next();
    return unsupportedVersion(fromPath.raw, requestId);
  }

  const headerValue = req.headers.get(API_VERSION_HEADER);
  const version = headerValue ? parseApiVersion(headerValue) : DEFAULT_API_VERSION;
  if (!version) return unsupportedVersion(headerValue ?? "", requestId);

  const url = req.nextUrl.clone();
  url.pathname = `/api/v${version}${pathname.slice("/api".length)}`;
  return NextResponse.rewrite(url);
}

function unsupportedVersion(requested: string, requestId: string) {
  const error = new ApiError("UNSUPPORTED_API_VERSION", {
    details: { requestedVersion: requested.slice(0, 32), ...supportedVersionsDetail() },
  });
  return errorResponse(error, requestId, { [REQUEST_ID_HEADER]: requestId });
}

export const config = {
  matcher: "/api/:path*",
};
