/**
 * Loads realistic synthetic data into the configured database (#810).
 *
 * Usage:
 *   pnpm --filter backend db:seed
 *
 * Safe to re-run. It deletes only documents flagged `isFixture: true` and then inserts a fresh set,
 * so real records are never touched. It refuses to run when NODE_ENV is "production".
 */
import { Collections } from "../db/collections.js";
import { ensureIndexes } from "../db/indexes.js";
import { connectMongo } from "../db/mongo.js";
import { buildSeedFixtures, FIXTURE_FLAG, summarizeFixtures } from "../fixtures/seed-data.js";
import { logger } from "../lib/logger.js";

if (process.env.NODE_ENV === "production") {
  process.stderr.write("refusing to seed: NODE_ENV is production\n");
  process.exit(1);
}

const log = logger.child({ component: "db:seed" });
const { client, db } = await connectMongo(log);

try {
  // Indexes first, so the seeded data is queried the same way real data is.
  const indexReport = await ensureIndexes(db, log);
  if (indexReport.conflicts.length > 0) {
    process.stderr.write(`index conflicts, refusing to seed: ${JSON.stringify(indexReport.conflicts)}\n`);
    process.exitCode = 1;
  } else {
    const fixtures = buildSeedFixtures(new Date());
    const targets: Array<[string, unknown[]]> = [
      [Collections.verifications, fixtures.verifications],
      [Collections.sessions, fixtures.sessions],
      [Collections.jobs, fixtures.jobs],
    ];

    for (const [name, docs] of targets) {
      const col = db.collection<Record<string, unknown>>(name);
      await col.deleteMany({ [FIXTURE_FLAG]: true });
      await col.insertMany(docs as Record<string, unknown>[]);
    }

    process.stdout.write(
      JSON.stringify({ database: db.databaseName, seeded: summarizeFixtures(fixtures) }, null, 2) + "\n",
    );
  }
} finally {
  await client.close();
}
