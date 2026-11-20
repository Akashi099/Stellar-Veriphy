import type { VerificationStatus } from "@stellarveriphy/shared/types";

export interface BulkStatusResponse {
  atomic: boolean;
  summary: { requested: number; succeeded: number; failed: number; changed: number };
  results: Array<Record<string, unknown>>;
  undo?: { token: string; expiresAt: string };
}

async function request<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? "The status update could not be completed.");
  return payload.data as T;
}

export function applyBulkStatus(ids: string[], status: VerificationStatus, reason?: string | null) {
  return request<BulkStatusResponse>("/api/v1/records/bulk-status", {
    ids,
    status,
    reason: reason ?? null,
    atomic: true,
  });
}

/** Undo is only offered for the token returned by the immediately preceding successful update. */
export function undoBulkStatus(token: string) {
  return request<BulkStatusResponse>("/api/v1/records/bulk-status/undo", { token });
}
***
