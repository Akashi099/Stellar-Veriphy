import { evaluateRateLimit, RateLimitConfig } from "../security/rateLimiter";

export interface OracleProvider {
  address: string;
  reputationScore: number;
  suspended: boolean;
}

export interface OracleRouterConfig {
  maxRetries: number;
  retryBaseDelayMs: number;
  retryBackoffMultiplier: number;
  perProviderWindowMs: number;
  perProviderMaxRequests: number;
}

export interface RouteResult {
  provider: OracleProvider;
  attempt: number;
}

export const RouterError = {
  NoCapacity: "NoCapacity",
  AllProvidersExhausted: "AllProvidersExhausted",
  Paused: "Paused",
} as const;

export type RouterErrorCode = (typeof RouterError)[keyof typeof RouterError];

export class OracleRouterError extends Error {
  constructor(
    public readonly code: RouterErrorCode,
    message: string
  ) {
    super(message);
    this.name = "OracleRouterError";
  }
}

const DEFAULT_CONFIG: OracleRouterConfig = {
  maxRetries: Number(process.env.ORACLE_MAX_RETRIES ?? 3),
  retryBaseDelayMs: Number(process.env.ORACLE_RETRY_BASE_DELAY_MS ?? 500),
  retryBackoffMultiplier: Number(process.env.ORACLE_RETRY_BACKOFF_MULTIPLIER ?? 2),
  perProviderWindowMs: Number(process.env.ORACLE_PROVIDER_RATE_WINDOW_MS ?? 60_000),
  perProviderMaxRequests: Number(process.env.ORACLE_PROVIDER_RATE_MAX_REQUESTS ?? 100),
};

let paused = false;
let roundRobinIndex = 0;

const providerFailureCounts = new Map<string, number>();

function getProviderRateLimitConfig(cfg: OracleRouterConfig): Partial<RateLimitConfig> {
  return {
    windowMs: cfg.perProviderWindowMs,
    maxRequests: cfg.perProviderMaxRequests,
    backoffBaseMs: cfg.retryBaseDelayMs,
    backoffMultiplier: cfg.retryBackoffMultiplier,
    whitelist: new Set<string>(),
  };
}

function selectProvider(
  providers: OracleProvider[],
  cfg: OracleRouterConfig
): OracleProvider | null {
  const eligible = providers.filter((p) => !p.suspended);
  if (eligible.length === 0) return null;

  const start = roundRobinIndex % eligible.length;
  const sorted = [
    ...eligible.slice(start),
    ...eligible.slice(0, start),
  ].sort((a, b) => b.reputationScore - a.reputationScore);

  const rateLimitConfig = getProviderRateLimitConfig(cfg);

  for (const provider of sorted) {
    const outcome = evaluateRateLimit(`oracle:${provider.address}`, rateLimitConfig);
    if (outcome.allowed) {
      roundRobinIndex = (eligible.indexOf(provider) + 1) % eligible.length;
      return provider;
    }
  }

  return null;
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function routeRequest<T>(
  providers: OracleProvider[],
  handler: (provider: OracleProvider, attempt: number) => Promise<T>,
  configOverrides: Partial<OracleRouterConfig> = {}
): Promise<T> {
  if (paused) {
    throw new OracleRouterError(RouterError.Paused, "Oracle request router is paused");
  }

  const cfg: OracleRouterConfig = { ...DEFAULT_CONFIG, ...configOverrides };
  let lastError: unknown;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    const provider = selectProvider(providers, cfg);

    if (!provider) {
      throw new OracleRouterError(
        RouterError.NoCapacity,
        "All oracle providers are rate-limited or suspended; no capacity available"
      );
    }

    try {
      const result = await handler(provider, attempt);
      providerFailureCounts.delete(provider.address);
      return result;
    } catch (err) {
      lastError = err;
      const failures = (providerFailureCounts.get(provider.address) ?? 0) + 1;
      providerFailureCounts.set(provider.address, failures);

      if (attempt < cfg.maxRetries) {
        const delay =
          cfg.retryBaseDelayMs *
          Math.pow(cfg.retryBackoffMultiplier, attempt);
        console.warn(
          `[oracle-router] provider=${provider.address} attempt=${attempt + 1} failed, retrying in ${delay}ms. failures=${failures}`
        );
        await delayMs(delay);
      }
    }
  }

  throw new OracleRouterError(
    RouterError.AllProvidersExhausted,
    `Oracle request failed after ${cfg.maxRetries + 1} attempts: ${String(lastError)}`
  );
}

export function getProviderFailureCount(providerAddress: string): number {
  return providerFailureCounts.get(providerAddress) ?? 0;
}

export function pauseRouter(): void {
  paused = true;
}

export function resumeRouter(): void {
  paused = false;
}

export function isRouterPaused(): boolean {
  return paused;
}

export function resetRouterState(): void {
  paused = false;
  roundRobinIndex = 0;
  providerFailureCounts.clear();
}
