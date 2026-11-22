/** Pure startup validation: diagnostics contain setting names, never setting values. */
export interface ProviderConfiguration {
  stellar: { network: string; passphrase: string | undefined; horizonUrl: string; sorobanRpcUrl: string };
  integrations: { ipfsApiUrl?: string | undefined; kmsHealthUrl?: string | undefined; oracleHealthUrl?: string | undefined };
  health: { criticalDependencies: string[]; timeoutMs: number; intervalMs: number };
  externalApi: { timeoutMs: number; totalTimeoutMs: number; retries: number; retryBaseDelayMs: number; retryMaxDelayMs: number };
  trafficEnvironment: string;
}
export interface ConfigurationIssue { setting: string; code: "MISSING" | "INVALID" | "INCOMPATIBLE" }
export function validateProviderConfiguration(config: ProviderConfiguration): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  const add = (setting: string, code: ConfigurationIssue["code"]) => issues.push({ setting, code });
  const network = config.stellar.network;
  if (!["mainnet", "testnet", "futurenet"].includes(network)) add("STELLAR_NETWORK", "INVALID");
  const passphrases: Record<string, string> = { mainnet: "Public Global Stellar Network ; September 2015", testnet: "Test SDF Network ; September 2015", futurenet: "Test SDF Future Network ; October 2022" };
  if (!config.stellar.passphrase) add("STELLAR_NETWORK_PASSPHRASE", "MISSING");
  else if (passphrases[network] && config.stellar.passphrase !== passphrases[network]) add("STELLAR_NETWORK_PASSPHRASE", "INCOMPATIBLE");
  if (!["test", "production"].includes(config.trafficEnvironment)) add("PROVIDER_TRAFFIC_ENVIRONMENT", "INVALID");
  const urls: Array<[string, string | undefined, string]> = [
    ["STELLAR_HORIZON_URL", config.stellar.horizonUrl, "stellar_horizon"],
    ["STELLAR_SOROBAN_RPC_URL", config.stellar.sorobanRpcUrl, "soroban_rpc"],
    ["IPFS_API_URL", config.integrations.ipfsApiUrl, "ipfs"],
    ["KMS_HEALTH_URL", config.integrations.kmsHealthUrl, "kms"],
    ["ORACLE_HEALTH_URL", config.integrations.oracleHealthUrl, "tee_oracle"],
  ];
  for (const [setting, value, dependency] of urls) {
    if (!value) {
      if (setting.startsWith("STELLAR_") || config.health.criticalDependencies.includes(dependency)) add(setting, "MISSING");
      continue;
    }
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) add(setting, "INVALID");
      else if (config.trafficEnvironment === "production" && url.protocol !== "https:") add(setting, "INCOMPATIBLE");
      if (setting.startsWith("STELLAR_") && /testnet|futurenet/.test(url.hostname) && !url.hostname.includes(network)) add(setting, "INCOMPATIBLE");
    } catch { add(setting, "INVALID"); }
  }
  for (const dependency of config.health.criticalDependencies) {
    if (!["mongodb", ...urls.map((entry) => entry[2])].includes(dependency)) add("HEALTH_CRITICAL_DEPENDENCIES", "INVALID");
  }
  for (const [setting, value] of [["EXTERNAL_API_TIMEOUT_MS", config.externalApi.timeoutMs], ["EXTERNAL_API_TOTAL_TIMEOUT_MS", config.externalApi.totalTimeoutMs], ["HEALTH_CHECK_TIMEOUT_MS", config.health.timeoutMs], ["HEALTH_CHECK_INTERVAL_MS", config.health.intervalMs]] as const) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) add(setting, "INVALID");
  }
  if (config.externalApi.totalTimeoutMs < config.externalApi.timeoutMs) add("EXTERNAL_API_TOTAL_TIMEOUT_MS", "INCOMPATIBLE");
  if (!Number.isInteger(config.externalApi.retries) || config.externalApi.retries < 0 || config.externalApi.retries > 5) add("EXTERNAL_API_RETRIES", "INVALID");
  for (const [setting, value] of [["EXTERNAL_API_RETRY_BASE_DELAY_MS", config.externalApi.retryBaseDelayMs], ["EXTERNAL_API_RETRY_MAX_DELAY_MS", config.externalApi.retryMaxDelayMs]] as const) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) add(setting, "INVALID");
  }
  if (config.externalApi.retryMaxDelayMs < config.externalApi.retryBaseDelayMs) add("EXTERNAL_API_RETRY_MAX_DELAY_MS", "INCOMPATIBLE");
  return issues;
}
export function assertProviderConfiguration(config: ProviderConfiguration): void {
  const issues = validateProviderConfiguration(config);
  if (issues.length) throw new Error("Provider configuration invalid: " + issues.map(({ setting, code }) => setting + " (" + code + ")").join(", "));
}
