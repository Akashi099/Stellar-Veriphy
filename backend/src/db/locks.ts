import type { Db } from "mongodb";
import { Collections, type LockDoc } from "./collections.js";

/**
 * Lease-style lock so periodic tasks run on one instance at a time.
 * The lease expires after `ttlMs`, so a crashed holder never blocks others for long.
 */
export async function tryAcquireLock(db: Db, name: string, owner: string, ttlMs: number): Promise<boolean> {
  const now = new Date();
  try {
    const lock = await db.collection<LockDoc>(Collections.locks).findOneAndUpdate(
      { _id: name, $or: [{ lockedUntil: { $lte: now } }, { owner }] },
      { $set: { owner, acquiredAt: now, lockedUntil: new Date(now.getTime() + ttlMs) } },
      { upsert: true, returnDocument: "after" },
    );
    return lock?.owner === owner;
  } catch (err) {
    // Upsert raced with a live lock held by someone else.
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

export async function releaseLock(db: Db, name: string, owner: string): Promise<void> {
  await db.collection<LockDoc>(Collections.locks).updateOne({ _id: name, owner }, { $set: { lockedUntil: new Date(0) } });
}
