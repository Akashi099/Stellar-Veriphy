/**
 * Applies src/db/indexes.ts to the configured database and reports drift.
 * Usage: pnpm --filter backend db:indexes
 * Exits non-zero if any declared index conflicts with an existing one.
 */
import { ensureIndexes } from "../db/indexes.js";
import { connectMongo } from "../db/mongo.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "db:indexes" });
const { client, db } = await connectMongo(log);
try {
  const report = await ensureIndexes(db, log);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exitCode = report.conflicts.length > 0 ? 1 : 0;
} finally {
  await client.close();
}
