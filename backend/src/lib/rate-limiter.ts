import { createHash } from "node:crypto";
import type { Collection, Db } from "mongodb";
import { Collections } from "../db/collections.js";

interface RateLimitBucket {
  _id: string;
  count: number;
  expiresAt: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  windowSeconds: number;
}

export class RateLimiter {
  private readonly buckets: Collection<RateLimitBucket>;

  constructor(db: Db) {
    this.buckets = db.collection<RateLimitBucket>(Collections.rateLimitBuckets);
  }

  async consume(identity: string, route: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitResult> {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    const bucketId = createHash("sha256").update(`${identity}\n${route}\n${windowStart}`).digest("hex");
    const update = {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(resetAt + windowMs) },
    };

    let bucket: RateLimitBucket | null;
    try {
      bucket = await this.buckets.findOneAndUpdate({ _id: bucketId }, update, { upsert: true, returnDocument: "after" });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      bucket = await this.buckets.findOneAndUpdate({ _id: bucketId }, { $inc: { count: 1 } }, { returnDocument: "after" });
    }
    if (!bucket) throw new Error("Rate limit counter update returned no bucket");

    return {
      allowed: bucket.count <= limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt,
      windowSeconds: Math.ceil(windowMs / 1000),
    };
  }
}
