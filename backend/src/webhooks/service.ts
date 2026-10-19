import { createHash, createHmac, randomUUID } from "node:crypto";
import { ObjectId, type Db, type Filter, type WithId } from "mongodb";
import type { Logger } from "../lib/logger.js";
import { ExternalApiError, type ExternalApiClient } from "../lib/http.js";
import { webhookDeliveries, webhookDeliveriesInState, webhookDeliveryDuration } from "../lib/metrics.js";
import { safeUrl } from "../lib/url.js";
import {
  Collections,
  type JobDoc,
  type WebhookAttemptEntry,
  type WebhookDeliveryDoc,
  type WebhookDeliveryStatus,
} from "../db/collections.js";
import { JobError, errorCode, errorMessage } from "../jobs/errors.js";
import type { JobQueue } from "../jobs/queue.js";
import type { JobContext } from "../jobs/worker.js";

export const WEBHOOK_JOB_TYPE = "webhook.deliver";
const WEBHOOK_QUEUE = "notification" as const;
const ATTEMPT_HISTORY_LIMIT = 10;
const DUPLICATE_KEY = 11000;

export interface WebhookOptions {
  endpoints: string[];
  signingSecret?: string;
  maxAttempts: number;
}

export interface WebhookEvent {
  /** Stable id of the business event. Publishing the same id twice delivers it once per endpoint. */
  id?: string;
  type: string;
  data: unknown;
  occurredAt?: Date;
}

export interface PublishResult {
  eventId: string;
  deliveries: Array<{ endpoint: string; deliveryId?: ObjectId; duplicate: boolean }>;
}

export interface WebhookJobPayload {
  deliveryId: string;
}

/** Fields returned by operator views; excludes the request body. */
const SUMMARY_PROJECTION = { body: 0 } as const;

/**
 * Outbound webhook delivery (#789).
 *
 * - **Retries**: each delivery is a job on the `notification` queue, so attempts get the queue's
 *   exponential backoff, heartbeats, stall recovery and dead-lettering. The HTTP client itself does
 *   not retry (that would multiply attempts).
 * - **Idempotency**: a delivery is unique per (event id, endpoint). Re-publishing an event is a
 *   no-op, a delivery already marked delivered is never sent again (even if its job is re-run), and
 *   every attempt carries the same Idempotency-Key and byte-identical body so receivers can dedupe.
 * - **Failure tracking**: every attempt is recorded on the delivery; permanent failures are marked
 *   `failed`, logged at error level, counted in metrics and listed at GET /admin/webhooks/deliveries.
 *
 * Runbook: docs/operations/webhooks.md
 */
export class WebhookService {
  constructor(
    private readonly db: Db,
    private readonly queue: JobQueue,
    private readonly http: ExternalApiClient,
    private readonly opts: WebhookOptions,
    private readonly log: Logger,
  ) {}

  private get col() {
    return this.db.collection<WebhookDeliveryDoc>(Collections.webhookDeliveries);
  }

  get enabled(): boolean {
    return this.opts.endpoints.length > 0;
  }

  static idempotencyKey(endpoint: string, eventId: string): string {
    return createHash("sha256").update(`${endpoint}\n${eventId}`).digest("hex");
  }

  /** Records one delivery per configured endpoint and queues it. Safe to call repeatedly for the same event. */
  async publish(event: WebhookEvent): Promise<PublishResult> {
    const eventId = event.id ?? `evt_${randomUUID().replace(/-/g, "")}`;
    const createdAt = event.occurredAt ?? new Date();
    const body = JSON.stringify({ id: eventId, type: event.type, createdAt: createdAt.toISOString(), data: event.data });
    const result: PublishResult = { eventId, deliveries: [] };

    for (const endpoint of this.opts.endpoints) {
      const now = new Date();
      const doc: WebhookDeliveryDoc = {
        idempotencyKey: WebhookService.idempotencyKey(endpoint, eventId),
        eventId,
        eventType: event.type,
        endpoint,
        body,
        status: "pending",
        attempts: 0,
        maxAttempts: this.opts.maxAttempts,
        attemptHistory: [],
        createdAt: now,
        updatedAt: now,
      };

      let deliveryId: ObjectId;
      try {
        deliveryId = (await this.col.insertOne(doc)).insertedId;
      } catch (err) {
        if ((err as { code?: number }).code !== DUPLICATE_KEY) throw err;
        webhookDeliveries.inc({ outcome: "duplicate" });
        this.log.info("webhook event already published to endpoint; skipping duplicate", {
          eventId,
          eventType: event.type,
          endpoint: safeUrl(endpoint),
        });
        result.deliveries.push({ endpoint: safeUrl(endpoint), duplicate: true });
        continue;
      }

      await this.schedule(deliveryId, doc);
      result.deliveries.push({ endpoint: safeUrl(endpoint), deliveryId, duplicate: false });
    }
    return result;
  }

  /** Job handler for `notification` / `webhook.deliver`. */
  async deliver(job: WithId<JobDoc<WebhookJobPayload>>, { log, signal }: JobContext): Promise<void> {
    const delivery = ObjectId.isValid(job.payload.deliveryId)
      ? await this.col.findOne({ _id: new ObjectId(job.payload.deliveryId) })
      : null;
    if (!delivery) throw new JobError(`Webhook delivery ${job.payload.deliveryId} not found`, "DELIVERY_NOT_FOUND", false);

    const fields = {
      deliveryId: job.payload.deliveryId,
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      endpoint: safeUrl(delivery.endpoint),
    };
    if (delivery.status === "delivered") {
      // The job was re-run after a successful send (e.g. the worker lost its lock); don't send twice.
      webhookDeliveries.inc({ outcome: "skipped" });
      log.info("webhook already delivered; skipping", fields);
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": "StellarVeriphy-Webhooks/1.0",
      "idempotency-key": delivery.idempotencyKey,
      "x-veriphy-event-id": delivery.eventId,
      "x-veriphy-event-type": delivery.eventType,
      "x-veriphy-delivery-id": job.payload.deliveryId,
      "x-veriphy-attempt": String(job.attempts),
      "x-veriphy-timestamp": String(timestamp),
    };
    if (this.opts.signingSecret) {
      const signature = createHmac("sha256", this.opts.signingSecret).update(`${timestamp}.${delivery.body}`).digest("hex");
      headers["x-veriphy-signature"] = `t=${timestamp},v1=${signature}`;
    }

    const started = performance.now();
    try {
      const res = await this.http.request(delivery.endpoint, {
        method: "POST",
        body: delivery.body,
        headers,
        signal,
        idempotent: true,
        policy: { retries: 0 },
      });
      const durationMs = Math.round(performance.now() - started);
      await this.recordAttempt(delivery, job, { outcome: "delivered", durationMs, httpStatus: res.status }, "delivered");
      webhookDeliveries.inc({ outcome: "delivered" });
      webhookDeliveryDuration.observe({ outcome: "delivered" }, durationMs / 1000);
      log.info("webhook delivered", { ...fields, httpStatus: res.status, durationMs });
    } catch (err) {
      const durationMs = Math.round(performance.now() - started);
      const httpStatus = err instanceof ExternalApiError ? err.meta.status : undefined;
      // Transient failures (timeouts, connection errors, 408/429/5xx) are retried; other 4xx are not.
      const retryable = err instanceof ExternalApiError ? err.meta.retryable || err.meta.reason === "aborted" : true;
      const final = !retryable || job.attempts >= job.maxAttempts;
      const code = errorCode(err);
      const message = errorMessage(err).slice(0, 1_000);
      const outcome = final ? "failed" : "retry";

      await this.recordAttempt(
        delivery,
        job,
        { outcome, durationMs, httpStatus, errorCode: code, error: message },
        final ? "failed" : "pending",
      );
      webhookDeliveries.inc({ outcome });
      webhookDeliveryDuration.observe({ outcome }, durationMs / 1000);

      if (final) {
        log.error("webhook delivery failed permanently", {
          ...fields,
          httpStatus,
          errorCode: code,
          error: message,
          attempts: job.attempts,
          reason: retryable ? "attempts_exhausted" : "non_retryable_response",
        });
      }
      throw new JobError(`Webhook delivery to ${safeUrl(delivery.endpoint)} failed: ${message}`, code, retryable, { cause: err });
    }
  }

  /** Operator action: re-send a failed delivery with a fresh attempt budget (same idempotency key). */
  async redeliver(id: ObjectId, requestedBy: string): Promise<boolean> {
    const now = new Date();
    const delivery = await this.col.findOneAndUpdate(
      { _id: id, status: "failed" },
      { $set: { status: "pending", attempts: 0, updatedAt: now }, $unset: { failedAt: "" }, $inc: { manualRedeliveries: 1 } },
      { returnDocument: "after" },
    );
    if (!delivery) return false;
    await this.schedule(id, delivery);
    this.log.info("webhook delivery requeued by operator", {
      deliveryId: id.toHexString(),
      eventId: delivery.eventId,
      endpoint: safeUrl(delivery.endpoint),
      requestedBy,
      manualRedeliveries: delivery.manualRedeliveries,
    });
    return true;
  }

  /** Endpoint URLs may carry tokens in their query string, so only the safe form is returned. */
  async getDelivery(id: ObjectId) {
    const delivery = await this.col.findOne({ _id: id }, { projection: SUMMARY_PROJECTION });
    return delivery && { ...delivery, endpoint: safeUrl(delivery.endpoint) };
  }

  /** Index: status_updatedAt / eventId. Also refreshes the sv_webhook_deliveries gauge. */
  async listDeliveries({ status, eventId, limit = 50 }: { status?: WebhookDeliveryStatus; eventId?: string; limit?: number }) {
    const filter: Filter<WebhookDeliveryDoc> = {};
    if (status) filter.status = status;
    if (eventId) filter.eventId = eventId;
    const [items, pending, delivered, failed] = await Promise.all([
      this.col
        .find(filter, { projection: SUMMARY_PROJECTION })
        .sort({ updatedAt: -1 })
        .limit(Math.min(Math.max(limit, 1), 200))
        .toArray(),
      this.col.countDocuments({ status: "pending" }),
      this.col.countDocuments({ status: "delivered" }),
      this.col.countDocuments({ status: "failed" }),
    ]);
    const counts = { pending, delivered, failed };
    for (const [state, n] of Object.entries(counts)) webhookDeliveriesInState.set({ status: state }, n);
    return { counts, items: items.map((d) => ({ ...d, endpoint: safeUrl(d.endpoint) })) };
  }

  private async schedule(deliveryId: ObjectId, delivery: WebhookDeliveryDoc): Promise<void> {
    try {
      const jobId = await this.queue.enqueue<WebhookJobPayload>(
        WEBHOOK_QUEUE,
        WEBHOOK_JOB_TYPE,
        { deliveryId: deliveryId.toHexString() },
        { maxAttempts: delivery.maxAttempts, correlationId: delivery.eventId },
      );
      await this.col.updateOne({ _id: deliveryId }, { $set: { jobId, updatedAt: new Date() } });
    } catch (err) {
      // Without a job nothing would ever retry it; make it visible to operators instead of leaving it pending.
      const now = new Date();
      await this.col
        .updateOne(
          { _id: deliveryId },
          {
            $set: {
              status: "failed",
              failedAt: now,
              updatedAt: now,
              lastError: { code: "ENQUEUE_FAILED", message: errorMessage(err).slice(0, 1_000), at: now },
            },
          },
        )
        .catch(() => undefined);
      this.log.error("could not queue webhook delivery; marked failed", {
        deliveryId: deliveryId.toHexString(),
        eventId: delivery.eventId,
        endpoint: safeUrl(delivery.endpoint),
        err,
      });
      throw err;
    }
  }

  private async recordAttempt(
    delivery: WithId<WebhookDeliveryDoc>,
    job: WithId<JobDoc<WebhookJobPayload>>,
    attempt: Omit<WebhookAttemptEntry, "attempt" | "at">,
    status: WebhookDeliveryStatus,
  ): Promise<void> {
    const now = new Date();
    const entry: WebhookAttemptEntry = { attempt: job.attempts, at: now, ...attempt };
    await this.col.updateOne(
      // Never downgrade a delivery that another run already marked delivered.
      { _id: delivery._id, status: { $ne: "delivered" } },
      {
        $set: {
          status,
          attempts: job.attempts,
          updatedAt: now,
          ...(status === "delivered" ? { deliveredAt: now } : {}),
          ...(status === "failed" ? { failedAt: now } : {}),
          ...(attempt.errorCode
            ? { lastError: { code: attempt.errorCode, message: attempt.error ?? "", httpStatus: attempt.httpStatus, at: now } }
            : {}),
        },
        $push: { attemptHistory: { $each: [entry], $slice: -ATTEMPT_HISTORY_LIMIT } },
      },
    );
  }
}
