import type { UploadSessionView } from "@stellarveriphy/shared";
import { api, ApiError, type RetryUpdate } from "@/lib/api";

// Client side of resumable uploads (docs/api/upload-sessions.md). The server
// records which chunks are done; this module sends the missing ones, reports
// progress, and remembers the session ID so a reload or disconnect can resume.

// Moves one chunk to its destination. The default only reads the bytes locally
// (files are hashed in the browser and only metadata is registered today);
// swap in a storage upload once file transfer is wired up.
export type ChunkTransport = (chunk: Blob, index: number, session: UploadSessionView, signal?: AbortSignal) => Promise<void>;

export const readChunkLocally: ChunkTransport = async (chunk) => {
  await chunk.arrayBuffer();
};

const STORAGE_KEY = "stellar-veriphy:upload-sessions:v1";
const SESSION_RETRY = { maxAttempts: 4, baseDelayMs: 800, maxDelayMs: 6000 };

function sessionKey(creator: string, contentHash: string): string {
  return `${creator.trim().toUpperCase()}:${contentHash}`;
}

function readStore(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable (private mode, quota): the server still matches by creator + hash.
  }
}

function remember(session: UploadSessionView) {
  writeStore({ ...readStore(), [sessionKey(session.creator, session.contentHash)]: session.id });
}

export function forgetSession(creator: string, contentHash: string) {
  const store = readStore();
  delete store[sessionKey(creator, contentHash)];
  writeStore(store);
}

// Looks up an unfinished session for this file, so the UI can offer Resume or Restart.
export async function findResumableSession(creator: string, contentHash: string): Promise<UploadSessionView | null> {
  const id = readStore()[sessionKey(creator, contentHash)];
  if (!id) return null;
  try {
    const session = await api.getUploadSession(id);
    if (session.status === "in_progress" || session.status === "expired") return session;
  } catch (err) {
    if (!(err instanceof ApiError && err.httpStatus === 404)) throw err;
  }
  forgetSession(creator, contentHash);
  return null;
}

export interface OpenSessionInput {
  file: File;
  contentHash: string;
  creator: string;
  chunkSize?: number;
  // "resume" continues from recorded progress; "restart" clears it first.
  mode?: "resume" | "restart";
  onRetry?: (update: RetryUpdate) => void;
}

export async function openUploadSession(input: OpenSessionInput): Promise<UploadSessionView> {
  const { file, contentHash, creator, mode = "resume" } = input;
  const retry = { ...SESSION_RETRY, onRetry: input.onRetry };

  const known = await findResumableSession(creator, contentHash);
  if (known?.status === "expired" || (known && mode === "restart")) {
    const restarted = await api.updateUploadSession(known.id, { action: "restart" }, { retry });
    remember(restarted);
    return restarted;
  }

  let session = await api.startUploadSession(
    { fileName: file.name, mimeType: file.type, fileSize: file.size, contentHash, creator, chunkSize: input.chunkSize },
    { retry }
  );
  if (mode === "restart" && session.completedChunks.length > 0) {
    session = await api.updateUploadSession(session.id, { action: "restart" }, { retry });
  }
  remember(session);
  return session;
}

export interface UploadChunksInput {
  file: File;
  session: UploadSessionView;
  transport?: ChunkTransport;
  onProgress?: (session: UploadSessionView) => void;
  onRetry?: (update: RetryUpdate) => void;
  signal?: AbortSignal;
  // How many chunks to send before reporting progress to the server.
  reportEvery?: number;
}

// Sends every chunk the server has not recorded yet. Progress is reported in
// batches; if the connection drops, at most one batch is resent on resume.
export async function uploadMissingChunks(input: UploadChunksInput): Promise<UploadSessionView> {
  const { file, transport = readChunkLocally, onProgress, signal, reportEvery = 4 } = input;
  const retry = { ...SESSION_RETRY, onRetry: input.onRetry };
  let session = input.session;
  const done = new Set(session.completedChunks);
  let pending: number[] = [];

  const flush = async () => {
    if (pending.length === 0) return;
    session = await api.updateUploadSession(session.id, { action: "progress", chunks: pending }, { retry });
    pending = [];
    onProgress?.(session);
  };

  for (let index = 0; index < session.totalChunks; index++) {
    if (done.has(index)) continue;
    if (signal?.aborted) {
      await flush();
      throw new DOMException("Upload paused.", "AbortError");
    }
    const start = index * session.chunkSize;
    await transport(file.slice(start, Math.min(file.size, start + session.chunkSize)), index, session, signal);
    pending.push(index);
    if (pending.length >= reportEvery) await flush();
  }
  await flush();
  return session;
}

// Marks the session complete and links it to the registered upload record.
export async function completeUploadSession(session: UploadSessionView, uploadId: string): Promise<UploadSessionView> {
  const completed = await api.updateUploadSession(session.id, { action: "complete", uploadId }, { retry: SESSION_RETRY });
  forgetSession(session.creator, session.contentHash);
  return completed;
}
