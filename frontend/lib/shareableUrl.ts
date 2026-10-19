/**
 * shareableUrl.ts
 *
 * Shareable verification URL helpers.
 *
 * Addresses Issue #622:
 * Build shareable verification URLs that open public or authenticated asset detail views
 * with the correct context and permissions model for clients, auditors, and external stakeholders.
 */

export type VerificationAccessMode = "public" | "authenticated";
export type StakeholderRole = "client" | "auditor" | "stakeholder" | "general";

export interface ShareableUrlOptions {
  /** Mode of access: public (read-only proof) or authenticated (full audit trail & provenance) */
  mode?: VerificationAccessMode;
  /** Intended role for tailored context banner */
  role?: StakeholderRole;
  /** Optional base URL (defaults to window.location.origin on client or empty string) */
  baseUrl?: string;
  /** Optional access token or signature for private verification */
  token?: string;
}

/**
 * Builds a canonical shareable deep-link URL for an asset verification record.
 *
 * @param recordId Unique ID or content hash of the verification record
 * @param options Access mode, stakeholder role, baseUrl, and optional auth token
 * @returns Fully qualified or relative shareable verification URL
 */
export function buildShareableVerificationUrl(
  recordId: string,
  options: ShareableUrlOptions = {}
): string {
  const { mode = "public", role = "client", baseUrl = "", token } = options;

  const cleanBase = baseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams();

  if (mode) params.set("mode", mode);
  if (role && role !== "general") params.set("role", role);
  if (token) params.set("token", token);

  const queryString = params.toString();
  const path = `/v/${encodeURIComponent(recordId)}${queryString ? `?${queryString}` : ""}`;

  return cleanBase ? `${cleanBase}${path}` : path;
}

/**
 * Parses query params and access context for a verification deep-link.
 */
export function parseVerificationUrlContext(searchParams: {
  [key: string]: string | string[] | undefined;
}) {
  const modeParam = Array.isArray(searchParams.mode) ? searchParams.mode[0] : searchParams.mode;
  const roleParam = Array.isArray(searchParams.role) ? searchParams.role[0] : searchParams.role;
  const tokenParam = Array.isArray(searchParams.token) ? searchParams.token[0] : searchParams.token;

  const mode: VerificationAccessMode = modeParam === "authenticated" ? "authenticated" : "public";
  const role: StakeholderRole =
    roleParam === "auditor" || roleParam === "client" || roleParam === "stakeholder"
      ? roleParam
      : "general";

  return {
    mode,
    role,
    token: tokenParam ?? null,
    isAuthenticatedMode: mode === "authenticated",
    isPublicMode: mode === "public",
  };
}
