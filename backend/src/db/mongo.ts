import { MongoClient, type CommandStartedEvent, type Db, type Document } from "mongodb";
import { config } from "../config.js";
import type { Logger } from "../lib/logger.js";
import { dbCommandDuration, dbSlowCommands } from "../lib/metrics.js";
import { withRetry } from "../lib/retry.js";

/** Commands worth timing; driver/handshake chatter is ignored. */
const TRACKED_COMMANDS = new Set([
  "find",
  "getMore",
  "aggregate",
  "count",
  "distinct",
  "insert",
  "update",
  "delete",
  "findAndModify",
  "createIndexes",
]);

interface PendingCommand {
  command: string;
  collection: string;
  /** Field names only — never values, which may contain creator keys or hashes. */
  shape?: Document;
}

function describe(event: CommandStartedEvent): PendingCommand {
  const cmd = event.command;
  const target = cmd[event.commandName];
  const collection = typeof target === "string" ? target : typeof cmd.collection === "string" ? cmd.collection : "unknown";
  const shape: Document = {};
  if (cmd.filter) shape.filter = Object.keys(cmd.filter);
  if (cmd.sort) shape.sort = cmd.sort;
  if (cmd.query) shape.query = Object.keys(cmd.query);
  if (Array.isArray(cmd.pipeline)) shape.pipeline = cmd.pipeline.map((stage: Document) => Object.keys(stage)[0]);
  if (Array.isArray(cmd.updates)) shape.updates = cmd.updates.map((u: Document) => Object.keys(u.q ?? {}));
  if (Array.isArray(cmd.deletes)) shape.deletes = cmd.deletes.map((d: Document) => Object.keys(d.q ?? {}));
  return { command: event.commandName, collection, shape };
}

/**
 * Records per-command latency metrics and logs slow commands with their query shape,
 * so slow verification lookups can be traced to a collection + filter.
 */
function instrument(client: MongoClient, log: Logger): void {
  const pending = new Map<number, PendingCommand>();
  const slowMs = config.mongo.slowQueryMs;

  client.on("commandStarted", (event) => {
    if (TRACKED_COMMANDS.has(event.commandName)) pending.set(event.requestId, describe(event));
  });

  const finish = (requestId: number, durationMs: number, outcome: "ok" | "error") => {
    const info = pending.get(requestId);
    if (!info) return;
    pending.delete(requestId);
    dbCommandDuration.observe({ command: info.command, collection: info.collection, outcome }, durationMs / 1000);
    if (slowMs > 0 && durationMs >= slowMs) {
      dbSlowCommands.inc({ command: info.command, collection: info.collection });
      log.warn("slow mongodb command", { ...info, durationMs, thresholdMs: slowMs });
    }
  };

  client.on("commandSucceeded", (event) => finish(event.requestId, event.duration, "ok"));
  client.on("commandFailed", (event) => finish(event.requestId, event.duration, "error"));
}

export async function connectMongo(log: Logger): Promise<{ client: MongoClient; db: Db }> {
  const client = await withRetry(
    async () => {
      const candidate = new MongoClient(config.mongo.uri, {
        appName: "stellarveriphy-backend",
        serverSelectionTimeoutMS: 5_000,
        monitorCommands: true,
      });
      instrument(candidate, log);
      try {
        await candidate.connect();
        return candidate;
      } catch (err) {
        await candidate.close().catch(() => undefined);
        throw err;
      }
    },
    {
      retries: 5,
      baseDelayMs: 1_000,
      maxDelayMs: 15_000,
      onRetry: (err, attempt, delayMs) => log.warn("mongodb connection failed, retrying", { attempt, delayMs, err }),
    },
  );
  log.info("connected to mongodb", { db: config.mongo.dbName });
  return { client, db: client.db(config.mongo.dbName) };
}
