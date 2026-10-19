import { NextRequest, NextResponse } from "next/server";

import { auditLogger } from "@/lib/security/auditLogger";
import { validateVerificationRequest } from "@/lib/security/inputValidation";
import { buildRateLimitErrorBody, buildRateLimitHeaders, evaluateRateLimit } from "@/lib/security/rateLimiter";
import { logOperationalEvent, requestIdFrom } from "@/lib/server/observability";

function resolveAddressForRateLimit(bodyAddress: string | undefined, request: NextRequest): string {
  if (bodyAddress && bodyAddress.trim()) return bodyAddress.trim();

  const headerAddress = request.headers.get("x-wallet-address");
  if (headerAddress && headerAddress.trim()) return headerAddress.trim();

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]!.trim();
  }

  return "anonymous";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    const fallbackIdentity = resolveAddressForRateLimit(undefined, request);
    const fallbackLimit = evaluateRateLimit(fallbackIdentity);
    const fallbackHeaders = buildRateLimitHeaders(fallbackLimit);

    if (!fallbackLimit.allowed) {
      await auditLogger.logEvent({
        actor: fallbackIdentity,
        category: "system",
        action: "verification request blocked",
        severity: "warning",
        details: "Malformed JSON payload triggered rate-limit enforcement",
      });
      logOperationalEvent("warn", "verification_request.rate_limited", {
        requestId,
        route: "POST /api/verification",
        operation: "parse_verification_request",
        status: 429,
        reason: "malformed_json_rate_limited",
        actor: fallbackIdentity,
        details: {
          retryAfterSeconds: fallbackLimit.retryAfterSeconds,
          violations: fallbackLimit.violations,
        },
      });
      return NextResponse.json(
        buildRateLimitErrorBody(fallbackLimit, { action: "verification requests", requestId }),
        { status: 429, headers: fallbackHeaders }
      );
    }

    logOperationalEvent("warn", "verification_request.rejected", {
      requestId,
      route: "POST /api/verification",
      operation: "parse_verification_request",
      status: 400,
      reason: "malformed_json",
      actor: fallbackIdentity,
    });
    return NextResponse.json(
      {
        success: false,
        error: "Malformed JSON payload.",
      },
      { status: 400, headers: fallbackHeaders }
    );
  }

  const candidateAddress =
    payload && typeof payload === "object" && "address" in payload
      ? String((payload as Record<string, unknown>).address ?? "")
      : undefined;

  const rateLimitKey = resolveAddressForRateLimit(candidateAddress, request);
  const limit = evaluateRateLimit(rateLimitKey);
  const rateLimitHeaders = buildRateLimitHeaders(limit);

  if (!limit.allowed) {
    await auditLogger.logEvent({
      actor: rateLimitKey,
      category: "system",
      action: "verification request blocked",
      severity: "warning",
      details: "Rate limit exceeded for verification request",
    });
    logOperationalEvent("warn", "verification_request.rate_limited", {
      requestId,
      route: "POST /api/verification",
      operation: "evaluate_rate_limit",
      status: 429,
      reason: "rate_limit_exceeded",
      actor: rateLimitKey,
      details: {
        retryAfterSeconds: limit.retryAfterSeconds,
        violations: limit.violations,
        blockedUntil: limit.blockedUntil,
      },
    });
    return NextResponse.json(
      buildRateLimitErrorBody(limit, { action: "verification requests", requestId }),
      { status: 429, headers: rateLimitHeaders }
    );
  }

  const validation = validateVerificationRequest(payload);
  if (!validation.valid || !validation.sanitized) {
    await auditLogger.logEvent({
      actor: rateLimitKey,
      category: "system",
      action: "verification request rejected",
      severity: "warning",
      details: validation.errors.join(", "),
    });
    logOperationalEvent("warn", "verification_request.rejected", {
      requestId,
      route: "POST /api/verification",
      operation: "validate_verification_request",
      status: 400,
      reason: "validation_error",
      actor: rateLimitKey,
      details: {
        errors: validation.errors,
      },
    });
    return NextResponse.json(
      {
        success: false,
        error: "Request validation failed.",
        details: validation.errors,
      },
      { status: 400, headers: rateLimitHeaders }
    );
  }

  logOperationalEvent("info", "verification_request.accepted", {
    requestId,
    route: "POST /api/verification",
    operation: "accept_verification_request",
    status: 202,
    actor: rateLimitKey,
  });
  return NextResponse.json(
    {
      success: true,
      data: {
        accepted: true,
        message: "Verification request accepted for processing.",
        request: validation.sanitized,
      },
    },
    { status: 202, headers: rateLimitHeaders }
  );
}
