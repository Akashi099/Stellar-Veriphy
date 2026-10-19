/**
 * Feature Flags Configuration
 *
 * Defines all available feature flags with their environments and rollout settings
 */

import { FeatureFlagConfig } from "./types";

export const FEATURE_FLAGS: Record<string, FeatureFlagConfig> = {
  // Content Verification Features
  advanced_verification: {
    name: "advanced_verification",
    description: "Enable advanced content verification methods",
    enabled: true,
    environments: {
      development: true,
      staging: true,
      production: false,
    },
    rollout: {
      percentage: 20,
    },
    analytics: {
      trackEnabled: true,
      trackVariant: true,
    },
  },

  // Blockchain Features
  soroban_integration: {
    name: "soroban_integration",
    description: "Enable Soroban smart contract integration",
    enabled: true,
    environments: {
      development: true,
      staging: true,
      production: true,
    },
    analytics: {
      trackEnabled: true,
    },
  },

  // UI Features
  dark_mode: {
    name: "dark_mode",
    description: "Enable dark mode toggle",
    enabled: true,
    environments: {
      development: true,
      staging: true,
      production: true,
    },
    analytics: {
      trackEnabled: true,
    },
  },

  // Analytics and Monitoring
  enhanced_analytics: {
    name: "enhanced_analytics",
    description: "Enable enhanced analytics tracking",
    enabled: true,
    environments: {
      development: false,
      staging: true,
      production: true,
    },
    users: {
      percentage: 50,
    },
    analytics: {
      trackEnabled: true,
    },
  },

  // Performance Features
  code_splitting: {
    name: "code_splitting",
    description: "Enable advanced code splitting for performance",
    enabled: true,
    environments: {
      development: false,
      staging: true,
      production: true,
    },
    analytics: {
      trackEnabled: true,
    },
  },

  // New Features
  batch_verification: {
    name: "batch_verification",
    description: "Enable batch content verification",
    enabled: true,
    environments: {
      development: true,
      staging: true,
      production: false,
    },
    rollout: {
      startDate: "2025-09-15",
      percentage: 30,
    },
    analytics: {
      trackEnabled: true,
    },
  },

  // Experimental Features
  ai_content_analysis: {
    name: "ai_content_analysis",
    description: "Enable AI-powered content analysis (experimental)",
    enabled: true,
    environments: {
      development: true,
      staging: true,
      production: false,
    },
    users: {
      allowList: ["admin@example.com"],
    },
    analytics: {
      trackEnabled: true,
    },
  },

  // Wallet Features
  freighter_integration: {
    name: "freighter_integration",
    description: "Enable Freighter wallet integration",
    enabled: true,
    environments: {
      development: true,
      staging: true,
      production: true,
    },
    analytics: {
      trackEnabled: true,
    },
  },

  // Mobile Features
  mobile_optimized_ui: {
    name: "mobile_optimized_ui",
    description: "Enable mobile-optimized UI components",
    enabled: true,
    environments: {
      development: true,
      staging: true,
      production: true,
    },
    analytics: {
      trackEnabled: true,
    },
  },

  // Maintenance Flags
  maintenance_mode: {
    name: "maintenance_mode",
    description: "Enable maintenance mode (disables certain features)",
    enabled: false,
    environments: {
      development: false,
      staging: false,
      production: false,
    },
    analytics: {
      trackEnabled: true,
    },
  },
};

/**
 * Get default feature flags for a specific environment
 */
export function getDefaultFeatureFlags(
  environment: "development" | "staging" | "production"
): Record<string, boolean> {
  const flags: Record<string, boolean> = {};

  Object.entries(FEATURE_FLAGS).forEach(([name, config]) => {
    const envKey = environment as keyof typeof config.environments;
    flags[name] = config.environments[envKey] ?? config.enabled;
  });

  return flags;
}

/**
 * Get feature flag descriptions for documentation
 */
export function getFeatureFlagDocumentation(): Record<
  string,
  { description: string; environments: Record<string, boolean> }
> {
  const docs: Record<string, any> = {};

  Object.entries(FEATURE_FLAGS).forEach(([name, config]) => {
    docs[name] = {
      description: config.description,
      environments: config.environments,
      rollout: config.rollout,
      users: config.users,
    };
  });

  return docs;
}
