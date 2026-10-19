/**
 * Runs the retention rules once, outside the scheduler.
 * Usage:
 *   pnpm --filter backend retention:dry-run   # report what would be archived/deleted
 *   pnpm --filter backend retention:cleanup   # apply (takes the same lock as the scheduler)
 */
import { config } from "../config.js";
import { connectMongo } from "../db/mongo.js";
import { logger } from "../lib/logger.js";
import { RetentionCleaner } from "../maintenance/cleanup.js";
import { createOrphanMediaCleaner } from "../maintenance/orphans.js";
import { CleanupScheduler } from "../maintenance/scheduler.js";

const dryRun = process.argv.includes("--dry-run");
const log = logger.child({ component: "retention:cli" });
const { client, db } = await connectMongo(log);
try {
  const scheduler = new CleanupScheduler(
    new RetentionCleaner(db, config.retention, log, createOrphanMediaCleaner(db, log)),
    db,
    config.retention.intervalMinutes * 60_000,
    `${config.instanceId}/cli`,
    log,
  );
  const reports = await scheduler.runNow({ dryRun });
  process.stdout.write(JSON.stringify({ dryRun, policy: config.retention, orphanMedia: config.orphanMedia, tasks: reports }, null, 2) + "\n");
  process.exitCode = reports.some((r) => r.error) ? 1 : 0;
} finally {
  await client.close();
}
