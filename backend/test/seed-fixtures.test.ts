/**
 * Tests for the synthetic seed fixtures (#810). Run with:
 *   pnpm --filter backend test:seed
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { FIXTURE_FLAG, buildSeedFixtures, summarizeFixtures } from "../src/fixtures/seed-data.js";
import { encodeEd25519PublicKey, isValidEd25519PublicKey } from "../src/fixtures/strkey.js";

const NOW = new Date("2026-10-19T12:00:00.000Z");
const fixtures = buildSeedFixtures(NOW);

test("StrKey encoder produces valid G... addresses and rejects bad checksums", () => {
  const address = encodeEd25519PublicKey(new Uint8Array(32));
  assert.equal(address.length, 56);
  assert.match(address, /^G[A-Z2-7]{55}$/);
  assert.equal(isValidEd25519PublicKey(address), true);

  const corrupted = address.slice(0, -1) + (address.endsWith("A") ? "B" : "A");
  assert.equal(isValidEd25519PublicKey(corrupted), false);
  assert.equal(isValidEd25519PublicKey("not-an-address"), false);
});

test("StrKey encoder rejects keys that are not 32 bytes", () => {
  assert.throws(() => encodeEd25519PublicKey(new Uint8Array(31)), /must be 32 bytes/);
});

test("every creator is a valid public key, never a secret key", () => {
  assert.ok(fixtures.creators.length >= 3, "expect several representative users");
  for (const creator of fixtures.creators) {
    assert.equal(isValidEd25519PublicKey(creator), true, `${creator} is not a valid G... address`);
    assert.notEqual(creator[0], "S");
  }
});

test("output is deterministic for a given reference time", () => {
  assert.deepEqual(buildSeedFixtures(NOW), fixtures);
});

test("every document is flagged so the seed script can reset only fixtures", () => {
  const all = [...fixtures.verifications, ...fixtures.sessions, ...fixtures.jobs];
  for (const doc of all) {
    assert.equal((doc as Record<string, unknown>)[FIXTURE_FLAG], true);
  }
});

test("ids are prefixed so they cannot collide with real data", () => {
  const ids = [
    ...fixtures.verifications.map((v) => v.jobId),
    ...fixtures.sessions.map((s) => s.sessionId),
    ...fixtures.verifications.flatMap((v) => (v.certId ? [v.certId] : [])),
  ];
  for (const id of ids) assert.ok(id.startsWith("fixture-"), `${id} is missing the fixture- prefix`);
  assert.equal(new Set(ids).size, ids.length, "ids must be unique");
});

test("verifications cover every status", () => {
  const { verifications } = summarizeFixtures(fixtures);
  for (const status of ["pending", "processing", "certified", "failed"]) {
    assert.ok((verifications[status] ?? 0) > 0, `no ${status} verification`);
  }
});

test("sessions cover every state, and a submitted session has an in-flight verification", () => {
  const { sessions } = summarizeFixtures(fixtures);
  for (const state of ["open", "submitted", "completed", "abandoned", "expired"]) {
    assert.ok((sessions[state] ?? 0) > 0, `no ${state} session`);
  }

  const submitted = fixtures.sessions.find((s) => s.state === "submitted");
  const linked = fixtures.verifications.find((v) => v.jobId === submitted?.verificationJobId);
  assert.ok(linked, "submitted session must link to a verification");
  assert.ok(linked.status === "pending" || linked.status === "processing");
});

test("jobs cover every status the worker can leave behind", () => {
  const { jobs } = summarizeFixtures(fixtures);
  for (const status of ["queued", "running", "succeeded", "dead"]) {
    assert.ok((jobs[status] ?? 0) > 0, `no ${status} job`);
  }
});

test("certified verifications have a certificate and transaction reference; others do not", () => {
  for (const v of fixtures.verifications) {
    if (v.status === "certified") {
      assert.ok(v.certId, `${v.jobId} is certified without certId`);
      assert.ok(v.txHash, `${v.jobId} is certified without txHash`);
    } else {
      assert.equal(v.certId, undefined, `${v.jobId} is ${v.status} but has a certId`);
    }
  }
});

test("certificate ids are unique, matching the certId unique index", () => {
  const certIds = fixtures.verifications.flatMap((v) => (v.certId ? [v.certId] : []));
  assert.ok(certIds.length > 0);
  assert.equal(new Set(certIds).size, certIds.length);
});

test("sessions and jobs reference only fixture verifications", () => {
  const jobIds = new Set(fixtures.verifications.map((v) => v.jobId));
  for (const s of fixtures.sessions) {
    if (s.verificationJobId) assert.ok(jobIds.has(s.verificationJobId), `${s.sessionId} links to unknown job`);
  }
  for (const j of fixtures.jobs) {
    const jobId = (j.payload as { jobId: string }).jobId;
    assert.ok(jobIds.has(jobId), `job ${jobId} links to unknown verification`);
  }
});

test("no timestamp is in the future relative to the reference time", () => {
  const all = [
    ...fixtures.verifications.flatMap((v) => [v.createdAt, v.updatedAt, v.completedAt].filter(Boolean)),
    ...fixtures.sessions.flatMap((s) => [s.createdAt, s.lastActivityAt]),
    ...fixtures.jobs.flatMap((j) => [j.createdAt, j.updatedAt, j.runAt]),
  ] as Date[];
  for (const date of all) assert.ok(date.getTime() <= NOW.getTime(), `${date.toISOString()} is in the future`);
});
