import assert from "node:assert/strict";
import { test } from "node:test";
import { assertProviderConfiguration, validateProviderConfiguration, type ProviderConfiguration } from "../src/provider-config.js";
function valid(): ProviderConfiguration {
  return { stellar: { network: "testnet", passphrase: "Test SDF Network ; September 2015", horizonUrl: "https://horizon-testnet.stellar.org", sorobanRpcUrl: "https://soroban-testnet.stellar.org" }, integrations: {}, health: { criticalDependencies: ["mongodb"], timeoutMs: 5000, intervalMs: 30000 }, externalApi: { timeoutMs: 10000, totalTimeoutMs: 30000, retries: 2, retryBaseDelayMs: 250, retryMaxDelayMs: 5000 }, trafficEnvironment: "test" };
}
test("optional integrations can be disabled, critical integrations must be configured", () => {
  assert.deepEqual(validateProviderConfiguration(valid()), []);
  const config = valid(); config.health.criticalDependencies.push("tee_oracle");
  assert.deepEqual(validateProviderConfiguration(config), [{ setting: "ORACLE_HEALTH_URL", code: "MISSING" }]);
});
test("configuration errors never echo credentials or malformed values", () => {
  const config = valid(); config.integrations.kmsHealthUrl = "https://user:secret@example.com/private?key=secret";
  assert.throws(() => assertProviderConfiguration(config), (error: Error) => error.message.includes("KMS_HEALTH_URL") && !error.message.includes("secret") && !error.message.includes("example.com"));
});
test("rejects incompatible network, transport, budgets and retry policies", () => {
  const config = valid(); config.stellar.network = "mainnet"; config.trafficEnvironment = "production";
  config.integrations.ipfsApiUrl = "http://localhost:5001";
  config.externalApi.totalTimeoutMs = 1; config.externalApi.retries = 6;
  const settings = validateProviderConfiguration(config).map((issue) => issue.setting);
  for (const setting of ["STELLAR_NETWORK_PASSPHRASE", "STELLAR_HORIZON_URL", "STELLAR_SOROBAN_RPC_URL", "IPFS_API_URL", "EXTERNAL_API_TOTAL_TIMEOUT_MS", "EXTERNAL_API_RETRIES"]) assert.ok(settings.includes(setting));
});
