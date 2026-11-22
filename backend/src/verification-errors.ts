/** Public contract v1. Never expose provider messages, URLs, stacks, or credentials. */
export const VERIFICATION_ERRORS = {
  INVALID_INPUT: { category: "input", retryable: false, message: "Verification input is invalid.", action: "Check the file and manifest, then submit again." },
  ACCESS_DENIED: { category: "permission", retryable: false, message: "Verification is not permitted.", action: "Request verification access from an administrator." },
  PROVIDER_TIMEOUT: { category: "provider", retryable: true, message: "The provider timed out.", action: "Try again later." },
  PROVIDER_UNAVAILABLE: { category: "provider", retryable: true, message: "The provider is unavailable.", action: "Try again later or contact support." },
  PROVIDER_INVALID_RESPONSE: { category: "provider", retryable: false, message: "The provider response could not be verified.", action: "Contact support with the verification ID." },
  CONFIGURATION_ERROR: { category: "configuration", retryable: false, message: "Verification is temporarily misconfigured.", action: "Contact an administrator with the verification ID." },
  VERIFICATION_REJECTED: { category: "verification", retryable: false, message: "The content did not pass verification.", action: "Review the content and supporting evidence." },
  CANCELLED: { category: "cancellation", retryable: false, message: "Verification was cancelled.", action: "Submit a new verification if needed." },
  INTERNAL_ERROR: { category: "internal", retryable: false, message: "Verification could not be completed.", action: "Contact support with the verification ID." },
} as const;
export type VerificationErrorCode = keyof typeof VERIFICATION_ERRORS;

export function verificationError(code: unknown) {
  const safeCode: VerificationErrorCode = typeof code === "string" && Object.hasOwn(VERIFICATION_ERRORS, code)
    ? code as VerificationErrorCode : "INTERNAL_ERROR";
  return { version: 1 as const, code: safeCode, ...VERIFICATION_ERRORS[safeCode] };
}

/** Only explicitly recognized machine codes are mapped; never interpret free-form messages. */
export function verificationErrorFromFailure(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  const status = (error as { meta?: { status?: number } } | null)?.meta?.status;
  if (code === "EXTERNAL_HTTP_ERROR" && (status === 401 || status === 403)) return verificationError("CONFIGURATION_ERROR");
  if (code === "EXTERNAL_HTTP_ERROR" && (status === 400 || status === 422)) return verificationError("INVALID_INPUT");
  const aliases: Record<string, VerificationErrorCode> = {
    TIMEOUT: "PROVIDER_TIMEOUT", EXTERNAL_TIMEOUT: "PROVIDER_TIMEOUT",
    EXTERNAL_CONNECTION: "PROVIDER_UNAVAILABLE", EXTERNAL_HTTP_ERROR: "PROVIDER_UNAVAILABLE",
    EXTERNAL_INVALID_RESPONSE: "PROVIDER_INVALID_RESPONSE", EXTERNAL_ABORTED: "CANCELLED",
  };
  return verificationError(typeof code === "string" ? aliases[code] ?? code : undefined);
}

export function publicVerification<T extends { status: string; error?: string; errorCode?: string }>(record: T) {
  const { error: _privateError, errorCode, ...safe } = record;
  const failure = record.status === "cancelled" ? verificationError("CANCELLED")
    : record.status === "failed" ? verificationError(errorCode) : undefined;
  return { ...safe, ...(failure ? { error: failure.message, failure } : {}) };
}
