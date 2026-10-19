import type { QueueName } from "../db/collections.js";
import { WEBHOOK_JOB_TYPE, type WebhookService } from "../webhooks/service.js";
import type { HandlerMap } from "./worker.js";

export interface JobHandlerDeps {
  webhooks: WebhookService;
}

/**
 * Job handlers by queue and job type. A worker is started only for queues listed here, so jobs
 * enqueued for a queue with no handlers wait (visible as sv_jobs{state="ready"}) instead of being
 * dead-lettered. Throw JobError(message, code, retryable) from handlers for traceable failures.
 *
 * Example:
 *   verification: {
 *     "submit-attestation": async (job, { log, signal }) => { ... },
 *   },
 */
export function buildJobHandlers({ webhooks }: JobHandlerDeps): Partial<Record<QueueName, HandlerMap>> {
  return {
    notification: {
      // #789 — outbound webhook delivery; retries come from the queue's backoff.
      [WEBHOOK_JOB_TYPE]: (job, ctx) => webhooks.deliver(job, ctx),
    },
  };
}
