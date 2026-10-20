import { config, externalApiPolicy } from "./config.js";
import type { QueueName } from "./db/collections.js";
import { ensureIndexes } from "./db/indexes.js";
import { connectMongo } from "./db/mongo.js";
import { CachedVerificationReads, VerificationRepository, createPublicVerificationCaches } from "./db/verifications.js";
import { buildDependencyChecks } from "./health/checks.js";
import { HealthMonitor } from "./health/monitor.js";
import { buildJobHandlers } from "./jobs/handlers.js";
import { QueueMonitor } from "./jobs/monitor.js";
import { JobQueue } from "./jobs/queue.js";
import { Worker } from "./jobs/worker.js";
import { ExternalApiClient } from "./lib/http.js";
import { logger } from "./lib/logger.js";
import { RetentionCleaner } from "./maintenance/cleanup.js";
import { createOrphanMediaCleaner } from "./maintenance/orphans.js";
import { MaintenanceMode } from "./maintenance/mode.js";
import { CleanupScheduler } from "./maintenance/scheduler.js";
import { createHttpServer } from "./server.js";
import { WebhookService } from "./webhooks/service.js";

const SHUTDOWN_TIMEOUT_MS = 30_000;

async function main(): Promise<void> {
  const log = logger.child({ instance: config.instanceId });

  const { client, db } = await connectMongo(log.child({ component: "mongodb" }));
  await ensureIndexes(db, log.child({ component: "indexes" }));

  const health = new HealthMonitor(buildDependencyChecks(db), config.health, log.child({ component: "health" }));
  health.start();

  const maintenance = new MaintenanceMode(db, config.maintenance, log.child({ component: "maintenance" }));
  await maintenance.start();

  const queue = new JobQueue(db, config.jobs, log.child({ component: "queue" }));
  const webhooks = new WebhookService(
    db,
    queue,
    new ExternalApiClient("webhook", externalApiPolicy("webhook"), log.child({ component: "webhook-http" })),
    config.webhooks,
    log.child({ component: "webhooks" }),
  );
  if (!webhooks.enabled) log.info("outbound webhooks disabled (WEBHOOK_ENDPOINTS is empty)");
  else if (!config.webhooks.signingSecret) log.warn("WEBHOOK_SIGNING_SECRET is not set; webhook deliveries are unsigned");

  const workers = Object.entries(buildJobHandlers({ webhooks }))
    .filter(([, handlers]) => handlers && Object.keys(handlers).length > 0)
    .map(
      ([name, handlers]) =>
        new Worker(
          queue,
          name as QueueName,
          handlers!,
          config.jobs,
          config.instanceId,
          log.child({ component: "worker", queue: name }),
          () => maintenance.jobsPaused(),
        ),
    );
  workers.forEach((w) => w.start());

  const queueMonitor = new QueueMonitor(queue, config.jobs, log.child({ component: "queue-monitor" }));
  queueMonitor.start();

  const orphans = createOrphanMediaCleaner(db, log.child({ component: "orphan-media" }));
  const cleaner = new RetentionCleaner(db, config.retention, log.child({ component: "retention" }), orphans);
  const cleanup = new CleanupScheduler(
    cleaner,
    db,
    config.retention.intervalMinutes * 60_000,
    config.instanceId,
    log.child({ component: "retention" }),
  );
  if (config.retention.enabled) cleanup.start();
  else log.warn("retention cleanup disabled (RETENTION_CLEANUP_ENABLED=false)");

  const verificationRepository = new VerificationRepository(db);
  const verifications = new CachedVerificationReads(
    verificationRepository,
    createPublicVerificationCaches(config.cache, log.child({ component: "cache" })),
  );

  const server = createHttpServer({
    health,
    queue,
    cleanup,
    verifications,
    verifications: verificationRepository,
    maintenance,
    webhooks,
    timeouts: config.httpTimeouts,
    log: log.child({ component: "http" }),
  });
  server.listen(config.port, () => log.info("backend listening", { port: config.port }));

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutting down", { signal });
    setTimeout(() => {
      log.error("graceful shutdown timed out; exiting");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    server.close();
    cleanup.stop();
    queueMonitor.stop();
    health.stop();
    maintenance.stop();
    await Promise.all(workers.map((w) => w.stop()));
    await client.close();
    log.info("shutdown complete");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("fatal startup error", { err });
  process.exit(1);
});
