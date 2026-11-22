import assert from "node:assert/strict";
import { test } from "node:test";
import { publicVerification, verificationError, verificationErrorFromFailure } from "../src/verification-errors.js";
test("versioned taxonomy maps stable provider failures", () => {
  assert.equal(verificationErrorFromFailure({ code: "EXTERNAL_TIMEOUT" }).code, "PROVIDER_TIMEOUT");
  assert.equal(verificationError("PROVIDER_TIMEOUT").version, 1);
  assert.equal(verificationError("toString").code, "INTERNAL_ERROR");
});
test("public failures never expose free-form legacy errors or arbitrary codes", () => {
  const safe = publicVerification({ status: "failed", error: "secret provider credential", errorCode: "secret-code" });
  assert.equal(safe.failure?.code, "INTERNAL_ERROR");
  assert.ok(!JSON.stringify(safe).includes("secret"));
  assert.equal(publicVerification({ status: "cancelled", error: "old failure" }).failure?.code, "CANCELLED");
});
