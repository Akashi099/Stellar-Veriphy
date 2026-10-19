/**
 * Environment-Aware Application & API Configuration
 * 
 * Manages environment-specific behaviors and API endpoint resolutions across
 * local development, staging, and production.
 * 
 * Provides runtime validation with actionable error messages when misconfigurations occur.
 */

export type AppEnvironment = "development" | "staging" | "production" | "test";

export interface EnvironmentConfig {
  /** The identified environment */
  environment: AppEnvironment;
  /** Base URL for backend API requests */
  apiBaseUrl: string;
  /** Default Stellar Soroban network for this environment */
  defaultNetwork: "testnet" | "mainnet" | "futurenet";
  /** Whether mock responses are permitted if services are unavailable */
  allowMockFallback: boolean;
  /** Logging verbosity */
  logLevel: "debug" | "info" | "warn" | "error";
  /** Request timeout in milliseconds */
  apiTimeoutMs: number;
  /** Environment-specific feature toggles */
  features: {
    enableDevTools: boolean;
    enableDetailedErrorResponses: boolean;
    enforceHttps: boolean;
  };
}

/**
 * Standard configuration presets by environment.
 * Can be overridden via NEXT_PUBLIC_* environment variables.
 */
const ENV_PRESETS: Record<AppEnvironment, EnvironmentConfig> = {
  development: {
    environment: "development",
    apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
    defaultNetwork: "testnet",
    allowMockFallback: true,
    logLevel: "debug",
    apiTimeoutMs: 15000,
    features: {
      enableDevTools: true,
      enableDetailedErrorResponses: true,
      enforceHttps: false,
    },
  },
  staging: {
    environment: "staging",
    apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || "https://staging-api.stellarveriphy.io",
    defaultNetwork: "testnet",
    allowMockFallback: false,
    logLevel: "info",
    apiTimeoutMs: 10000,
    features: {
      enableDevTools: true,
      enableDetailedErrorResponses: true,
      enforceHttps: true,
    },
  },
  production: {
    environment: "production",
    apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || "https://api.stellarveriphy.io",
    defaultNetwork: "mainnet",
    allowMockFallback: false,
    logLevel: "warn",
    apiTimeoutMs: 8000,
    features: {
      enableDevTools: false,
      enableDetailedErrorResponses: false,
      enforceHttps: true,
    },
  },
  test: {
    environment: "test",
    apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
    defaultNetwork: "testnet",
    allowMockFallback: true,
    logLevel: "error",
    apiTimeoutMs: 5000,
    features: {
      enableDevTools: false,
      enableDetailedErrorResponses: true,
      enforceHttps: false,
    },
  },
};

/**
 * Determines the current runtime environment with fallback to development.
 */
export function getCurrentEnvironment(): AppEnvironment {
  const envString = (
    process.env.NEXT_PUBLIC_APP_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  ).toLowerCase();

  if (envString.includes("prod")) return "production";
  if (envString.includes("stag")) return "staging";
  if (envString.includes("test")) return "test";
  return "development";
}

/**
 * Validates the environment configuration and produces helpful, actionable guidance upon error.
 */
export function validateEnvironmentConfig(config: EnvironmentConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check valid URL
  try {
    const url = new URL(config.apiBaseUrl);
    if (config.features.enforceHttps && url.protocol !== "https:") {
      errors.push(
        `[Environment Misconfiguration] In ${config.environment}, NEXT_PUBLIC_API_URL must use https://. Current: ${config.apiBaseUrl}`
      );
    }
    if (config.environment === "production" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      errors.push(
        `[Environment Misconfiguration] Production cannot point to localhost/127.0.0.1. Please set NEXT_PUBLIC_API_URL to your production domain.`
      );
    }
  } catch {
    errors.push(
      `[Environment Misconfiguration] Invalid NEXT_PUBLIC_API_URL format: "${config.apiBaseUrl}". Must be a valid absolute or relative URL.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Retrieves the active environment configuration with runtime validation.
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const currentEnv = getCurrentEnvironment();
  const config = { ...ENV_PRESETS[currentEnv] };

  // Runtime sanity check
  const validation = validateEnvironmentConfig(config);
  if (!validation.valid) {
    if (typeof console !== "undefined") {
      validation.errors.forEach((err) => console.error(err));
    }
    if (currentEnv === "production") {
      throw new Error(`Critical configuration error: ${validation.errors.join("; ")}`);
    }
  }

  return config;
}

/**
 * Resolves an API path against the environment's configured base endpoint.
 * Accepts both relative paths (e.g. "/api/uploads") and absolute URLs.
 */
export function resolveApiEndpoint(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const { apiBaseUrl } = getEnvironmentConfig();
  const cleanBase = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  return `${cleanBase}${cleanPath}`;
}
