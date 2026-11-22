import { test } from "node:test";
import assert from "node:assert/strict";
import { maskVerification, scoreRisk, digest } from "../src/security/policy.js";

test("public masking defaults private, including nested unknown fields", () => {
  const doc = { jobId: "j", storageRef: "secret", error: "private error", creator: "creator", manifest: { email: "secret" } };
  const publicView = maskVerification(doc);
  assert.equal(publicView.visibility, "public");
  for (const key of ["storageRef", "error", "creator", "manifest"]) assert.equal(key in publicView, false);
  assert.equal(maskVerification(doc, true).visibility, "private");
  assert.equal(maskVerification({ ...doc, sharingPolicy: "public" }).creator, "creator");
  assert.equal(doc.manifest.email, "secret");
});
test("scores deduplicate attempts, expire old outcomes and allow recovery", () => {
  const now = new Date(10000);
  const rules = { windowMs: 1000, minimumFailures: 2, pointsPerFailure: 30, reviewScore: 50 };
  const failure = { jobId: "a", status: "failed" as const, updatedAt: now };
  assert.equal(scoreRisk([failure, failure], rules, now).score, 0);
  assert.equal(scoreRisk([failure, { ...failure, jobId: "b" }], rules, now).score, 60);
  assert.equal(scoreRisk([failure, { ...failure, jobId: "b", updatedAt: new Date(0) }], rules, now).score, 0);
  assert.equal(scoreRisk([{ ...failure, status: "certified" }], rules, now).failures, 0);
});
test("canonical integrity survives key ordering but detects tampering", () => {
  assert.equal(digest({ b: 2, a: { d: 4, c: 3 } }), digest({ a: { c: 3, d: 4 }, b: 2 }));
  assert.notEqual(digest({ a: 1 }), digest({ a: 2 }));
});
