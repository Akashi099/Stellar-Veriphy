import assert from "node:assert/strict";
import { test } from "node:test";
import { ExternalApiClient } from "../src/lib/http.js";
import { providerCalls } from "../src/lib/metrics.js";
const policy = { timeoutMs: 100, totalTimeoutMs: 200, retries: 0, retryBaseDelayMs: 1, retryMaxDelayMs: 1 };
test("JSON parse failure is one failed logical call, labels never include URLs", async () => {
  const original = globalThis.fetch;
  providerCalls.reset();
  globalThis.fetch = async () => new Response("not JSON", { status: 200 });
  try {
    await assert.rejects(new ExternalApiClient("arbitrary-secret-service", policy).json("https://example.com?secret=hidden"));
    const values = (await providerCalls.get()).values;
    assert.equal(values.length, 1);
    assert.equal(values[0]?.value, 1);
    assert.equal(values[0]?.labels.provider, "other");
    assert.equal(values[0]?.labels.outcome, "invalid_response");
    assert.ok(!JSON.stringify(values).includes("secret"));
  } finally { globalThis.fetch = original; }
});
test("health probes and verification traffic remain distinguishable", async () => {
  const original = globalThis.fetch; providerCalls.reset();
  globalThis.fetch = async () => new Response("{}", { status: 200 });
  try {
    await new ExternalApiClient("tee_oracle", policy).json("https://example.com");
    await new ExternalApiClient("tee_oracle", policy, undefined, "probe").json("https://example.com");
    const values = (await providerCalls.get()).values;
    assert.deepEqual(values.map((value) => value.labels.traffic).sort(), ["probe", "verification"]);
    assert.ok(values.every((value) => ["test", "production"].includes(String(value.labels.environment))));
  } finally { globalThis.fetch = original; }
});
