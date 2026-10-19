/**
 * verificationHistory.ts
 *
 * Tracks certificate verification lookups performed in this browser
 * (issue #465). Storage is local-only, mirroring `lib/security/auditLogger.ts`
 * and the local-data model described on `/privacy`.
 *
 * Tracking can be turned off by the user (privacy control); when disabled,
 * `record()` is a no-op and no new entries are written.
 */

const STORAGE_KEY = "sv_verification_history";
const ENABLED_KEY = "sv_verification_history_enabled";
const MAX_ENTRIES = 200;

export type VerificationHistoryStatus = "verified" | "not_found" | "error" | "revoked";

export interface VerificationHistoryEntry {
  id: string;
  timestamp: string; // ISO 8601
  method: "id" | "code" | "creator" | "authenticity";
  query: string;
  certificateId?: string | undefined;
  status: VerificationHistoryStatus;
  details?: string | undefined;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `vh-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readEntries(): VerificationHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as VerificationHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: VerificationHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function isHistoryTrackingEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(ENABLED_KEY);
  return stored === null ? true : stored === "true";
}

export function setHistoryTrackingEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ENABLED_KEY, String(enabled));
}

export function recordVerificationEvent(
  params: Omit<VerificationHistoryEntry, "id" | "timestamp">
): void {
  if (!isHistoryTrackingEnabled()) return;

  const entry: VerificationHistoryEntry = {
    id: createId(),
    timestamp: new Date().toISOString(),
    ...params,
  };

  writeEntries([entry, ...readEntries()].slice(0, MAX_ENTRIES));
}

export interface VerificationHistoryFilters {
  startDate?: Date;
  endDate?: Date;
}

export function getVerificationHistory(
  filters: VerificationHistoryFilters = {}
): VerificationHistoryEntry[] {
  let entries = readEntries().sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  if (filters.startDate) {
    const start = filters.startDate.getTime();
    entries = entries.filter((e) => new Date(e.timestamp).getTime() >= start);
  }
  if (filters.endDate) {
    const end = filters.endDate.getTime();
    entries = entries.filter((e) => new Date(e.timestamp).getTime() <= end);
  }

  return entries;
}

export function clearVerificationHistory(): void {
  writeEntries([]);
}

export function exportVerificationHistory(): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      entries: getVerificationHistory(),
    },
    null,
    2
  );
}
