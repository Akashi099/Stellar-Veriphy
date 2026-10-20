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

/**
 * Browser Capability Detection
 *
 * Shared source of truth for detecting unsupported browser capabilities so the
 * app can degrade gracefully (banner, PWA registration, error boundaries) instead
 * of failing silently.
 */

export type BrowserCapability =
  | "serviceWorker"
  | "cryptoSubtle"
  | "indexedDB"
  | "broadcastChannel"
  | "localStorage"
  | "fetch"
  | "webSockets"
  | "notifications";

export interface CapabilityCheck {
  /** The capability being checked */
  capability: BrowserCapability;
  /** Whether the capability is available */
  supported: boolean;
  /** Human-readable name of the capability */
  label: string;
  /** Targeted, actionable guidance shown when the capability is missing */
  guidance: string;
}

export interface CapabilityReport {
  /** True when every required capability is available */
  supported: boolean;
  /** Capabilities that are missing in the current browser */
  missing: CapabilityCheck[];
  /** All capability checks performed */
  checks: CapabilityCheck[];
}

const CAPABILITY_META: Record<BrowserCapability, { label: string; guidance: string }> = {
  serviceWorker: {
    label: "Service Workers",
    guidance:
      "Offline support and background sync are unavailable. Use a modern browser (Chrome, Edge, Firefox, or Safari) to enable them.",
  },
  cryptoSubtle: {
    label: "Web Crypto (crypto.subtle)",
    guidance:
      "Secure cryptography is unavailable. Access the app over HTTPS in a modern browser to enable signing and encryption.",
  },
  indexedDB: {
    label: "IndexedDB",
    guidance:
      "Local data storage is unavailable. Disable private/incognito mode or use a browser that supports IndexedDB.",
  },
  broadcastChannel: {
    label: "BroadcastChannel",
    guidance:
      "Cross-tab synchronization is unavailable. Some real-time updates may not appear across multiple tabs.",
  },
  localStorage: {
    label: "Local Storage",
    guidance:
      "Preferences cannot be saved. Enable site storage or exit private/incognito mode to persist settings.",
  },
  fetch: {
    label: "Fetch API",
    guidance:
      "Network requests are unavailable. Please upgrade to a modern browser to use the app.",
  },
  webSockets: {
    label: "WebSockets",
    guidance:
      "Live updates are unavailable. A modern browser with WebSocket support is required for real-time features.",
  },
  notifications: {
    label: "Notifications API",
    guidance:
      "Push notifications are unavailable. You can still use the app, but alerts will not be delivered.",
  },
};

/**
 * Capabilities that are essential for the app to function at all.
 * Missing any of these means the app should show a blocking message.
 */
export const REQUIRED_CAPABILITIES: BrowserCapability[] = ["fetch", "cryptoSubtle"];

/**
 * Capabilities that are optional; missing them degrades features gracefully.
 */
export const OPTIONAL_CAPABILITIES: BrowserCapability[] = [
  "serviceWorker",
  "indexedDB",
  "broadcastChannel",
  "localStorage",
  "webSockets",
  "notifications",
];

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function checkCapability(capability: BrowserCapability): boolean {
  if (!hasWindow()) return false;

  try {
    switch (capability) {
      case "serviceWorker":
        return "serviceWorker" in navigator;
      case "cryptoSubtle":
        return (
          typeof crypto !== "undefined" &&
          typeof crypto.subtle !== "undefined" &&
          crypto.subtle !== null
        );
      case "indexedDB":
        return typeof indexedDB !== "undefined";
      case "broadcastChannel":
        return typeof BroadcastChannel !== "undefined";
      case "localStorage":
        try {
          const probe = "__capability_probe__";
          window.localStorage.setItem(probe, "1");
          window.localStorage.removeItem(probe);
          return true;
        } catch {
          return false;
        }
      case "fetch":
        return typeof fetch === "function";
      case "webSockets":
        return typeof WebSocket !== "undefined";
      case "notifications":
        return "Notification" in window;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Builds a full capability report for the current browser.
 * Safe to call during SSR; all capabilities report as unsupported without a window.
 */
export function detectCapabilities(): CapabilityReport {
  const all = [...REQUIRED_CAPABILITIES, ...OPTIONAL_CAPABILITIES];
  const checks: CapabilityCheck[] = all.map((capability) => ({
    capability,
    supported: checkCapability(capability),
    label: CAPABILITY_META[capability].label,
    guidance: CAPABILITY_META[capability].guidance,
  }));

  const missing = checks.filter((c) => !c.supported);

  return {
    supported: missing.length === 0,
    missing,
    checks,
  };
}

/**
 * Returns a targeted, human-readable message naming the missing capability.
 * Returns null when the capability is available.
 */
export function getMissingCapabilityMessage(capability: BrowserCapability): string | null {
  if (checkCapability(capability)) return null;
  const meta = CAPABILITY_META[capability];
  return `${meta.label} is not supported in this browser. ${meta.guidance}`;
}

/**
 * Returns the first missing required capability, if any.
 * Useful for error boundaries that must block rendering.
 */
export function getFirstMissingRequiredCapability(): CapabilityCheck | null {
  for (const capability of REQUIRED_CAPABILITIES) {
    if (!checkCapability(capability)) {
      return {
        capability,
        supported: false,
        label: CAPABILITY_META[capability].label,
        guidance: CAPABILITY_META[capability].guidance,
      };
    }
  }
  return null;
}
