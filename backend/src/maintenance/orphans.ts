import type { Db } from "mongodb";
import { config, type Config } from "../config.js";
import type { Logger } from "../lib/logger.js";
import { orphanMediaBytes, orphanMediaObjects } from "../lib/metrics.js";
import {
  Collections,
  type ArchivedSessionDoc,
  type VerificationDoc,
  type VerificationSessionDoc,
} from "../db/collections.js";
import { LocalMediaStorage, type MediaStorage, type StoredObject } from "../storage/media.js";

export type OrphanMediaPolicy = Config["orphanMedia"];

export interface OrphanScanResult {
  /** Objects listed from storage this run. */
  scanned: number;
  /** Objects with a matching verification, session or archived session. */
  referenced: number;
  /** Unreferenced but younger than the grace period; an upload may still be in progress. */
  tooRecent: number;
  orphaned: StoredObject[];
  /** True when the per-run scan limit was hit; the rest is scanned next run. */
  truncated: boolean;
}

const LOGGED_KEYS_LIMIT = 50;

/** Builds the cleaner from config, or returns undefined when it is disabled or no storage is configured. */
export function createOrphanMediaCleaner(db: Db, log: Logger): OrphanMediaCleaner | undefined {
  const { orphanMedia } = config;
  if (!orphanMedia.enabled || !orphanMedia.storageDir) {
    log.info("orphaned media cleanup inactive", { enabled: orphanMedia.enabled, storageConfigured: Boolean(orphanMedia.storageDir) });
    return undefined;
  }
  return new OrphanMediaCleaner(db, new LocalMediaStorage(orphanMedia.storageDir), orphanMedia, config.retention, log);
}

export class OrphanSafetyLimitError extends Error {
  constructor(orphaned: number, scanned: number, maxPercent: number) {
    super(
      `refusing to delete ${orphaned} of ${scanned} scanned media objects (over ORPHAN_MEDIA_MAX_DELETE_PERCENT=${maxPercent}%); ` +
        "check that MEDIA_STORAGE_DIR and MONGODB_DB point at the same environment",
    );
    this.name = "OrphanSafetyLimitError";
  }
}

/**
 * Finds and removes media files that no record points to (#782).
 *
 * A file is kept if any of these reference it:
 * - `verifications.storageRef` (certified media; permanent),
 * - `verification_sessions.tempUploadRef` (uploads in progress or resumable),
 * - `verification_sessions_archive.tempUploadRef` (restorable for RETENTION_ARCHIVE_DAYS),
 * or if it was modified less than ORPHAN_MEDIA_MIN_AGE_HOURS ago, which covers the window between
 * a file landing in storage and its record being written.
 *
 * Deletion is all-or-nothing per run against a safety ceiling: if more than
 * ORPHAN_MEDIA_MAX_DELETE_PERCENT of scanned files look orphaned, nothing is deleted.
 */
export class OrphanMediaCleaner {
  constructor(
    private readonly db: Db,
    private readonly storage: MediaStorage,
    private readonly policy: OrphanMediaPolicy,
    private readonly scanLimit: { batchSize: number; maxBatchesPerRun: number },
    private readonly log: Logger,
  ) {}

  get storageName(): string {
    return this.storage.name;
  }

  async scan(): Promise<OrphanScanResult> {
    const maxObjects = this.scanLimit.batchSize * this.scanLimit.maxBatchesPerRun;
    const cutoff = Date.now() - this.policy.minAgeHours * 3_600_000;
    const result: OrphanScanResult = { scanned: 0, referenced: 0, tooRecent: 0, orphaned: [], truncated: false };

    let batch: StoredObject[] = [];
    for await (const object of this.storage.list()) {
      if (result.scanned >= maxObjects) {
        result.truncated = true;
        break;
      }
      result.scanned++;
      batch.push(object);
      if (batch.length >= this.scanLimit.batchSize) {
        await this.classify(batch, cutoff, result);
        batch = [];
      }
    }
    if (batch.length > 0) await this.classify(batch, cutoff, result);
    return result;
  }

  /** Scans, applies the safety ceiling, then deletes. Returns the number deleted. */
  async run({ dryRun }: { dryRun: boolean }): Promise<OrphanScanResult & { deleted: number; failed: number }> {
    const scope = {
      storage: this.storage.name,
      minAgeHours: this.policy.minAgeHours,
      maxDeletePercent: this.policy.maxDeletePercent,
      dryRun,
    };
    this.log.info("orphaned media scan started", scope);

    const scan = await this.scan();
    const orphanBytes = scan.orphaned.reduce((n, o) => n + o.sizeBytes, 0);
    const summary = {
      ...scope,
      scanned: scan.scanned,
      referenced: scan.referenced,
      tooRecent: scan.tooRecent,
      orphaned: scan.orphaned.length,
      orphanBytes,
      truncated: scan.truncated,
      sampleKeys: scan.orphaned.slice(0, LOGGED_KEYS_LIMIT).map((o) => o.key),
    };

    if (dryRun) {
      this.log.info("orphaned media dry run", summary);
      return { ...scan, deleted: 0, failed: 0 };
    }

    const percent = scan.scanned === 0 ? 0 : (scan.orphaned.length / scan.scanned) * 100;
    if (scan.orphaned.length > 0 && percent > this.policy.maxDeletePercent) {
      this.log.error("orphaned media cleanup aborted by safety limit; nothing deleted", { ...summary, orphanPercent: Math.round(percent) });
      throw new OrphanSafetyLimitError(scan.orphaned.length, scan.scanned, this.policy.maxDeletePercent);
    }

    let deleted = 0;
    let failed = 0;
    let deletedBytes = 0;
    // Re-check references right before deleting, so a record written during the scan still protects its file.
    const stillOrphaned = await this.unreferenced(scan.orphaned);
    const rescued = scan.orphaned.length - stillOrphaned.length;
    for (const object of stillOrphaned) {
      try {
        await this.storage.delete(object.key);
        deleted++;
        deletedBytes += object.sizeBytes;
        this.log.debug("orphaned media deleted", { storage: this.storage.name, key: object.key, sizeBytes: object.sizeBytes });
      } catch (err) {
        failed++;
        this.log.warn("failed to delete orphaned media; will retry next run", { storage: this.storage.name, key: object.key, err });
      }
    }

    orphanMediaObjects.inc({ storage: this.storage.name, outcome: "deleted" }, deleted);
    orphanMediaObjects.inc({ storage: this.storage.name, outcome: "failed" }, failed);
    orphanMediaBytes.inc({ storage: this.storage.name }, deletedBytes);
    this.log.info("orphaned media cleanup completed", { ...summary, rescued, deleted, failed, deletedBytes });
    return { ...scan, orphaned: stillOrphaned, deleted, failed };
  }

  private async classify(batch: StoredObject[], cutoff: number, result: OrphanScanResult): Promise<void> {
    const old = batch.filter((o) => o.lastModified.getTime() < cutoff);
    result.tooRecent += batch.length - old.length;
    const orphaned = await this.unreferenced(old);
    result.referenced += old.length - orphaned.length;
    result.orphaned.push(...orphaned);
  }

  /** Objects from `objects` that no verification, session or archived session references. */
  private async unreferenced(objects: StoredObject[]): Promise<StoredObject[]> {
    if (objects.length === 0) return [];
    const refsByKey = new Map(objects.map((o) => [o.key, [this.storage.refFor(o.key), o.key, `/${o.key}`]]));
    const refs = [...refsByKey.values()].flat();

    const [verifications, sessions, archived] = await Promise.all([
      this.db
        .collection<VerificationDoc>(Collections.verifications)
        .find({ storageRef: { $in: refs } }, { projection: { _id: 0, storageRef: 1 } })
        .toArray(),
      this.db
        .collection<VerificationSessionDoc>(Collections.sessions)
        .find({ tempUploadRef: { $in: refs } }, { projection: { _id: 0, tempUploadRef: 1 } })
        .toArray(),
      this.db
        .collection<ArchivedSessionDoc>(Collections.sessionsArchive)
        .find({ tempUploadRef: { $in: refs } }, { projection: { _id: 0, tempUploadRef: 1 } })
        .toArray(),
    ]);

    const referencedKeys = new Set<string>();
    for (const ref of [
      ...verifications.map((v) => v.storageRef),
      ...sessions.map((s) => s.tempUploadRef),
      ...archived.map((s) => s.tempUploadRef),
    ]) {
      const key = ref && this.storage.keyFromRef(ref);
      if (key) referencedKeys.add(key);
    }
    return objects.filter((o) => !referencedKeys.has(o.key));
  }
}
