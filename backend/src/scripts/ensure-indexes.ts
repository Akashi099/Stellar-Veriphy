/**
 * Resumable staged contract storage migration with checkpointing.
 *
 * Usage:
 *   pnpm --filter backend tsx src/scripts/contract-storage-migration.ts \
 *     --migration <migrationId> --stage <stageName> [--batch-size <n>] [--dry-run]
 *
 * The script processes contract storage records in bounded batches, ordered by
 * `_id`. For each (migrationId, stage) pair it reads the latest checkpoint and
 * skips any records at or below `lastProcessedId`, so an interrupted run can be
 * resumed safely without reprocessing completed records.
 *
 * After each batch the checkpoint is persisted (upserted) with the current
 * progress. A final JSON report is emitted to stdout describing the stage,
 * processed/skipped/remaining counts and the terminal status, making the
 * migration observable and auditable.
 *
 * Exit codes:
 *   0 - stage completed (or dry-run finished)
 *   1 - error encountered while processing
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import type { Db, ObjectId } from "mongodb";
import { connectMongo } from "../db/mongo.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "contracts.storage-migration" });

/** Collection holding contract storage records to migrate. */
const STORAGE_COLLECTION = "contract_storage";
/** Collection holding migration checkpoints. */
const CHECKPOINT_COLLECTION = "contract_storage_migration_checkpoints";

const DEFAULT_BATCH_SIZE = 500;

interface CheckpointDoc {
  _id?: ObjectId;
  migrationId: string;
  stage: string;
  lastProcessedId: ObjectId | null;
  processed: number;
  skipped: number;
  status: "running" | "completed" | "failed";
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
  error?: string | null;
  runId: string;
}

interface MigrationReport {
  migrationId: string;
  stage: string;
  runId: string;
  status: "completed" | "failed" | "dry-run";
  processed: number;
  skipped: number;
  remaining: number;
  batchSize: number;
  resumedFrom: string | null;
  startedAt: string;
  finishedAt: string;
  error?: string;
}

interface MigrationOptions {
  migrationId: string;
  stage: string;
  batchSize: number;
  dryRun: boolean;
}

function parseOptions(): MigrationOptions {
  const { values } = parseArgs({
    options: {
      migration: { type: "string" },
      stage: { type: "string" },
      "batch-size": { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  const migrationId = values.migration;
  const stage = values.stage;
  if (!migrationId || !stage) {
    throw new Error(
      "Missing required arguments: --migration <migrationId> --stage <stageName>",
    );
  }

  let batchSize = DEFAULT_BATCH_SIZE;
  if (values["batch-size"] !== undefined) {
    const parsed = Number.parseInt(values["batch-size"], 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`Invalid --batch-size: ${values["batch-size"]}`);
    }
    batchSize = parsed;
  }

  return {
    migrationId,
    stage,
    batchSize,
    dryRun: Boolean(values["dry-run"]),
  };
}

/**
 * Loads the most recent checkpoint for the given migration/stage, if any.
 */
async function loadCheckpoint(
  db: Db,
  migrationId: string,
  stage: string,
): Promise<CheckpointDoc | null> {
  return db
    .collection<CheckpointDoc>(CHECKPOINT_COLLECTION)
    .findOne({ migrationId, stage }, { sort: { updatedAt: -1 } });
}

/**
 * Persists checkpoint progress. Uses an upsert keyed on (migrationId, stage)
 * so that a single logical checkpoint row tracks the latest progress.
 */
async function saveCheckpoint(
  db: Db,
  checkpoint: CheckpointDoc,
): Promise<void> {
  const now = new Date();
  await db.collection<CheckpointDoc>(CHECKPOINT_COLLECTION).updateOne(
    { migrationId: checkpoint.migrationId, stage: checkpoint.stage },
    {
      $set: {
        lastProcessedId: checkpoint.lastProcessedId,
        processed: checkpoint.processed,
        skipped: checkpoint.skipped,
        status: checkpoint.status,
        updatedAt: now,
        completedAt: checkpoint.completedAt ?? null,
        error: checkpoint.error ?? null,
        runId: checkpoint.runId,
      },
      $setOnInsert: {
        startedAt: checkpoint.startedAt,
      },
    },
    { upsert: true },
  );
}

/**
 * Counts records remaining after the given cursor position.
 */
async function countRemaining(
  db: Db,
  lastProcessedId: ObjectId | null,
): Promise<number> {
  const filter =
    lastProcessedId === null ? {} : { _id: { $gt: lastProcessedId } };
  return db.collection(STORAGE_COLLECTION).countDocuments(filter);
}

/**
 * Applies the stage transformation to a single record. This is a placeholder
 * for the actual storage migration logic; it must be idempotent so that
 * re-running a batch is safe.
 */
async function processRecord(
  _db: Db,
  _record: Record<string, unknown>,
): Promise<void> {
  // No-op placeholder: real migrations should transform/rewrite the record.
}

async function runMigration(
  db: Db,
  options: MigrationOptions,
): Promise<MigrationReport> {
  const { migrationId, stage, batchSize, dryRun } = options;
  const runId = randomUUID();
  const startedAt = new Date();

  const existing = await loadCheckpoint(db, migrationId, stage);
  const resumedFrom = existing?.lastProcessedId
    ? String(existing.lastProcessedId)
    : null;

  let lastProcessedId: ObjectId | null = existing?.lastProcessedId ?? null;
  let processed = existing?.processed ?? 0;
  let skipped = existing?.skipped ?? 0;

  log.info(
    {
      migrationId,
      stage,
      runId,
      resumedFrom,
      batchSize,
      dryRun,
    },
    "starting contract storage migration",
  );

  const checkpoint: CheckpointDoc = {
    migrationId,
    stage,
    lastProcessedId,
    processed,
    skipped,
    status: "running",
    startedAt: existing?.startedAt ?? startedAt,
    updatedAt: startedAt,
    completedAt: null,
    error: null,
    runId,
  };

  if (!dryRun) {
    await saveCheckpoint(db, checkpoint);
  }

  const collection = db.collection(STORAGE_COLLECTION);

  try {
    for (;;) {
      const filter =
        lastProcessedId === null ? {} : { _id: { $gt: lastProcessedId } };
      const batch = await collection
        .find(filter)
        .sort({ _id: 1 })
        .limit(batchSize)
        .toArray();

      if (batch.length === 0) {
        break;
      }

      for (const record of batch) {
        const recordId = record._id as ObjectId;
        if (lastProcessedId !== null && recordId <= lastProcessedId) {
          // Defensive: should not happen given the filter, but never
          // reprocess a record at or below the checkpoint cursor.
          skipped += 1;
          continue;
        }

        if (!dryRun) {
          await processRecord(db, record as Record<string, unknown>);
        }
        processed += 1;
        lastProcessedId = recordId;
      }

      checkpoint.lastProcessedId = lastProcessedId;
      checkpoint.processed = processed;
      checkpoint.skipped = skipped;
      checkpoint.updatedAt = new Date();

      if (!dryRun) {
        await saveCheckpoint(db, checkpoint);
      }

      log.info(
        {
          migrationId,
          stage,
          runId,
          processed,
          skipped,
          lastProcessedId: lastProcessedId ? String(lastProcessedId) : null,
        },
        "batch processed",
      );

      if (batch.length < batchSize) {
        break;
      }
    }

    const remaining = await countRemaining(db, lastProcessedId);
    const finishedAt = new Date();

    if (!dryRun) {
      checkpoint.status = "completed";
      checkpoint.completedAt = finishedAt;
      checkpoint.updatedAt = finishedAt;
      await saveCheckpoint(db, checkpoint);
    }

    return {
      migrationId,
      stage,
      runId,
      status: dryRun ? "dry-run" : "completed",
      processed,
      skipped,
      remaining,
      batchSize,
      resumedFrom,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finishedAt = new Date();

    if (!dryRun) {
      checkpoint.status = "failed";
      checkpoint.error = message;
      checkpoint.updatedAt = finishedAt;
      await saveCheckpoint(db, checkpoint).catch((saveErr) => {
        log.error(
          { err: saveErr, migrationId, stage, runId },
          "failed to persist failed checkpoint",
        );
      });
    }

    log.error({ err, migrationId, stage, runId }, "migration failed");

    return {
      migrationId,
      stage,
      runId,
      status: "failed",
      processed,
      skipped,
      remaining: await countRemaining(db, lastProcessedId).catch(() => 0),
      batchSize,
      resumedFrom,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      error: message,
    };
  }
}

async function main(): Promise<void> {
  let options: MigrationOptions;
  try {
    options = parseOptions();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, "invalid arguments");
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    return;
  }

  const { client, db } = await connectMongo(log);
  try {
    const report = await runMigration(db, options);
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    process.exitCode = report.status === "failed" ? 1 : 0;
  } finally {
    await client.close();
  }
}

await main();