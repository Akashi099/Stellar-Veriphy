import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ObjectId } from "mongodb";
import { config } from "./config.js";
import type { CachedVerificationReads, VerificationRepository } from "./db/verifications.js";
import type { HealthMonitor } from "./health/monitor.js";
import type { JobQueue } from "./jobs/queue.js";
import type { Logger } from "./lib/logger.js";
import {
  maintenanceRejected,
  registry,
  requestDuration,
  requestTimeouts,
  slowResponses,
} from "./lib/metrics.js";
import type { MaintenanceMode } from "./maintenance/mode.js";
import { CleanupAlreadyRunningError, type CleanupScheduler } from "./maintenance/scheduler.js";
import type { WebhookService } from "./webhooks/service.js";

export interface ServerDeps {
  health: HealthMonitor;
  queue: JobQueue;
  cleanup: CleanupScheduler;
  verifications: CachedVerificationReads & VerificationRepository;
  maintenance: MaintenanceMode;
  webhooks: WebhookService;
  log: Logger;
}

type Params = Record<string, string>;
type Handler = (req: IncomingMessage, res: ServerResponse, params: Params, url: URL) => Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  admin?: boolean;
  handler: Handler;
}

const STELLAR_ACCOUNT = /^G[A-Z2-7]{55}$/;
const CONTENT_HASH = /^(sha256:)?[a-f0-9]{64}$/i;
const CERT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_BODY_BYTES = 64 * 1024;
/** Requests with these methods are served during maintenance; everything else gets 503. */
const MAINTENANCE_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/**
 * Service-level timeout thresholds (#853). Requests slower than SLOW_REQUEST_MS are counted as
 * slow responses; requests slower than REQUEST_TIMEOUT_MS are additionally counted as timeouts.
 * Both are documented in docs/operations and reviewed alongside the dashboards.
 */
const SLOW_REQUEST_MS = config.http.slowRequestMs;
const REQUEST_TIMEOUT_MS = config.http.requestTimeoutMs;
/** Reindex scopes accepted by POST /api/admin/reindex (#854). */
const REINDEX_SCOPES = new Set(["contentHashes", "verificationIds"]);
const MAX_REINDEX_TARGETS = 500;

class BadRequestError extends Error {}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BadRequestError("Request body too large");
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BadRequestError("Request body must be valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new BadRequestError("Request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

function parseObjectId(raw: string): ObjectId | undefined {
  return /^[a-f0-9]{24}$/i.test(raw) ? new ObjectId(raw) : undefined;
}

function isAdmin(req: IncomingMessage): boolean {
  if (!config.adminToken) return false;
  const header = req.headers.authorization ?? "";
  const expected = Buffer.from(`Bearer ${config.adminToken}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Health, metrics and operator endpoints keep working during maintenance so it can be observed and ended. */
function exemptFromMaintenance(route: Route, pathname: string): boolean {
  return route.admin === true || pathname.startsWith("/health") || pathname === "/metrics";
}

const WEBHOOK_STATUSES = new Set(["pending", "delivered", "failed"]);

/** Verification permissions a user can request access to (#850). */
const ACCESS_PERMISSIONS = new Set(["verify", "publish", "admin"]);
const ACCESS_REQUEST_STATUSES = new Set(["pending", "approved", "denied"]);

interface AccessRequestRecord {
  id: string;
  userId: string;
  permission: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  createdAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
}

/** In-memory store for access requests; replaced by persistence once the backend lands. */
const accessRequests = new Map<string, AccessRequestRecord>();

function accessDenied(res: ServerResponse, permission: string, reason: string): void {
  send(res, 403, {
    error: "Access restricted",
    code: "ACCESS_DENIED",
    permission,
    reason,
    requestAccess: { method: "POST", path: "/api/access-requests", permission },
  });
}

function currentUserId(req: IncomingMessage): string | undefined {
  const header = req.headers["x-user-id"];
  const value = Array.isArray(header) ? header[0] : header;
  return value && value.trim() ? value.trim() : undefined;
}

function permissionState(userId: string, permission: string): { granted: boolean; request: AccessRequestRecord | null } {
  const request =
    [...accessRequests.values()]
      .filter((r) => r.userId === userId && r.permission === permission)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  return { granted: request?.status === "approved", request };
}

export function createHttpServer({ health, queue, cleanup, verifications, maintenance, webhooks, log }: ServerDeps): Server {
  const routes: Route[] = [
    // --- Health (#774) ----------------------------------------------------------
    {
      method: "GET",
      pattern: /^\/health\/live$/,
      handler: async (_req, res) => send(res, 200, { status: "ok" }),
    },
    {
      method: "GET",
      pattern: /^\/health\/ready$/,
      handler: async (_req, res) => {
        const failing = health.failingCritical();
        send(res, failing.length === 0 ? 200 : 503, { ready: failing.length === 0, failing });
      },
    },
    {
      method: "GET",
      pattern: /^\/health$/,
      handler: async (_req, res) => {
        const report = health.snapshot();
        send(res, report.status === "down" ? 503 : 200, report);
      },
    },
    {
      method: "POST",
      pattern: /^\/admin\/health\/(?<name>[a-z0-9_]+)\/check$/,
      admin: true,
      handler: async (_req, res, { name }) => {
        const result = health.run(name);
        if (!result) return send(res, 404, { error: `Unknown dependency "${name}"` });
        send(res, 200, await result);
      },
    },

    // --- Metrics ----------------------------------------------------------------
    {
      method: "GET",
      pattern: /^\/metrics$/,
      handler: async (_req, res) => {
        res.writeHead(200, { "content-type": registry.contentType });
        res.end(await registry.metrics());
      },
    },

    // --- Job queue operations (#771) --------------------------------------------
    {
      method: "GET",
      pattern: /^\/admin\/jobs$/,
      admin: true,
      handler: async (_req, res, _params, url) => {
        const correlationId = url.searchParams.get("correlationId");
        if (correlationId) return send(res, 200, { jobs: await queue.findByCorrelationId(correlationId) });
        send(
          res,
          200,
          await queue.stats({
            retryLoopThreshold: config.jobs.retryLoopThreshold,
            heartbeatOverdueMs: config.jobs.heartbeatMs * 3,
          }),
        );
      },
    },
    {
      method: "GET",
      pattern: /^\/admin\/jobs\/(?<id>[^/]+)$/,
      admin: true,
      handler: async (_req, res, { id }) => {
        const objectId = parseObjectId(id);
        const job = objectId && (await queue.getJob(objectId));
        if (!job) return send(res, 404, { error: "Job not found" });
        send(res, 200, job);
      },
    },
    {
      method: "POST",
      pattern: /^\/admin\/jobs\/(?<id>[^/]+)\/retry$/,
      admin: true,
      handler: async (req, res, { id }, url) => {
        const objectId = parseObjectId(id);
        if (!objectId) return send(res, 404, { error: "Job not found" });
        // Resumes from the last checkpoint unless ?fresh=true (#781).
        const fresh = ["1", "true"].includes(url.searchParams.get("fresh") ?? "");
        const requeued = await queue.retryDead(objectId, req.socket.remoteAddress ?? "unknown", { fresh });
        if (!requeued) return send(res, 409, { error: "Job is not in the dead state" });
        send(res, 202, { requeued: true, fresh });
      },
    },

    // --- Retention (#772) -------------------------------------------------------
    {
      method: "POST",
      pattern: /^\/admin\/maintenance\/cleanup$/,
      admin: true,
      handler: async (_req, res, _params, url) => {
        const dryRun = ["1", "true"].includes(url.searchParams.get("dryRun") ?? "");
        try {
          send(res, 200, { dryRun, tasks: await cleanup.runNow({ dryRun }) });
        } catch (err) {
          if (err instanceof CleanupAlreadyRunningError) return send(res, 409, { error: err.message });
          throw err;
        }
      },
    },

    // --- Public read cache (#779) -----------------------------------------------
    {
      method: "GET",
      pattern: /^\/admin\/cache$/,
      admin: true,
      handler: async (_req, res) => send(res, 200, { entries: verifications.stats() }),
    },
    {
      method: "DELETE",
      pattern: /^\/admin\/cache$/,
      admin: true,
      handler: async (req, res) => {
        const cleared = verifications.clear();
        log.info("public read cache cleared by operator", { cleared, requestedBy: req.socket.remoteAddress ?? "unknown" });
        send(res, 200, { cleared });
      },
    },

    // --- Access requests (#850) -------------------------------------------------
    {
      method: "GET",
      pattern: /^\/api\/access-requests\/me$/,
      handler: async (req, res, _params, url) => {
        const userId = currentUserId(req);
        if (!userId) return send(res, 401, { error: "Missing user identity" });
        const requested = url.searchParams.get("permission");
        if (requested && !ACCESS_PERMISSIONS.has(requested)) {
          return send(res, 400, { error: "Unknown permission" });
        }
        const permissions = [...ACCESS_PERMISSIONS].map((permission) => ({
          permission,
          ...permissionState(userId, permission),
        }));
        const requests = [...accessRequests.values()]
          .filter((r) => r.userId === userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        send(res, 200, { userId, permissions, requests });
      },
    },
    {
      method: "POST",
      pattern: /^\/api\/access-requests$/,
      handler: async (req, res) => {
        const userId = currentUserId(req);
        if (!userId) return send(res, 401, { error: "Missing user identity" });
        const body = await readJson(req);
        const permission = body.permission;
        if (typeof permission !== "string" || !ACCESS_PERMISSIONS.has(permission)) {
          return send(res, 400, { error: "permission must be one of verify, publish, admin" });
        }
        const reason = body.reason;
        if (reason !== undefined && (typeof reason !== "string" || reason.length > 1000)) {
          return send(res, 400, { error: "reason must be a string of at most 1000 characters" });
        }
        const existing = permissionState(userId, permission);
        if (existing.granted) return send(res, 409, { error: "Permission already granted", permission });
        if (existing.request?.status === "pending") {
          return send(res, 202, { request: existing.request, duplicate: true });
        }
        const record: AccessRequestRecord = {
          id: new ObjectId().toHexString(),
          userId,
          permission,
          reason: (reason as string | undefined)?.trim() ?? "",
          status: "pending",
          createdAt: new Date(),
          reviewedAt: null,
          reviewNote: null,
        };
        accessRequests.set(record.id, record);
        log.info("access request submitted", { userId, permission, requestId: record.id });
        send(res, 201, { request: record });
      },
    },
    {
      method: "GET",
      pattern: /^\/admin\/access-requests$/,
      admin: true,
      handler: async (_req, res, _params, url) => {
        const status = url.searchParams.get("status") ?? undefined;
        if (status && !ACCESS_REQUEST_STATUSES.has(status)) {
          return send(res, 400, { error: "status must be one of pending, approved, denied" });
        }
        const items = [...accessRequests.values()]
          .filter((r) => !status || r.status === status)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        send(res, 200, { items });
      },
    },
    {
      method: "POST",
      pattern: /^\/admin\/access-requests\/(?<id>[^/]+)\/review$/,
      admin: true,
      handler: async (req, res, { id }) => {
        const record = accessRequests.get(id);
        if (!record) return send(res, 404, { error: "Access request not found" });
        if (record.status !== "pending") return send(res, 409, { error: "Access request already reviewed" });
        const body = await readJson(req);
        const decision = body.decision;
        if (decision !== "approve" && decision !== "deny") {
          return send(res, 400, { error: "decision must be approve or deny" });
        }
        const note = body.note;
        if (note !== undefined && (typeof note !== "string" || note.length > 1000)) {
          return send(res, 400, { error: "note must be a string of at most 1000 characters" });
        }
        record.status = decision === "approve" ? "approved" : "denied";
        record.reviewedAt = new Date();
        record.reviewNote = (note as string | undefined)?.trim() ?? null;
        log.info("access request reviewed", {
          requestId: record.id,
          userId: record.userId,
          permission: record.permission,
          status: record.status,
          reviewedBy: req.socket.remoteAddress ?? "unknown",
        });
        send(res, 200, { request: record });
      },
    },

    // --- Verification lookups (#773, cached by #779) ----------------------------
    {
      method: "GET",
      pattern: /^\/api\/verifications\/(?<jobId>[^/]+)\/progress$/,
      handler: async (_req, res, { jobId }) => {
        // Not cached: progress changes while the job runs (#781).
        const job = await queue.getProgress(jobId);
        if (!job) return send(res, 404, { error: "No processing job for this verification" });
        send(res, 200, {
          state: job.status,
          stage: job.progress?.stage ?? null,
          percent: job.progress?.percent ?? null,
          completed: job.progress?.completed ?? null,
          total: job.progress?.total ?? null,
          progressUpdatedAt: job.progress?.updatedAt ?? null,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
          resumed: (job.resumedCount ?? 0) > 0,
          nextAttemptAt: job.status === "queued" ? job.runAt : null,
          startedAt: job.startedAt ?? null,
          finishedAt: job.finishedAt ?? null,
          lastErrorCode: job.lastError?.code ?? null,
        });
      },
    },
    // --- Maintenance mode (#787) -----------------------------------------------
    {
      method: "GET",
      pattern: /^\/api\/status\/maintenance$/,
      handler: async (_req, res) => {
        const { enabled, message, startedAt, endsAt } = maintenance.current();
        send(res, 200, enabled ? { enabled, message, startedAt, endsAt } : { enabled });
      },
    },
    {
      method: "GET",
      pattern: /^\/admin\/maintenance$/,
      admin: true,
      handler: async (_req, res) => send(res, 200, await maintenance.refresh()),
    },
    {
      method: "PUT",
      pattern: /^\/admin\/maintenance$/,
      admin: true,
      handler: async (req, res) => {
        const body = await readJson(req);
        const message = body.message;
        if (message !== undefined && (typeof message !== "string" || message.length > 500)) {
          return send(res, 400, { error: "message must be a string of at most 500 characters" });
        }
        let endsAt: Date | undefined;
        if (body.endsAt !== undefined) {
          endsAt = typeof body.endsAt === "string" ? new Date(body.endsAt) : undefined;
          if (!endsAt || Number.isNaN(endsAt.getTime())) return send(res, 400, { error: "endsAt must be an ISO-8601 date" });
          if (endsAt.getTime() <= Date.now()) return send(res, 400, { error: "endsAt must be in the future" });
        }
        if (body.pauseJobs !== undefined && typeof body.pauseJobs !== "boolean") {
          return send(res, 400, { error: "pauseJobs must be a boolean" });
        }
        const state = await maintenance.enable(
          { message: message?.trim() || undefined, endsAt, pauseJobs: body.pauseJobs as boolean | undefined },
          req.socket.remoteAddress ?? "unknown",
        );
        send(res, 200, state);
      },
    },
    {
      method: "DELETE",
      pattern: /^\/admin\/maintenance$/,
      admin: true,
      handler: async (req, res) => {
        const state = await maintenance.disable(req.socket.remoteAddress ?? "unknown");
        // Still on when MAINTENANCE_MODE=true forces it; say so instead of pretending it is off.
        send(res, 200, state.enabled ? { ...state, warning: "Still enabled by MAINTENANCE_MODE; unset it and restart" } : state);
      },
    },

    // --- Webhook deliveries (#789) ---------------------------------------------
    {
      method: "GET",
      pattern: /^\/admin\/webhooks\/deliveries$/,
      admin: true,
      handler: async (_req, res, _params, url) => {
        const status = url.searchParams.get("status") ?? undefined;
        if (status && !WEBHOOK_STATUSES.has(status)) {
          return send(res, 400, { error: "status must be one of pending, delivered, failed" });
        }
        send(
          res,
          200,
          await webhooks.listDeliveries({
            status: status as "pending" | "delivered" | "failed" | undefined,
            eventId: url.searchParams.get("eventId") ?? undefined,
            limit: Number(url.searchParams.get("limit") ?? 50) || 50,
          }),
        );
      },
    },
    {
      method: "GET",
      pattern: /^\/admin\/webhooks\/deliveries\/(?<id>[^/]+)$/,
      admin: true,
      handler: async (_req, res, { id }) => {
        const objectId = parseObjectId(id);
        const delivery = objectId && (await webhooks.getDelivery(objectId));
        if (!delivery) return send(res, 404, { error: "Delivery not found" });
        send(res, 200, delivery);
      },
    },
    {
      method: "POST",
      pattern: /^\/admin\/webhooks\/deliveries\/(?<id>[^/]+)\/redeliver$/,
      admin: true,
      handler: async (req, res, { id }) => {
        const objectId = parseObjectId(id);
        if (!objectId) return send(res, 404, { error: "Delivery not found" });
        const requeued = await webhooks.redeliver(objectId, req.socket.remoteAddress ?? "unknown");
        if (!requeued) return send(res, 409, { error: "Delivery is not in the failed state" });
        send(res, 202, { requeued: true });
      },
    },

    // --- Selective reindexing (#854) --------------------------------------------
    {
      method: "POST",
      pattern: /^\/api\/admin\/reindex$/,
      admin: true,
      handler: async (req, res) => {
        const body = await readJson(req);
        const scope = body.scope;
        if (typeof scope !== "string" || !REINDEX_SCOPES.has(scope)) {
          return send(res, 400, { error: "scope must be one of contentHashes, verificationIds" });
        }
        const targets = body.targets;
        if (!Array.isArray(targets) || targets.length === 0) {
          return send(res, 400, { error: "targets must be a non-empty array" });
        }
        if (targets.length > MAX_REINDEX_TARGETS) {
          return send(res, 400, { error: `targets must contain at most ${MAX_REINDEX_TARGETS} entries` });
        }
        const pattern = scope === "contentHashes" ? CONTENT_HASH : /^[A-Za-z0-9_-]{1,128}$/;
        const invalid = targets.filter((t) => typeof t !== "string" || !pattern.test(t));
        if (invalid.length > 0) {
          return send(res, 400, { error: `invalid ${scope} entries`, invalid: invalid.slice(0, 10) });
        }
        const requestedBy = req.socket.remoteAddress ?? "unknown";
        const job = await queue.enqueueReindex({
          scope: scope as "contentHashes" | "verificationIds",
          targets: targets as string[],
          requestedBy,
        });
        log.info("reindex requested by operator", { jobId: job.id.toHexString(), scope, count: targets.length, requestedBy });
        send(res, 202, {
          jobId: job.id.toHexString(),
          status: job.status,
          progress: job.progress ?? null,
          scope,
          count: targets.length,
        });
      },
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/reindex\/(?<id>[^/]+)$/,
      admin: true,
      handler: async (_req, res, { id }) => {
        const objectId = parseObjectId(id);
        const job = objectId && (await queue.getJob(objectId));
        if (!job) return send(res, 404, { error: "Reindex job not found" });
        send(res, 200, {
          jobId: job.id.toHexString(),
          status: job.status,
          progress: job.progress ?? null,
          attempts: job.attempts,
          lastErrorCode: job.lastError?.code ?? null,
          startedAt: job.startedAt ?? null,
          finishedAt: job.finishedAt ?? null,
        });
      },
    },

    // --- Verification lookups (#773) ---------------------------------------------
    {
      method: "GET",
      pattern: /^\/api\/verifications\/(?<jobId>[^/]+)$/,
      handler: async (req, res, { jobId }) => {
        const userId = currentUserId(req);
        if (userId && !permissionState(userId, "verify").granted) {
          return accessDenied(res, "verify", "Your account does not have verification permissions yet.");
        }
        const status = await verifications.getStatus(jobId);
        if (!status) return send(res, 404, { error: "Verification not found" });
        send(res, 200, status);
      },
    },
    {
      method: "GET",
      pattern: /^\/api\/verifications$/,
      handler: async (_req, res, _params, url) => {
        const contentHash = url.searchParams.get("contentHash");
        const creator = url.searchParams.get("creator");
        if (contentHash) {
          if (!CONTENT_HASH.test(contentHash)) return send(res, 400, { error: "Invalid contentHash" });
          const latest = await verifications.findLatestByContentHash(contentHash);
          return latest ? send(res, 200, latest) : send(res, 404, { error: "No verification for this content" });
        }
        if (creator) {
          if (!STELLAR_ACCOUNT.test(creator)) return send(res, 400, { error: "Invalid creator account" });
          const beforeRaw = url.searchParams.get("before");
          const before = beforeRaw ? new Date(beforeRaw) : undefined;
          if (before && Number.isNaN(before.getTime())) return send(res, 400, { error: "Invalid before cursor" });
          const items = await verifications.listByCreator(creator, {
            limit: Number(url.searchParams.get("limit") ?? 20) || 20,
            before,
          });
          const last = items.at(-1);
          return send(res, 200, { items, nextCursor: last ? last.createdAt.toISOString() : null });
        }
        send(res, 400, { error: "Provide contentHash or creator" });
      },
    },
    {
      method: "GET",
      pattern: /^\/api\/certificates\/(?<certId>[^/]+)$/,
      handler: async (_req, res, { certId }) => {
        if (!CERT_ID.test(certId)) return send(res, 400, { error: "Invalid certId" });
        const verification = await verifications.findByCertId(certId);
        if (!verification) return send(res, 404, { error: "Certificate not found" });
        send(res, 200, verification);
      },
    },
  ];

  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const started = performance.now();

    const route = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
    if (!route) return send(res, 404, { error: "Not found" });
    if (route.admin && !isAdmin(req)) {
      return send(res, config.adminToken ? 401 : 403, {
        error: config.adminToken ? "Unauthorized" : "Admin API disabled; set ADMIN_TOKEN to enable it",
      });
    }

    if (maintenance.isEnabled()) {
      res.setHeader("x-maintenance-mode", "on");
      if (!MAINTENANCE_SAFE_METHODS.has(req.method ?? "") && !exemptFromMaintenance(route, url.pathname)) {
        const { message, endsAt } = maintenance.current();
        maintenanceRejected.inc({ method: req.method ?? "unknown" });
        res.setHeader("retry-after", String(maintenance.retryAfterSeconds(config.maintenance.retryAfterSeconds)));
        return send(res, 503, { error: "Service is under maintenance", code: "MAINTENANCE", message, endsAt });
      }
    }

    const params = { ...(route.pattern.exec(url.pathname)?.groups ?? {}) };
    // Route label for metrics: the pattern source, so cardinality stays bounded (#853).
    const routeLabel = `${route.method} ${route.pattern.source}`;
    route
      .handler(req, res, params, url)
      .catch((err) => {
        if (err instanceof BadRequestError) {
          if (!res.headersSent) send(res, 400, { error: err.message });
          return;
        }
        log.error("request failed", { method: req.method, path: url.pathname, err });
        if (!res.headersSent) send(res, 500, { error: "Internal server error" });
      })
      .finally(() => {
        const durationMs = performance.now() - started;
        requestDuration.observe({ method: req.method ?? "unknown", route: routeLabel }, durationMs / 1000);
        if (durationMs >= REQUEST_TIMEOUT_MS) {
          requestTimeouts.inc({ method: req.method ?? "unknown", route: routeLabel });
          log.warn("request exceeded timeout threshold", { method: req.method, path: url.pathname, durationMs: Math.round(durationMs) });
        } else if (durationMs >= SLOW_REQUEST_MS) {
          slowResponses.inc({ method: req.method ?? "unknown", route: routeLabel });
        }
        if (!url.pathname.startsWith("/health") && url.pathname !== "/metrics") {
          log.debug("request", {
            method: req.method,
            path: url.pathname,
            status: res.statusCode,
            durationMs: Math.round(durationMs),
          });
        }
      });
  });
}
