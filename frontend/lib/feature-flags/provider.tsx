"use client";

/**
 * Feature Flags Provider Component
 *
 * Initializes feature flags in a React application
 */

import React, { createContext, useContext,useEffect } from "react";

import { initializeFeatureFlags, setFeatureFlagContext } from "./client";
import { FEATURE_FLAGS } from "./config";
import { FeatureFlagContext as FFContext } from "./types";

interface FeatureFlagsContextType {
  initialized: boolean;
  context: FFContext;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextType>({
  initialized: false,
  context: {
    environment: "production",
  },
});

export interface FeatureFlagsProviderProps {
  children: React.ReactNode;
  userId?: string;
  userRole?: "user" | "verifier" | "admin";
  environment?: "development" | "staging" | "production";
}

/**
 * Provider component that initializes feature flags
 */
export function FeatureFlagsProvider({
  children,
  userId,
  userRole,
  environment = process.env.NEXT_PUBLIC_ENV as any,
}: FeatureFlagsProviderProps) {
  const [initialized, setInitialized] = React.useState(false);
  const [context, setContext] = React.useState<FFContext>({
    userId,
    userRole,
    environment: environment || "production",
  });

  useEffect(() => {
    // Initialize feature flags on mount
    initializeFeatureFlags(FEATURE_FLAGS, {
      userId,
      userRole,
      environment: environment || "production",
    });

    setContext({
      userId,
      userRole,
      environment: environment || "production",
    });

    setInitialized(true);

    // Setup analytics tracking
    if (typeof window !== "undefined" && !window.__FEATURE_FLAG_ANALYTICS__) {
      window.__FEATURE_FLAG_ANALYTICS__ = {
        track: (event, data) => {
          if (typeof gtag !== "undefined") {
            gtag("event", event, data);
          }
        },
      };
    }
  }, [userId, userRole, environment]);

  return (
    <FeatureFlagsContext.Provider value={{ initialized, context }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

/**
 * Hook to access feature flags context
 */
export function useFeatureFlagsContext(): FeatureFlagsContextType {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error("useFeatureFlagsContext must be used within FeatureFlagsProvider");
  }
  return context;
}

/**
 * Hook to update feature flag context (e.g., after login)
 */
export function useSetFeatureFlagContext() {
  return setFeatureFlagContext;
}

/**
 * Initialize feature flags in server-side context
 */
export function initializeServerFeatureFlags(
  userId?: string,
  userRole?: "user" | "verifier" | "admin",
  environment?: "development" | "staging" | "production"
) {
  initializeFeatureFlags(FEATURE_FLAGS, {
    userId,
    userRole,
    environment: environment || "production",
  });
}
