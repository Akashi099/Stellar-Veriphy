/**
 * useFeatureFlag Hook
 *
 * React hook for checking feature flag status in components
 */

"use client";

import { useEffect, useState } from "react";

import { evaluateFeatureFlag, isFeatureEnabled, setFeatureFlagContext } from "./client";
import { FeatureFlagContext, FeatureFlagEvaluationResult } from "./types";

interface UseFeatureFlagOptions {
  userId?: string;
  userRole?: FeatureFlagContext["userRole"];
  defaultValue?: boolean;
}

/**
 * Hook to check if a feature flag is enabled
 */
export function useFeatureFlag(flagName: string, options?: UseFeatureFlagOptions): boolean {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      if (options?.userId) {
        setFeatureFlagContext({
          userId: options.userId,
          userRole: options.userRole,
        });
      }
      return isFeatureEnabled(flagName, options?.defaultValue);
    }
    return options?.defaultValue ?? false;
  });

  useEffect(() => {
    if (options?.userId) {
      setFeatureFlagContext({
        userId: options.userId,
        userRole: options.userRole,
      });
    }

    const currentEnabled = isFeatureEnabled(flagName, options?.defaultValue);
    setEnabled(currentEnabled);
  }, [flagName, options?.userId, options?.userRole, options?.defaultValue]);

  return enabled;
}

/**
 * Hook to get detailed evaluation result
 */
export function useFeatureFlagEvaluation(
  flagName: string,
  options?: UseFeatureFlagOptions
): FeatureFlagEvaluationResult | null {
  const [result, setResult] = useState<FeatureFlagEvaluationResult | null>(null);

  useEffect(() => {
    if (options?.userId) {
      setFeatureFlagContext({
        userId: options.userId,
        userRole: options.userRole,
      });
    }

    const evaluation = evaluateFeatureFlag(flagName);
    setResult(evaluation);
  }, [flagName, options?.userId, options?.userRole]);

  return result;
}

/**
 * Hook to get multiple feature flags at once
 */
export function useFeatureFlags(
  flagNames: string[],
  options?: UseFeatureFlagOptions
): Record<string, boolean> {
  const [flags, setFlags] = useState<Record<string, boolean>>(() => {
    const result: Record<string, boolean> = {};
    if (typeof window !== "undefined") {
      if (options?.userId) {
        setFeatureFlagContext({
          userId: options.userId,
          userRole: options.userRole,
        });
      }
      flagNames.forEach((name) => {
        result[name] = isFeatureEnabled(name, options?.defaultValue);
      });
    }
    return result;
  });

  useEffect(() => {
    if (options?.userId) {
      setFeatureFlagContext({
        userId: options.userId,
        userRole: options.userRole,
      });
    }

    const result: Record<string, boolean> = {};
    flagNames.forEach((name) => {
      result[name] = isFeatureEnabled(name, options?.defaultValue);
    });
    setFlags(result);
  }, [flagNames.join(","), options?.userId, options?.userRole, options?.defaultValue]);

  return flags;
}

/**
 * Render component conditionally based on feature flag
 */
export function FeatureFlagged({
  name,
  children,
  fallback = null,
  userId,
  userRole,
}: {
  name: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  userId?: string;
  userRole?: FeatureFlagContext["userRole"];
}): React.ReactNode {
  const enabled = useFeatureFlag(name, { userId, userRole });
  return enabled ? children : fallback;
}
