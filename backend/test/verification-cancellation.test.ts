import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { MongoClient } from "mongodb";
import { Collections, type VerificationDoc } from "../src/db/collections.js";
import { VerificationRepository } from "../src/db/verifications.js";
import { JobQueue } from "../src/jobs/queue.js";
import { logger } from "../src/lib/logger.js";
import { createHttpServer, type ServerDeps } from "../src/server.js";

test("untrusted user identity cannot authorize cancellation", async () => {
  let called = false;
  const deps = {
    queue: { cancelVerification: async () => { called = true; return "cancelled"; } },
    rateLimiter: { consume: async () => ({ allowed: true, limit: 5, remaining: 4, resetAt: Date.now() + 60_000, windowSeconds: 60 }) },
    log: logger,
  } as unknown as ServerDeps;
  const server = createHttpServer(deps);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const response = await fetch("http://127.0.0.1:" + address.port + "/api/verifications/job-1/cancel", { method: "POST", headers: { "x-user-id": "creator" } });
    assert.ok([401, 403].includes(response.status)); assert.equal(called, false);
  } finally { server.close(); server.closeAllConnections(); }
});

// Integration coverage requires an isolated MongoDB replica set. Never connects without explicit opt-in.
test("cancellation fences finalization, retries and stale writes atomically", { skip: !process.env.TEST_MONGODB_URI }, async () => {
  const client = new MongoClient(process.env.TEST_MONGODB_URI!); await client.connect();
  const db = client.db("verification_cancellation_test_" + Date.now());
  const queue = new JobQueue(db, { defaultMaxAttempts: 2, retryBaseDelayMs: 1, retryMaxDelayMs: 10 }, logger);
  const repo = new VerificationRepository(db);
  async function seed(jobId: string) {
    const now = new Date();
    await db.collection<VerificationDoc>(Collections.verifications).insertOne({ jobId, creator: "creator", contentHash: jobId, manifestHash: jobId, storageRef: jobId, status: "processing", createdAt: now, updatedAt: now });
    return queue.enqueue("verification", "verify", {}, { correlationId: jobId });
  }
  try {
    const id = await seed("active"); const job = await queue.claim("verification", "worker"); assert.ok(job);
    assert.equal(await queue.cancelVerification("active"), "cancelled");
    assert.equal(await queue.cancelVerification("active"), "cancelled");
    assert.equal(await queue.heartbeat(id, "worker"), false);
    assert.equal(await queue.beginFinalization(job, "worker"), false);
    assert.equal(await queue.complete(job, "worker", 1), false);
    assert.equal(await queue.fail(job, "worker", new Error("late error"), 1), "lost");
    assert.equal(await queue.retryDead(id, "operator"), false);
    assert.equal(await repo.updateStatus("active", "certified"), null);
    assert.equal((await repo.getStatus("active"))?.status, "cancelled");
    await seed("finalizing"); const finalizing = await queue.claim("verification", "worker"); assert.ok(finalizing);
    assert.equal(await queue.beginFinalization(finalizing, "worker"), true);
    assert.equal(await queue.cancelVerification("finalizing"), "conflict");
    await queue.complete(finalizing, "worker", 1);
    await seed("racing"); const racing = await queue.claim("verification", "worker"); assert.ok(racing);
    const [cancelled, finalized] = await Promise.all([queue.cancelVerification("racing"), queue.beginFinalization(racing, "worker")]);
    assert.notEqual(cancelled === "cancelled", finalized);
  } finally { await db.dropDatabase(); await client.close(); }
});
