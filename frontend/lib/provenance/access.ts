/**
 * Role resolution for provenance bulk export.
 *
 * - admin   : address listed in NEXT_PUBLIC_ADMIN_ADDRESSES (comma separated) — may export all records
 * - creator : any connected wallet — may export records it currently owns
 * - guest   : not connected — export unavailable
 */
export type ExportRole = "admin" | "creator" | "guest";

const ADMINS = (process.env.NEXT_PUBLIC_ADMIN_ADDRESSES ?? "")
  .split(",")
  .map((a) => a.trim().toUpperCase())
  .filter(Boolean);

export function resolveExportRole(publicKey: string | null): ExportRole {
  if (!publicKey) return "guest";
  return ADMINS.includes(publicKey.toUpperCase()) ? "admin" : "creator";
}
