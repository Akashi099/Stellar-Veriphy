import { createHash } from "crypto";

// Write concurrency helpers for manifest and asset records (#786;
// docs/api/write-concurrency.md).
//
// - withKeyLock serializes read-modify-write sections that touch the same
//   record, so two rapid saves can't both read the old state and overwrite
//   each other. It is per process; a multi-instance deployment needs the same
//   guarantee from the database (conditional updates on a revision field).
// - etagFor / ifMatchFailed give clients optimistic concurrency: send the ETag
//   you last read as If-Match, and a write based on stale data gets 409.

const registry = globalThis as typeof globalThis & { __veriphyKeyLocks?: Map<string, Promise<void>> };

function locks(): Map<string, Promise<void>> {
  registry.__veriphyKeyLocks ??= new Map();
  return registry.__veriphyKeyLocks;
}

export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks().get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => current);
  locks().set(key, tail);

  await previous;
  try {
    return await fn();
  } finally {
    release();
    // Drop the entry once nobody is queued behind us, so the map doesn't grow forever.
    if (locks().get(key) === tail) locks().delete(key);
  }
}

// Strong ETag over the record's full stored state.
export function etagFor(value: unknown): string {
  return `"${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32)}"`;
}

// True when the request sent If-Match and none of its tags match the current
// ETag. Requests without If-Match are allowed (last write wins, serialized).
export function ifMatchFailed(req: Request, currentEtag: string | undefined): boolean {
  const header = req.headers.get("if-match");
  if (header === null) return false;
  if (header.trim() === "*") return currentEtag === undefined;
  if (currentEtag === undefined) return true;
  return !header
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
    .includes(currentEtag);
}

// Manifest versions (/api/versions): the current version's id is the manifest's
// ETag, and every write for one contentHash shares one lock.
export function versionEtag(version: { id: string } | undefined): string | undefined {
  return version ? `"${version.id}"` : undefined;
}

export function versionLockKey(contentHash: string): string {
  return `manifest-versions:${contentHash}`;
}
