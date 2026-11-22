import { ApiError } from "@/lib/api/errors";
import { safeVerificationFailure, verificationAction } from "@/lib/verificationErrors";
import type { Actor } from "./auth";
import { withKeyLock } from "./write-concurrency";
import { randomUUID } from "crypto";
import {
  hashManifest,
  validateUploadMetadata,
  type VerificationJob,
  type VerificationJobView,
} from "@stellarveriphy/shared";
import { collection } from "./json-collection";
import { getUpload } from "./uploads";

const jobs = () => collection<VerificationJob>("verification-jobs");

// Number of recent completed jobs used to estimate processing time.
const DURATION_SAMPLE_SIZE = 20;

const worker = globalThis as unknown as { __veriphyWorker?: { running: boolean; recovered: boolean } };
worker.__veriphyWorker ??= { running: false, recovered: false };
const state = worker.__veriphyWorker;
const active = globalThis as typeof globalThis & { __veriphyJobControllers?: Map<string, AbortController> };
active.__veriphyJobControllers ??= new Map();
const controllers = active.__veriphyJobControllers;
const jobLock = (id: string) => `verification-job:${id}`;

// Jobs left "processing" by a previous server process never finished; put them back in the queue.
async function recoverInterruptedJobs() {
  if (state.recovered) return;
  state.recovered = true;
  for (const job of await jobs().all()) {
    if (job.status === "processing") {
      await withKeyLock(jobLock(job.id), async () => {
        const current = await jobs().get(job.id);
        if (current?.status === "processing") {
          const { startedAt: _startedAt, ...rest } = current;
          await jobs().put({ ...rest, status: "pending" });
        }
      });
    }
  }
}

// The verification work for one job. Re-checks the stored upload against the
// current shared rules and confirms its manifest hash.
// On-chain anchoring via the provenance contract belongs here once it is wired up.
async function verify(job: VerificationJob, signal: AbortSignal): Promise<NonNullable<VerificationJob["result"]>> {
  signal.throwIfAborted();
  const upload = await getUpload(job.uploadId);
  signal.throwIfAborted();
  if (!upload) throw Object.assign(new Error("Upload unavailable"), { code: "INVALID_INPUT" });

  const { id, createdAt, manifestHash, ...metadata } = upload;
  const check = validateUploadMetadata(metadata);
  if (!check.ok) {
    throw Object.assign(new Error("Invalid metadata"), { code: "INVALID_INPUT" });
  }
  const recomputed = await hashManifest(check.value.manifest);
  if (recomputed !== manifestHash) {
    throw Object.assign(new Error("Manifest mismatch"), { code: "INVALID_INPUT" });
  }
  signal.throwIfAborted();
  return { manifestHash };
}

async function runWorker() {
  if (state.running) return;
  state.running = true;
  try {
    await recoverInterruptedJobs();
    for (;;) {
      const next = (await jobs().all())
        .filter((j) => j.status === "pending")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!next) break;

      const controller = new AbortController();
      const started = await withKeyLock(jobLock(next.id), async () => {
        const current = await jobs().get(next.id);
        if (current?.status !== "pending") return null;
        const started: VerificationJob = { ...current, status: "processing", startedAt: new Date().toISOString() };
        await jobs().put(started);
        controllers.set(next.id, controller);
        return started;
      });
      if (!started) continue;
      try {
        const result = await verify(started, controller.signal);
        await withKeyLock(jobLock(started.id), async () => {
          const current = await jobs().get(started.id);
          if (current?.status !== "processing" || controller.signal.aborted) return;
          // Local verification has no irreversible external effect. Publishing the result and
          // cancellation compete under this lock. External anchoring must add a durable fence.
          await jobs().put({ ...current, status: "certified", completedAt: new Date().toISOString(), result });
        });
      } catch (error) {
        await withKeyLock(jobLock(started.id), async () => {
          const current = await jobs().get(started.id);
          if (current?.status !== "processing" || controller.signal.aborted) return;
          const failure = safeVerificationFailure((error as { code?: unknown } | null)?.code);
          await jobs().put({ ...current, status: "failed", completedAt: new Date().toISOString(), failure });
        });
      } finally { controllers.delete(started.id); }
    }
  } catch (err) {
    console.error("[verification worker]", err);
  } finally {
    state.running = false;
  }
}

export async function enqueueJob(uploadId: string): Promise<VerificationJob> {
  const job: VerificationJob = {
    id: randomUUID(),
    uploadId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await jobs().put(job);
  void runWorker();
  return job;
}

function toView(job: VerificationJob, all: VerificationJob[]): VerificationJobView {
  const durations = all
    .filter((j) => j.status === "certified" || j.status === "failed")
    .filter((j) => j.startedAt && j.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
    .slice(0, DURATION_SAMPLE_SIZE)
    .map((j) => Date.parse(j.completedAt!) - Date.parse(j.startedAt!));
  const averageDurationMs = durations.length
    ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
    : null;

  let queuePosition: number | null = null;
  let estimatedWaitMs: number | null = null;
  if (job.status === "pending") {
    const pending = all
      .filter((j) => j.status === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    queuePosition = pending.findIndex((j) => j.id === job.id) + 1;
    // Jobs are processed one at a time: wait for those ahead, the one running, and this one.
    const running = all.some((j) => j.status === "processing") ? 1 : 0;
    if (averageDurationMs !== null) estimatedWaitMs = (queuePosition + running) * averageDurationMs;
  } else if (job.status === "processing" && averageDurationMs !== null) {
    const elapsed = Date.now() - Date.parse(job.startedAt!);
    estimatedWaitMs = Math.max(0, averageDurationMs - elapsed);
  }

  return { ...publicJob(job), queuePosition, estimatedWaitMs, averageDurationMs };
}

export async function getJobViews(ids: string[]): Promise<VerificationJobView[]> {
  await recoverInterruptedJobs();
  const all = await jobs().all();
  // Restart the worker if pending jobs exist but nothing is processing them (e.g. after a restart).
  if (!state.running && all.some((j) => j.status === "pending")) void runWorker();
  const byId = new Map(all.map((j) => [j.id, j]));
  return ids.flatMap((id) => {
    const job = byId.get(id);
    return job ? [toView(job, all)] : [];
  });
}

// Jobs for a set of uploads, e.g. every job that belongs to one account's uploads.
export async function findJobsForUploads(uploadIds: ReadonlySet<string>): Promise<VerificationJob[]> {
  return (await jobs().all()).filter((job) => uploadIds.has(job.uploadId)).map(publicJob);
}

function publicJob(job: VerificationJob): VerificationJob {
  const { error: _privateError, failure: _failure, ...safe } = job;
  if (job.status !== "failed" && job.status !== "cancelled") return safe;
  const failure = safeVerificationFailure(job.status === "cancelled" ? "CANCELLED" : job.failure?.version === 1 ? job.failure.code : undefined);
  return { ...safe, failure, error: verificationAction(failure) };
}

/** File-backed worker is single-process; MongoDB backend uses transactional cancellation. */
export async function cancelJob(id: string, actor: Actor): Promise<VerificationJob> {
  return withKeyLock(jobLock(id), async () => {
    const job = await jobs().get(id);
    if (!job) throw new ApiError("NOT_FOUND");
    const upload = await getUpload(job.uploadId);
    if (actor.role !== "admin" && (!upload || actor.role !== "user" || actor.subject !== upload.creator)) throw new ApiError("FORBIDDEN");
    if (job.status === "cancelled") return publicJob(job);
    if (job.status !== "pending" && job.status !== "processing") throw new ApiError("CONFLICT", { message: "Verification has already finished." });
    const now = new Date().toISOString();
    const { error: _error, result: _result, failure: _failure, ...rest } = job;
    const cancelled: VerificationJob = { ...rest, status: "cancelled", cancelledAt: now, completedAt: now };
    await jobs().put(cancelled);
    controllers.get(id)?.abort();
    return publicJob(cancelled);
  });
}
