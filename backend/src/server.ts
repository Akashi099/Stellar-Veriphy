import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ObjectId } from "mongodb";
import { config } from "./config.js";
import type { CachedVerificationReads } from "./db/verifications.js";
import type { HealthMonitor } from "./health/monitor.js";
import type { JobQueue } from "./jobs/queue.js";
import type { Logger } from "./lib/logger.js";
import { registry } from "./lib/metrics.js";
import { CleanupAlreadyRunningError, type CleanupScheduler } from "./maintenance/scheduler.js";

export interface ServerDeps {
  health: HealthMonitor;
  queue: JobQueue;
  cleanup: CleanupScheduler;
  verifications: CachedVerificationReads;
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

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(payload);
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

export function createHttpServer({ health, queue, cleanup, verifications, log }: ServerDeps): Server {
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
      handler: async (req, res, { id }) => {
        const objectId = parseObjectId(id);
        if (!objectId) return send(res, 404, { error: "Job not found" });
        const requeued = await queue.retryDead(objectId, req.socket.remoteAddress ?? "unknown");
        if (!requeued) return send(res, 409, { error: "Job is not in the dead state" });
        send(res, 202, { requeued: true });
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

    // --- Verification lookups (#773, cached by #779) ----------------------------
    {
      method: "GET",
      pattern: /^\/api\/verifications\/(?<jobId>[^/]+)$/,
      handler: async (_req, res, { jobId }) => {
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

    const params = { ...(route.pattern.exec(url.pathname)?.groups ?? {}) };
    route
      .handler(req, res, params, url)
      .catch((err) => {
        log.error("request failed", { method: req.method, path: url.pathname, err });
        if (!res.headersSent) send(res, 500, { error: "Internal server error" });
      })
      .finally(() => {
        if (!url.pathname.startsWith("/health") && url.pathname !== "/metrics") {
          log.debug("request", {
            method: req.method,
            path: url.pathname,
            status: res.statusCode,
            durationMs: Math.round(performance.now() - started),
          });
        }
      });
  });
}
