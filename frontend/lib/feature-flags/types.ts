/**
 * Feature Flag Types and Interfaces
 */

export type FeatureFlagValue = boolean | string | number;

export interface FeatureFlagConfig {
  name: string;
  description: string;
  enabled: boolean;
  environments: {
    development?: boolean;
    staging?: boolean;
    production?: boolean;
  };
  users?: {
    allowList?: string[];
    blockList?: string[];
    percentage?: number;
  };
  rollout?: {
    startDate?: string;
    endDate?: string;
    percentage?: number;
  };
  analytics?: {
    trackEnabled?: boolean;
    trackVariant?: boolean;
  };
}

export interface FeatureFlagContext {
  userId?: string;
  userRole?: "user" | "verifier" | "admin";
  environment: "development" | "staging" | "production";
  timestamp?: number;
}

export interface FeatureFlagEvaluationResult {
  flag: string;
  enabled: boolean;
  reason: string;
  variant?: string;
}
