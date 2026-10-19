import { findJobsForUploads } from "./jobs";
import { records } from "./store";
import { listSessions } from "./upload-sessions";
import { findUploadsByCreator } from "./uploads";

// Account-level verification history export (#785; docs/api/verification-history-export.md).
// Every source is filtered by the account's creator address before anything is
// read into the export, so one account's export can never include another's events.

export const HISTORY_EXPORT_SCHEMA_VERSION = 1;

export type HistoryEventType =
  | "upload_registered"
  | "upload_session_started"
  | "upload_session_completed"
  | "upload_session_aborted"
  | "upload_session_expired"
  | "verification_job_queued"
  | "verification_job_started"
  | "verification_job_completed"
  | "verification_job_failed"
  | "verification_record_created"
  | "verification_status_changed";

export interface HistoryEvent {
  id: string;
  type: HistoryEventType;
  occurredAt: string;
  contentHash: string | null;
  manifestHash: string | null;
  uploadId: string | null;
  jobId: string | null;
  sessionId: string | null;
  recordId: string | null;
  status: string | null;
  detail: string | null;
}

export interface VerificationHistoryExport {
  schemaVersion: typeof HISTORY_EXPORT_SCHEMA_VERSION;
  account: string;
  generatedAt: string;
  range: { from: string | null; to: string | null };
  summary: {
    totalEvents: number;
    byType: Partial<Record<HistoryEventType, number>>;
    uploads: number;
    verificationJobs: number;
    verificationRecords: number;
  };
  events: HistoryEvent[];
}

export interface HistoryExportOptions {
  from?: Date;
  to?: Date;
  types?: ReadonlySet<HistoryEventType>;
}

function event(type: HistoryEventType, occurredAt: string, sourceId: string, fields: Partial<HistoryEvent>): HistoryEvent {
  return {
    id: `${type}:${sourceId}`,
    type,
    occurredAt,
    contentHash: null,
    manifestHash: null,
    uploadId: null,
    jobId: null,
    sessionId: null,
    recordId: null,
    status: null,
    detail: null,
    ...fields,
  };
}

const SESSION_END_EVENTS: Record<string, HistoryEventType | undefined> = {
  completed: "upload_session_completed",
  aborted: "upload_session_aborted",
  expired: "upload_session_expired",
};

export async function buildVerificationHistoryExport(
  account: string,
  options: HistoryExportOptions = {},
  now = new Date(),
): Promise<VerificationHistoryExport> {
  const uploads = await findUploadsByCreator(account);
  const uploadsById = new Map(uploads.map((u) => [u.id, u]));
  const [jobs, sessions] = await Promise.all([
    findJobsForUploads(new Set(uploadsById.keys())),
    listSessions({ creator: account }),
  ]);
  const verificationRecords = records.listByCreator(account);

  const events: HistoryEvent[] = [];

  for (const upload of uploads) {
    events.push(
      event("upload_registered", upload.createdAt, upload.id, {
        contentHash: upload.contentHash,
        manifestHash: upload.manifestHash,
        uploadId: upload.id,
        detail: upload.title ?? upload.fileName,
      }),
    );
  }

  for (const session of sessions) {
    const base = { contentHash: session.contentHash, sessionId: session.id, uploadId: session.uploadId ?? null };
    events.push(event("upload_session_started", session.createdAt, session.id, { ...base, status: "in_progress" }));
    const endType = SESSION_END_EVENTS[session.status];
    if (endType) {
      events.push(
        event(endType, session.completedAt ?? session.updatedAt, session.id, {
          ...base,
          status: session.status,
          detail: session.restartCount > 0 ? `restarted ${session.restartCount} time(s)` : null,
        }),
      );
    }
  }

  for (const job of jobs) {
    const upload = uploadsById.get(job.uploadId)!;
    const base = { contentHash: upload.contentHash, uploadId: job.uploadId, jobId: job.id };
    events.push(event("verification_job_queued", job.createdAt, job.id, { ...base, status: "pending" }));
    if (job.startedAt) events.push(event("verification_job_started", job.startedAt, job.id, { ...base, status: "processing" }));
    if (job.completedAt) {
      const failed = job.status === "failed";
      events.push(
        event(failed ? "verification_job_failed" : "verification_job_completed", job.completedAt, job.id, {
          ...base,
          manifestHash: job.result?.manifestHash ?? upload.manifestHash,
          status: job.status,
          detail: failed ? job.error ?? null : null,
        }),
      );
    }
  }

  for (const record of verificationRecords) {
    const base = { contentHash: record.contentHash, recordId: record.id };
    events.push(event("verification_record_created", record.createdAt, record.id, base));
    if (record.updatedAt !== record.createdAt) {
      events.push(
        event("verification_status_changed", record.updatedAt, `${record.id}:${record.updatedAt}`, {
          ...base,
          status: record.status,
          detail: record.statusReason,
        }),
      );
    }
  }

  const from = options.from?.getTime();
  const to = options.to?.getTime();
  const selected = events
    .filter((e) => !options.types || options.types.has(e.type))
    .filter((e) => from === undefined || Date.parse(e.occurredAt) >= from)
    .filter((e) => to === undefined || Date.parse(e.occurredAt) <= to)
    // Oldest first, ties broken by id so repeated exports are byte-for-byte stable.
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));

  const byType: VerificationHistoryExport["summary"]["byType"] = {};
  for (const e of selected) byType[e.type] = (byType[e.type] ?? 0) + 1;

  return {
    schemaVersion: HISTORY_EXPORT_SCHEMA_VERSION,
    account,
    generatedAt: now.toISOString(),
    range: { from: options.from?.toISOString() ?? null, to: options.to?.toISOString() ?? null },
    summary: {
      totalEvents: selected.length,
      byType,
      uploads: uploads.length,
      verificationJobs: jobs.length,
      verificationRecords: verificationRecords.length,
    },
    events: selected,
  };
}

const CSV_COLUMNS: readonly (keyof HistoryEvent)[] = [
  "occurredAt",
  "type",
  "id",
  "status",
  "contentHash",
  "manifestHash",
  "uploadId",
  "jobId",
  "sessionId",
  "recordId",
  "detail",
];

function csvCell(value: string | null): string {
  if (value === null) return "";
  // Neutralise spreadsheet formula injection, then quote per RFC 4180.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function historyExportToCsv(history: VerificationHistoryExport): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const e of history.events) lines.push(CSV_COLUMNS.map((column) => csvCell(e[column])).join(","));
  return lines.join("\r\n") + "\r\n";
}
