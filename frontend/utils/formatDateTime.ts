import {
  normalizeTimestamp,
  formatTimestamp,
  type TimestampInput,
  type TimestampUnit,
} from "@shared/timestamp";

/**
 * Formats an application timestamp for display in the UI.
 *
 * Semantics (aligned with `packages/shared` timestamp helpers):
 * - Accepts a `Date`, an ISO-8601 string, or a numeric epoch value.
 * - Numeric values are interpreted according to `unit` (defaults to
 *   milliseconds for application timestamps). On-chain ledger timestamps
 *   (seconds) must be passed through `formatLedgerTimestamp` instead.
 * - All values are normalized to UTC before formatting so equal instants
 *   always produce identical output regardless of the caller's time zone.
 * - Returns `null` for invalid or non-finite input.
 */
export function formatDateTime(
  value: TimestampInput,
  unit: TimestampUnit = "milliseconds",
): string | null {
  const normalized = normalizeTimestamp(value, unit);

  if (normalized === null) {
    return null;
  }

  return formatTimestamp(normalized, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "UTC",
  });
}

/**
 * Formats an on-chain ledger timestamp (Unix epoch seconds) for display.
 *
 * On-chain contract events emit timestamps in whole seconds since the Unix
 * epoch. This helper converts them to the same normalized UTC representation
 * used for application timestamps, so UI and export output stay consistent
 * for equal instants.
 */
export function formatLedgerTimestamp(value: TimestampInput): string | null {
  return formatDateTime(value, "seconds");
}