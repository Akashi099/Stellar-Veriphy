import { createHash } from "node:crypto";

import type { JobDoc, VerificationDoc, VerificationSessionDoc, VerificationStatus } from "../db/collections.js";
import { encodeEd25519PublicKey } from "./strkey.js";

/**
 * Deterministic, synthetic fixtures for local and staging databases (#810).
 *
 * Nothing here comes from production. Accounts are derived from fixed labels (their secret keys
 * are never generated), hashes are digests of those labels, and every id is prefixed `fixture-`
 * so it cannot collide with real data. Given the same `now`, the output is identical on every run.
 *
 * Every document carries `isFixture: true`. The seed script deletes only documents with that flag
 * before inserting, so re-seeding never touches real records.
 */

export const FIXTURE_FLAG = "isFixture" as const;

export type Fixture<T> = T & { [FIXTURE_FLAG]: true };

export interface SeedFixtures {
  creators: string[];
  verifications: Fixture<VerificationDoc>[];
  sessions: Fixture<VerificationSessionDoc>[];
  jobs: Fixture<JobDoc>[];
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** Fixed labels give fixed accounts. Four creators is enough to show per-user listings. */
const CREATOR_LABELS = ["alice", "bruno", "chidi", "dana"] as const;

/** Verification states to cover, in order. Each appears several times across the fixtures. */
const VERIFICATION_CYCLE: VerificationStatus[] = ["certified", "pending", "processing", "failed"];
const VERIFICATION_COUNT = 12;

function digest(label: string): string {
  return createHash("sha256").update(`fixture:${label}`).digest("hex");
}

function accountFor(label: string): string {
  const key = createHash("sha256").update(`fixture-account:${label}`).digest();
  return encodeEd25519PublicKey(new Uint8Array(key));
}

function fixture<T extends object>(doc: T): Fixture<T> {
  return { ...doc, [FIXTURE_FLAG]: true };
}

/** Builds the full fixture set relative to `now`, so timestamps look recent in local environments. */
export function buildSeedFixtures(now: Date): SeedFixtures {
  const creators = CREATOR_LABELS.map(accountFor);
  const at = (msBefore: number) => new Date(now.getTime() - msBefore);

  const verifications: Fixture<VerificationDoc>[] = [];
  for (let i = 0; i < VERIFICATION_COUNT; i++) {
    const status = VERIFICATION_CYCLE[i % VERIFICATION_CYCLE.length] as VerificationStatus;
    const createdAt = at((VERIFICATION_COUNT - i) * 2 * HOUR_MS);
    const terminal = status === "certified" || status === "failed";
    const completedAt = terminal ? new Date(createdAt.getTime() + 30 * MINUTE_MS) : undefined;

    verifications.push(
      fixture<VerificationDoc>({
        jobId: `fixture-job-${i}`,
        contentHash: digest(`content-${i}`),
        manifestHash: digest(`manifest-${i}`),
        creator: creators[i % creators.length] as string,
        storageRef: `fixture://storage/${i}`,
        status,
        createdAt,
        updatedAt: completedAt ?? new Date(createdAt.getTime() + 5 * MINUTE_MS),
        ...(status === "certified" && { certId: `fixture-cert-${i}`, txHash: digest(`tx-${i}`) }),
        ...(status === "failed" && { error: "Fixture: manifest validation failed", txHash: digest(`tx-${i}`) }),
        ...(completedAt && { completedAt }),
      }),
    );
  }

  // Sessions cover each state. The "submitted" one is linked to a pending verification, so the
  // cleanup safety check (keep sessions whose verification is still in flight) has a case to test.
  const sessionStates: VerificationSessionDoc["state"][] = [
    "open",
    "submitted",
    "completed",
    "abandoned",
    "expired",
    "open",
  ];
  const sessions: Fixture<VerificationSessionDoc>[] = sessionStates.map((state, i) => {
    const linked = verifications.find((v) => v.status === "pending") ?? verifications[0];
    const completed = verifications.find((v) => v.status === "certified");
    const verificationJobId =
      state === "submitted" ? linked?.jobId : state === "completed" ? completed?.jobId : undefined;
    return fixture<VerificationSessionDoc>({
      sessionId: `fixture-session-${i}`,
      creator: creators[i % creators.length] as string,
      state,
      createdAt: at((sessionStates.length - i) * 3 * HOUR_MS),
      lastActivityAt: at((i + 1) * 4 * HOUR_MS),
      ...(verificationJobId && { verificationJobId }),
    });
  });

  // One job per status the worker can leave behind.
  const jobStatuses: JobDoc["status"][] = ["queued", "running", "succeeded", "dead"];
  const jobs: Fixture<JobDoc>[] = jobStatuses.map((status, i) => {
    const createdAt = at((i + 1) * HOUR_MS);
    const finished = status === "succeeded" || status === "dead";
    const lastError =
      status === "dead"
        ? {
            attempt: 5,
            at: createdAt,
            workerId: "fixture-worker",
            durationMs: 1200,
            code: "FIXTURE_ERROR",
            message: "Fixture: retries exhausted",
          }
        : undefined;
    return fixture<JobDoc>({
      queue: "verification",
      type: "verify-content",
      payload: { jobId: `fixture-job-${i}` },
      status,
      attempts: status === "queued" ? 0 : status === "dead" ? 5 : 1,
      maxAttempts: 5,
      runAt: createdAt,
      createdAt,
      updatedAt: new Date(createdAt.getTime() + MINUTE_MS),
      correlationId: `fixture-job-${i}`,
      errorHistory: lastError ? [lastError] : [],
      ...(lastError && { lastError }),
      ...(finished && { finishedAt: new Date(createdAt.getTime() + MINUTE_MS) }),
      ...(status === "running" && { lockedBy: "fixture-worker", lockedAt: createdAt, heartbeatAt: createdAt }),
      stalledCount: 0,
    });
  });

  return { creators, verifications, sessions, jobs };
}

/** Counts fixtures by status, for the seed report and for tests that check coverage. */
export function summarizeFixtures(fixtures: SeedFixtures): Record<string, Record<string, number>> {
  const count = (items: { status?: string; state?: string }[], key: "status" | "state") =>
    items.reduce<Record<string, number>>((acc, item) => {
      const value = item[key] ?? "unknown";
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});
  return {
    verifications: count(fixtures.verifications, "status"),
    sessions: count(fixtures.sessions, "state"),
    jobs: count(fixtures.jobs, "status"),
  };
}
