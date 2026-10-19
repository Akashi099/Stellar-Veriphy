/**
 * useErrorTracking Hook
 *
 * React hook for error tracking integration
 */

"use client";

import { useCallback,useEffect } from "react";

import { addBreadcrumb,captureError, captureException, captureMessage } from "./client";

export function useErrorTracking() {
  useEffect(() => {
    const handleError = (error: Error) => {
      captureException(error, {
        source: "react_error_boundary",
      });
    };

    return () => {
      // Cleanup
    };
  }, []);

  return {
    captureError: useCallback((error: Error | string, level?: "fatal" | "error" | "warning") => {
      captureError(error, level);
    }, []),
    captureException: useCallback((error: Error) => {
      captureException(error);
    }, []),
    captureMessage: useCallback((message: string, level?: "info" | "warning" | "error") => {
      captureMessage(message, level);
    }, []),
    addBreadcrumb: useCallback(
      (category: string, message: string, level?: "info" | "warning" | "error") => {
        addBreadcrumb(category, message, level);
      },
      []
    ),
  };
}
