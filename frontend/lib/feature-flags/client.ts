/**
 * Feature Flags Client
 *
 * Manages feature flag evaluation and analytics tracking
 */

import { FeatureFlagConfig, FeatureFlagContext, FeatureFlagEvaluationResult } from "./types";

interface FeatureFlagsStore {
  flags: Record<string, FeatureFlagConfig>;
  context: FeatureFlagContext;
  evaluationCache: Record<string, FeatureFlagEvaluationResult>;
}

let store: FeatureFlagsStore = {
  flags: {},
  context: {
    environment: (process.env.NEXT_PUBLIC_ENV as any) || "production",
  },
  evaluationCache: {},
};

/**
 * Initialize feature flags with configuration
 */
export function initializeFeatureFlags(
  config: Record<string, FeatureFlagConfig>,
  context: Partial<FeatureFlagContext>
) {
  store.flags = config;
  store.context = {
    ...store.context,
    ...context,
  };
  store.evaluationCache = {};
}

/**
 * Set the evaluation context
 */
export function setFeatureFlagContext(context: Partial<FeatureFlagContext>) {
  store.context = {
    ...store.context,
    ...context,
  };
  store.evaluationCache = {};
}

/**
 * Evaluate if a feature flag is enabled
 */
export function isFeatureEnabled(flagName: string, defaultValue = false): boolean {
  const cached = store.evaluationCache[flagName];
  if (cached) {
    return cached.enabled;
  }

  const config = store.flags[flagName];
  if (!config) {
    console.warn(`Feature flag "${flagName}" not found. Using default: ${defaultValue}`);
    return defaultValue;
  }

  const result = evaluateFlag(config);
  store.evaluationCache[flagName] = result;

  return result.enabled;
}

/**
 * Get detailed evaluation result for a feature flag
 */
export function evaluateFeatureFlag(flagName: string): FeatureFlagEvaluationResult | null {
  const config = store.flags[flagName];
  if (!config) {
    return null;
  }

  const cached = store.evaluationCache[flagName];
  if (cached) {
    return cached;
  }

  const result = evaluateFlag(config);
  store.evaluationCache[flagName] = result;

  return result;
}

/**
 * Get all feature flags and their evaluation status
 */
export function getAllFeatureFlags(): Record<string, boolean> {
  const result: Record<string, boolean> = {};

  Object.entries(store.flags).forEach(([name]) => {
    result[name] = isFeatureEnabled(name);
  });

  return result;
}

/**
 * Evaluate a single flag based on context
 */
function evaluateFlag(config: FeatureFlagConfig): FeatureFlagEvaluationResult {
  let enabled = config.enabled;
  let reason = "default";

  // Check environment
  if (enabled) {
    const envKey = store.context.environment as keyof typeof config.environments;
    if (config.environments[envKey] !== undefined) {
      enabled = config.environments[envKey] as boolean;
      reason = `environment (${store.context.environment})`;
    }
  }

  // Check user-specific rules
  if (enabled && store.context.userId && config.users) {
    if (config.users.blockList?.includes(store.context.userId)) {
      enabled = false;
      reason = "user blocklisted";
    } else if (config.users.allowList && !config.users.allowList.includes(store.context.userId)) {
      enabled = false;
      reason = "user not in allowlist";
    } else if (config.users.percentage !== undefined) {
      const hash = hashUserId(store.context.userId, config.name);
      enabled = hash % 100 < config.users.percentage;
      reason = `user percentage rollout (${config.users.percentage}%)`;
    }
  }

  // Check rollout date and percentage
  if (enabled && config.rollout) {
    const now = store.context.timestamp || Date.now();

    if (config.rollout.startDate) {
      const startTime = new Date(config.rollout.startDate).getTime();
      if (now < startTime) {
        enabled = false;
        reason = "rollout not started";
      }
    }

    if (config.rollout.endDate) {
      const endTime = new Date(config.rollout.endDate).getTime();
      if (now > endTime) {
        enabled = false;
        reason = "rollout ended";
      }
    }

    if (enabled && config.rollout.percentage !== undefined) {
      const variant = hashRollout(store.context.userId || "anonymous", config.name);
      enabled = variant < config.rollout.percentage;
      reason = `percentage rollout (${config.rollout.percentage}%)`;
    }
  }

  // Track analytics if enabled
  if (config.analytics?.trackEnabled) {
    trackFeatureFlagEvaluation({
      flag: config.name,
      enabled,
      reason,
      userId: store.context.userId,
      environment: store.context.environment,
    });
  }

  return {
    flag: config.name,
    enabled,
    reason,
  };
}

/**
 * Hash function for consistent user-based rollout
 */
function hashUserId(userId: string, flagName: string): number {
  const combined = `${userId}-${flagName}`;
  let hash = 0;

  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  return Math.abs(hash);
}

/**
 * Hash function for rollout percentage
 */
function hashRollout(userId: string, flagName: string): number {
  return hashUserId(userId, flagName) % 100;
}

/**
 * Track feature flag evaluation for analytics
 */
function trackFeatureFlagEvaluation(data: {
  flag: string;
  enabled: boolean;
  reason: string;
  userId?: string;
  environment: string;
}) {
  if (typeof window === "undefined") return;

  // Send to analytics service
  try {
    if (window.__FEATURE_FLAG_ANALYTICS__) {
      window.__FEATURE_FLAG_ANALYTICS__.track("feature_flag_evaluated", {
        ...data,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Failed to track feature flag:", error);
  }
}

/**
 * Get feature flag configuration (for admin UI)
 */
export function getFeatureFlagConfig(flagName: string): FeatureFlagConfig | null {
  return store.flags[flagName] || null;
}

/**
 * Update feature flag (admin only)
 */
export function updateFeatureFlag(flagName: string, updates: Partial<FeatureFlagConfig>) {
  if (!store.flags[flagName]) {
    console.error(`Feature flag "${flagName}" not found`);
    return;
  }

  store.flags[flagName] = {
    ...store.flags[flagName],
    ...updates,
  };

  store.evaluationCache = {};

  trackFeatureFlagUpdate({
    flag: flagName,
    updates,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Track feature flag updates for audit logging
 */
function trackFeatureFlagUpdate(data: {
  flag: string;
  updates: Partial<FeatureFlagConfig>;
  timestamp: string;
}) {
  try {
    if (window.__FEATURE_FLAG_ANALYTICS__) {
      window.__FEATURE_FLAG_ANALYTICS__.track("feature_flag_updated", data);
    }
  } catch (error) {
    console.error("Failed to track feature flag update:", error);
  }
}

// Expose global analytics handler setup
declare global {
  interface Window {
    __FEATURE_FLAG_ANALYTICS__?: {
      track: (event: string, data: any) => void;
    };
  }
}
