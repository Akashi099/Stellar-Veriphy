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
import { getSessionActor, type SessionActor } from "@/lib/auth/session";

/**
 * Request correlation (#765).
 *
 * Every API request gets a request ID. A well-formed `X-Request-Id` (or
 * `X-Correlation-Id`) sent by the client is reused so client and server events
 * can be matched; otherwise a new one is generated. The ID is forwarded to the
 * route handler (where `requestIdFrom()` picks it up for structured logs) and
 * echoed back on the response as `X-Request-Id`.
 *
 * Admin route guards (#852): sensitive admin screens and admin API routes are
 * protected here so that access is denied consistently before any handler or
 * page runs. Anonymous users are redirected to login (pages) or receive a JSON
 * 401 (API); authenticated non-admin users are redirected to the unauthorized
 * page (pages) or receive a JSON 403 (API).
 */

const LOGIN_PATH = "/login";
const UNAUTHORIZED_PATH = "/unauthorized";

// Page routes that require an authenticated admin actor.
const PROTECTED_PAGE_PREFIXES = ["/dashboard", "/settings", "/admin"];

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAdminApi(pathname: string): boolean {
  return pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

function isAdminActor(actor: SessionActor | null): actor is SessionActor {
  return actor !== null && actor.role === "admin";
}

function withRequestId(res: NextResponse, requestId: string): NextResponse {
  res.headers.set("X-Request-Id", requestId);
  return res;
}

function redirectTo(req: NextRequest, pathname: string, requestId: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (pathname === LOGIN_PATH) {
    url.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
  }
  return withRequestId(NextResponse.redirect(url), requestId);
}

function forbidden(requestId: string, code: "UNAUTHENTICATED" | "FORBIDDEN"): NextResponse {
  const error = new ApiError(code);
  return errorResponse(error, requestId, { [REQUEST_ID_HEADER]: requestId });
}

// Routes unversioned /api/* requests to the version requested via header (or
// the default), and rejects unknown versions with the standard error shape.
function handleApi(req: NextRequest, requestId: string): NextResponse {
  const { pathname } = req.nextUrl;
  if (UNVERSIONED_API_PATHS.has(pathname)) return NextResponse.next();

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

export async function middleware(req: NextRequest) {
  const requestId = resolveRequestId(req.headers);
  const { pathname } = req.nextUrl;

  const headers = new Headers(req.headers);
  headers.set(REQUEST_ID_HEADER, requestId);

  const needsGuard = isAdminApi(pathname) || isProtectedPage(pathname);
  if (needsGuard) {
    const actor = await getSessionActor(req);
    if (!isAdminActor(actor)) {
      if (isAdminApi(pathname)) {
        return forbidden(requestId, actor ? "FORBIDDEN" : "UNAUTHENTICATED");
      }
      return redirectTo(req, actor ? UNAUTHORIZED_PATH : LOGIN_PATH, requestId);
    }
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    const res = handleApi(req, requestId);
    return withRequestId(res, requestId);
  }

  const res = NextResponse.next({ request: { headers } });
  return withRequestId(res, requestId);
}

function unsupportedVersion(requested: string, requestId: string) {
  const error = new ApiError("UNSUPPORTED_API_VERSION", {
    details: { requestedVersion: requested.slice(0, 32), ...supportedVersionsDetail() },
  });
  return errorResponse(error, requestId, { [REQUEST_ID_HEADER]: requestId });
}

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*", "/settings/:path*", "/admin/:path*"],
};
