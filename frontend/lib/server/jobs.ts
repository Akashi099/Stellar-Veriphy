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

// Jobs left "processing" by a previous server process never finished; put them back in the queue.
async function recoverInterruptedJobs() {
  if (state.recovered) return;
  state.recovered = true;
  for (const job of await jobs().all()) {
    if (job.status === "processing") {
      await jobs().put({ ...job, status: "pending", startedAt: undefined });
    }
  }
}

// The verification work for one job. Re-checks the stored upload against the
// current shared rules and confirms its manifest hash.
// On-chain anchoring via the provenance contract belongs here once it is wired up.
async function verify(job: VerificationJob): Promise<VerificationJob["result"]> {
  const upload = await getUpload(job.uploadId);
  if (!upload) throw new Error("The upload for this job no longer exists.");

  const { id, createdAt, manifestHash, ...metadata } = upload;
  const check = validateUploadMetadata(metadata);
  if (!check.ok) {
    throw new Error(`Upload metadata failed validation: ${check.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`);
  }
  const recomputed = await hashManifest(check.value.manifest);
  if (recomputed !== manifestHash) {
    throw new Error("The stored manifest hash does not match the manifest contents.");
  }
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

      const started: VerificationJob = { ...next, status: "processing", startedAt: new Date().toISOString() };
      await jobs().put(started);
      try {
        const result = await verify(started);
        await jobs().put({ ...started, status: "certified", completedAt: new Date().toISOString(), result });
      } catch (err) {
        const error = err instanceof Error ? err.message : "Verification failed for an unknown reason.";
        await jobs().put({ ...started, status: "failed", completedAt: new Date().toISOString(), error });
      }
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

  return { ...job, queuePosition, estimatedWaitMs, averageDurationMs };
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
  return (await jobs().all()).filter((job) => uploadIds.has(job.uploadId));
}
