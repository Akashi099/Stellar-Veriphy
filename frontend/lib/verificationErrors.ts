/** Verification error contract v1. Unknown/future codes always have a safe fallback. */
export const VERIFICATION_ACTIONS = {
  INVALID_INPUT: "Check the file and manifest, then submit again.",
  ACCESS_DENIED: "Request verification access from an administrator.",
  PROVIDER_TIMEOUT: "Try again later.",
  PROVIDER_UNAVAILABLE: "Try again later or contact support.",
  PROVIDER_INVALID_RESPONSE: "Contact support with the verification ID.",
  CONFIGURATION_ERROR: "Contact an administrator with the verification ID.",
  VERIFICATION_REJECTED: "Review the content and supporting evidence.",
  CANCELLED: "Submit a new verification if needed.",
  INTERNAL_ERROR: "Contact support with the verification ID.",
} as const;
export interface VerificationFailure { version: number; code: string; retryable: boolean }
export function verificationAction(failure: VerificationFailure | undefined): string {
  if (failure?.version !== 1 || !Object.hasOwn(VERIFICATION_ACTIONS, failure.code)) return VERIFICATION_ACTIONS.INTERNAL_ERROR;
  return VERIFICATION_ACTIONS[failure.code as keyof typeof VERIFICATION_ACTIONS];
}

export function safeVerificationFailure(code: unknown): VerificationFailure {
  const safe = typeof code === "string" && Object.hasOwn(VERIFICATION_ACTIONS, code) ? code : "INTERNAL_ERROR";
  return { version: 1, code: safe, retryable: safe === "PROVIDER_TIMEOUT" || safe === "PROVIDER_UNAVAILABLE" };
}
