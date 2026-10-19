import { toClientError } from "./client";
import { API_VERSION_HEADER, LATEST_API_VERSION } from "./versioning";

// Client for GET /api/v1/users/:address/verifications/export (#785).

export type HistoryExportFormat = "json" | "csv";

export interface HistoryExportRequest {
  address: string;
  accessToken: string;
  format?: HistoryExportFormat;
  from?: Date;
  to?: Date;
  types?: string[];
}

export interface HistoryExportFile {
  blob: Blob;
  filename: string;
}

// Fetches the export as a file, ready to hand to a download link. Throws ApiClientError on failure.
export async function fetchVerificationHistoryExport(request: HistoryExportRequest): Promise<HistoryExportFile> {
  const format = request.format ?? "json";
  const query = new URLSearchParams({ format });
  if (request.from) query.set("from", request.from.toISOString());
  if (request.to) query.set("to", request.to.toISOString());
  for (const type of request.types ?? []) query.append("type", type);

  const response = await fetch(`/api/v1/users/${encodeURIComponent(request.address)}/verifications/export?${query}`, {
    headers: { Authorization: `Bearer ${request.accessToken}`, [API_VERSION_HEADER]: LATEST_API_VERSION },
  });
  if (!response.ok) throw await toClientError(response);

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `verification-history.${format}`;
  return { blob: await response.blob(), filename };
}
