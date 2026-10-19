/**
 * Error Tracking Client
 *
 * Manages error collection and reporting
 */

import { ErrorContext, ErrorReport, ErrorTrackingConfig } from "./types";

interface ErrorTrackingStore {
  config: ErrorTrackingConfig;
  context: ErrorContext;
  errorQueue: ErrorReport[];
  isInitialized: boolean;
}

let store: ErrorTrackingStore = {
  config: {
    enabled: true,
    environment: "production",
    debug: false,
  },
  context: {},
  errorQueue: [],
  isInitialized: false,
};

/**
 * Initialize error tracking
 */
export function initializeErrorTracking(config: Partial<ErrorTrackingConfig>) {
  store.config = {
    ...store.config,
    ...config,
  };

  store.isInitialized = true;

  if (typeof window !== "undefined") {
    // Setup global error handler
    window.addEventListener("error", handleGlobalError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    // Send any queued errors
    if (store.errorQueue.length > 0) {
      store.errorQueue.forEach(sendErrorReport);
      store.errorQueue = [];
    }
  }

  if (store.config.debug) {
    console.log("[Error Tracking] Initialized", store.config);
  }
}

/**
 * Set error context
 */
export function setErrorContext(context: Partial<ErrorContext>) {
  store.context = {
    ...store.context,
    ...context,
  };

  if (store.config.debug) {
    console.log("[Error Tracking] Context updated", store.context);
  }
}

/**
 * Capture an error
 */
export function captureError(
  error: Error | string,
  level: "fatal" | "error" | "warning" = "error",
  extra?: Record<string, any>
) {
  if (!store.config.enabled) {
    return;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : "";

  const report: ErrorReport = {
    message: errorMessage,
    level,
    timestamp: new Date().toISOString(),
    context: {
      ...store.context,
      ...extra,
    },
  };

  if (store.config.debug) {
    console.log("[Error Tracking] Captured error", {
      message: errorMessage,
      stack: errorStack,
      level,
    });
  }

  if (typeof window !== "undefined") {
    sendErrorReport(report);
  } else {
    store.errorQueue.push(report);
  }
}

/**
 * Capture an exception
 */
export function captureException(error: Error, context?: ErrorContext) {
  captureError(error, "error", context);
}

/**
 * Capture a message
 */
export function captureMessage(message: string, level: "info" | "warning" | "error" = "info") {
  captureError(message, level === "error" ? "error" : "warning");
}

/**
 * Handle global errors
 */
function handleGlobalError(event: ErrorEvent) {
  captureError(event.error || new Error(event.message), "error", {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
}

/**
 * Handle unhandled rejections
 */
function handleUnhandledRejection(event: PromiseRejectionEvent) {
  const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  captureError(error, "error", {
    type: "unhandled_rejection",
  });
}

/**
 * Send error report
 */
async function sendErrorReport(report: ErrorReport) {
  if (!store.config.enabled) {
    return;
  }

  // Check if error should be ignored
  if (store.config.ignoreErrors) {
    for (const pattern of store.config.ignoreErrors) {
      if (report.message.includes(pattern)) {
        return;
      }
    }
  }

  try {
    // Send to backend API endpoint
    const response = await fetch("/api/errors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...report,
        environment: store.config.environment,
        url: typeof window !== "undefined" ? window.location.href : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      }),
    });

    if (!response.ok && store.config.debug) {
      console.warn("[Error Tracking] Failed to send error report", response.status);
    }
  } catch (error) {
    if (store.config.debug) {
      console.error("[Error Tracking] Error sending report", error);
    }
  }
}

/**
 * Get error tracking status
 */
export function getErrorTrackingStatus() {
  return {
    enabled: store.config.enabled,
    initialized: store.isInitialized,
    queuedErrors: store.errorQueue.length,
    environment: store.config.environment,
  };
}

/**
 * Set breadcrumb (for tracking user actions)
 */
export function addBreadcrumb(
  category: string,
  message: string,
  level: "info" | "warning" | "error" = "info"
) {
  if (!store.config.enabled) {
    return;
  }

  if (typeof window !== "undefined" && window.__ERROR_TRACKING_BREADCRUMBS__) {
    window.__ERROR_TRACKING_BREADCRUMBS__.push({
      category,
      message,
      level,
      timestamp: new Date().toISOString(),
    });

    if (window.__ERROR_TRACKING_BREADCRUMBS__.length > 50) {
      window.__ERROR_TRACKING_BREADCRUMBS__.shift();
    }
  }
}

/**
 * Get breadcrumbs
 */
export function getBreadcrumbs() {
  if (typeof window !== "undefined") {
    return window.__ERROR_TRACKING_BREADCRUMBS__ || [];
  }
  return [];
}

// Initialize breadcrumbs array
if (typeof window !== "undefined") {
  (window as any).__ERROR_TRACKING_BREADCRUMBS__ = [];
}

// Expose global error tracking functions
declare global {
  interface Window {
    __ERROR_TRACKING_BREADCRUMBS__?: Array<{
      category: string;
      message: string;
      level: string;
      timestamp: string;
    }>;
  }
}
