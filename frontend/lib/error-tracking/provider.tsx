"use client";

/**
 * Error Tracking Provider Component
 *
 * Initializes error tracking in a React application
 */

import React, { useEffect } from "react";

import { initializeErrorTracking, setErrorContext } from "./client";
import { ErrorTrackingConfig } from "./types";

export interface ErrorTrackingProviderProps {
  children: React.ReactNode;
  config?: Partial<ErrorTrackingConfig>;
  userId?: string;
  userRole?: string;
}

/**
 * Provider component that initializes error tracking
 */
export function ErrorTrackingProvider({
  children,
  config,
  userId,
  userRole,
}: ErrorTrackingProviderProps) {
  useEffect(() => {
    // Initialize error tracking
    const finalConfig: Partial<ErrorTrackingConfig> = {
      environment: (process.env.NEXT_PUBLIC_ENV as any) || "production",
      enabled: process.env.NEXT_PUBLIC_ERROR_TRACKING !== "false",
      debug: process.env.NODE_ENV === "development",
      dsn: process.env.NEXT_PUBLIC_ERROR_TRACKING_DSN,
      tracesSampleRate: 0.1,
      ignoreErrors: ["Network request failed", "Failed to fetch", "Aborted", "Browser extensions"],
      ...config,
    };

    initializeErrorTracking(finalConfig);

    // Set user context
    if (userId || userRole) {
      setErrorContext({
        userId,
        userRole,
      });
    }

    // Track page views as breadcrumbs
    const handleRouteChange = () => {
      if (typeof window !== "undefined") {
        const { addBreadcrumb } = require("./client");
        addBreadcrumb("navigation", `Navigated to ${window.location.pathname}`);
      }
    };

    // In a real app, you'd hook this to your router
    window.addEventListener("popstate", handleRouteChange);

    return () => {
      window.removeEventListener("popstate", handleRouteChange);
    };
  }, [config, userId, userRole]);

  return <>{children}</>;
}
