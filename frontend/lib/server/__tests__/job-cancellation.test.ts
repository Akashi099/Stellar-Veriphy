import { collection } from "../json-collection";
import { cancelJob, enqueueJob, findJobsForUploads } from "../jobs";
import { hashManifest } from "@stellarveriphy/shared";
import type { VerificationJob } from "@stellarveriphy/shared";

jest.mock("../json-collection", () => {
  const records = new Map<string, unknown>();
  return { collection: () => ({ get: async (id: string) => records.get(id), all: async () => [...records.values()], put: async (record: { id: string }) => { records.set(record.id, record); } }) };
});
jest.mock("../uploads", () => ({ getUpload: async () => ({ id: "upload", creator: "owner", createdAt: "2026-01-01", manifestHash: "hash", manifest: {} }) }));
jest.mock("@stellarveriphy/shared", () => ({
  hashManifest: jest.fn(), validateUploadMetadata: (value: unknown) => ({ ok: true, value }),
}));
const jobs = () => collection<VerificationJob>("verification-jobs");
let id = 0;
async function seed(status: VerificationJob["status"] = "pending") {
  const job: VerificationJob = { id: "job-" + ++id, uploadId: "upload", status, createdAt: new Date().toISOString() };
  await jobs().put(job); return job;
}
test("only the upload owner or admin can cancel, including idempotent requests", async () => {
  const job = await seed();
  await expect(cancelJob(job.id, { role: "user", subject: "stranger" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(cancelJob(job.id, { role: "moderator", subject: "owner" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await cancelJob(job.id, { role: "user", subject: "owner" })).status).toBe("cancelled");
  expect((await cancelJob(job.id, { role: "admin", subject: "operator" })).status).toBe("cancelled");
  await expect(cancelJob(job.id, { role: "user", subject: "stranger" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
test("completed verification cannot be cancelled", async () => {
  const job = await seed("certified");
  await expect(cancelJob(job.id, { role: "admin", subject: "operator" })).rejects.toMatchObject({ code: "CONFLICT" });
});
test("an in-flight hash result becomes a no-op after cancellation", async () => {
  let resolveHash!: (value: string) => void; let hashing!: () => void;
  const started = new Promise<void>((resolve) => { hashing = resolve; });
  jest.mocked(hashManifest).mockImplementationOnce(() => { hashing(); return new Promise<string>((resolve) => { resolveHash = resolve; }); });
  const job = await enqueueJob("upload"); await started;
  await cancelJob(job.id, { role: "user", subject: "owner" });
  resolveHash("hash");
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const current = await jobs().get(job.id);
  expect(current?.status).toBe("cancelled"); expect(current?.result).toBeUndefined();
});
test("public local job reads replace legacy private errors with a versioned code", async () => {
  const job = await seed("failed"); await jobs().put({ ...job, error: "private provider credential" });
  const current = (await findJobsForUploads(new Set(["upload"]))).find((item) => item.id === job.id);
  expect(current?.failure).toMatchObject({ version: 1, code: "INTERNAL_ERROR" });
  expect(JSON.stringify(current)).not.toContain("credential");
});
