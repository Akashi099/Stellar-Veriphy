import { randomUUID } from "crypto";
import {
  UPLOAD_SESSION_LIMITS,
  chunkByteLength,
  totalChunksFor,
  type FieldError,
  type UploadSession,
  type UploadSessionStart,
  type UploadSessionUpdate,
} from "@stellarveriphy/shared";
import { collection } from "./json-collection";
import { getUpload } from "./uploads";
import { etagFor, withKeyLock } from "./write-concurrency";

// Resumable upload state (docs/api/upload-sessions.md). Stored on disk like
// upload records, so a session survives client disconnects and server restarts.

const sessions = () => collection<UploadSession>("upload-sessions");

export type SessionUpdateResult =
  | { ok: true; session: UploadSession }
  | { ok: false; reason: "invalid"; errors: FieldError[] }
  | { ok: false; reason: "conflict"; message: string }
  | { ok: false; reason: "stale"; session: UploadSession }
  | { ok: false; reason: "expired" };

// Every write to one session runs under this lock, so concurrent PATCHes apply
// one after another against the latest stored state (#786).
const sessionLock = <T>(id: string, fn: () => Promise<T>) => withKeyLock(`upload-session:${id}`, fn);

export function sessionEtag(session: UploadSession): string {
  return etagFor(session);
}

function expiresFrom(now: Date): string {
  return new Date(now.getTime() + UPLOAD_SESSION_LIMITS.ttlMs).toISOString();
}

function bytesFor(chunks: number[], session: Pick<UploadSession, "fileSize" | "chunkSize">): number {
  return chunks.reduce((sum, index) => sum + chunkByteLength(index, session.fileSize, session.chunkSize), 0);
}

// Marks in-progress sessions past their expiry as expired (lazily, on read).
// Callers that already hold the session's lock pass locked = true.
async function refresh(session: UploadSession, now = new Date(), locked = false): Promise<UploadSession> {
  if (session.status !== "in_progress" || Date.parse(session.expiresAt) > now.getTime()) return session;
  const expire = async () => {
    // Re-read: another writer may have resumed the session since we loaded it.
    const latest = (await sessions().get(session.id)) ?? session;
    if (latest.status !== "in_progress" || Date.parse(latest.expiresAt) > now.getTime()) return latest;
    const expired: UploadSession = { ...latest, status: "expired", updatedAt: now.toISOString() };
    await sessions().put(expired);
    return expired;
  };
  return locked ? expire() : sessionLock(session.id, expire);
}

// Starts a session, or resumes the open one for the same file and creator so a
// client that lost its session ID after a disconnect picks up where it left off.
export function startOrResumeSession(
  start: UploadSessionStart,
  now = new Date(),
): Promise<{ session: UploadSession; resumed: boolean }> {
  // Two rapid starts for the same file must resume one session, not open two.
  return withKeyLock(`upload-session-start:${start.creator}:${start.contentHash}`, () => startOrResumeLocked(start, now));
}

async function startOrResumeLocked(
  start: UploadSessionStart,
  now: Date,
): Promise<{ session: UploadSession; resumed: boolean }> {
  const candidates = (await sessions().all()).filter(
    (s) => s.creator === start.creator && s.contentHash === start.contentHash && s.status === "in_progress",
  );
  for (const candidate of candidates) {
    const resumed = await sessionLock(candidate.id, async () => {
      const current = await refresh((await sessions().get(candidate.id)) ?? candidate, now, true);
      // A different chunk size would make the recorded chunk indexes meaningless.
      if (current.status !== "in_progress" || current.fileSize !== start.fileSize || current.chunkSize !== start.chunkSize) {
        return null;
      }
      const next: UploadSession = {
        ...current,
        attempt: current.attempt + 1,
        updatedAt: now.toISOString(),
        expiresAt: expiresFrom(now),
      };
      await sessions().put(next);
      return next;
    });
    if (resumed) return { session: resumed, resumed: true };
  }

  const session: UploadSession = {
    id: randomUUID(),
    ...start,
    status: "in_progress",
    totalChunks: totalChunksFor(start.fileSize, start.chunkSize),
    completedChunks: [],
    bytesReceived: 0,
    attempt: 1,
    restartCount: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expiresFrom(now),
  };
  await sessions().put(session);
  return { session, resumed: false };
}

export async function getSession(id: string): Promise<UploadSession | undefined> {
  const session = await sessions().get(id);
  return session ? refresh(session) : undefined;
}

export async function listSessions(filter: { creator?: string; contentHash?: string; status?: string }): Promise<UploadSession[]> {
  const all = await Promise.all((await sessions().all()).map((s) => refresh(s)));
  return all
    .filter((s) => !filter.creator || s.creator === filter.creator)
    .filter((s) => !filter.contentHash || s.contentHash === filter.contentHash)
    .filter((s) => !filter.status || s.status === filter.status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// `isStale` is the caller's If-Match check. It runs against the state read
// under the lock, not an earlier snapshot, so a stale write is always caught.
export function updateSession(
  id: string,
  update: UploadSessionUpdate,
  now = new Date(),
  isStale?: (current: UploadSession) => boolean,
): Promise<SessionUpdateResult | undefined> {
  return sessionLock(id, () => updateSessionLocked(id, update, now, isStale));
}

async function updateSessionLocked(
  id: string,
  update: UploadSessionUpdate,
  now: Date,
  isStale?: (current: UploadSession) => boolean,
): Promise<SessionUpdateResult | undefined> {
  const stored = await sessions().get(id);
  if (!stored) return undefined;
  if (isStale?.(stored)) return { ok: false, reason: "stale", session: stored };
  const session = await refresh(stored, now, true);
  const touched = { updatedAt: now.toISOString() };

  // Restart is allowed from any state except completed: it clears progress and reopens the session.
  if (update.action === "restart") {
    if (session.status === "completed") {
      return { ok: false, reason: "conflict", message: "This upload is already complete. Start a new session to upload it again." };
    }
    const restarted: UploadSession = {
      ...session,
      ...touched,
      status: "in_progress",
      completedChunks: [],
      bytesReceived: 0,
      attempt: session.attempt + 1,
      restartCount: session.restartCount + 1,
      expiresAt: expiresFrom(now),
    };
    await sessions().put(restarted);
    return { ok: true, session: restarted };
  }

  if (session.status === "expired") return { ok: false, reason: "expired" };
  if (session.status !== "in_progress") {
    return { ok: false, reason: "conflict", message: `This upload session is ${session.status.replace("_", " ")}.` };
  }

  switch (update.action) {
    case "resume": {
      const resumed: UploadSession = { ...session, ...touched, attempt: session.attempt + 1, expiresAt: expiresFrom(now) };
      await sessions().put(resumed);
      return { ok: true, session: resumed };
    }
    case "progress": {
      const outOfRange = update.chunks.filter((c) => c >= session.totalChunks);
      if (outOfRange.length > 0) {
        return {
          ok: false,
          reason: "invalid",
          errors: [{
            field: "chunks",
            message: `Chunk indexes must be below ${session.totalChunks} (got ${outOfRange.join(", ")}).`,
          }],
        };
      }
      // Union with what is already recorded: re-reporting a chunk after a retry is a no-op.
      const completedChunks = [...new Set([...session.completedChunks, ...update.chunks])].sort((a, b) => a - b);
      const updated: UploadSession = {
        ...session,
        ...touched,
        completedChunks,
        bytesReceived: bytesFor(completedChunks, session),
        expiresAt: expiresFrom(now),
      };
      await sessions().put(updated);
      return { ok: true, session: updated };
    }
    case "abort": {
      const aborted: UploadSession = { ...session, ...touched, status: "aborted" };
      await sessions().put(aborted);
      return { ok: true, session: aborted };
    }
    case "complete": {
      const missing = session.totalChunks - session.completedChunks.length;
      if (missing > 0) {
        return { ok: false, reason: "conflict", message: `${missing} chunk(s) have not been received yet.` };
      }
      if (update.uploadId) {
        const upload = await getUpload(update.uploadId);
        if (!upload) {
          return { ok: false, reason: "invalid", errors: [{ field: "uploadId", message: "No upload exists with this ID." }] };
        }
        if (upload.contentHash !== session.contentHash || upload.creator !== session.creator) {
          return {
            ok: false,
            reason: "invalid",
            errors: [{ field: "uploadId", message: "The upload does not match this session's file and creator." }],
          };
        }
      }
      const completed: UploadSession = {
        ...session,
        ...touched,
        status: "completed",
        completedAt: now.toISOString(),
        ...(update.uploadId ? { uploadId: update.uploadId } : {}),
      };
      await sessions().put(completed);
      return { ok: true, session: completed };
    }
  }
}
