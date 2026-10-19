/**
 * Error Tracking Types
 */

export interface ErrorContext {
  userId?: string;
  userRole?: string;
  environment?: string;
  version?: string;
  url?: string;
  userAgent?: string;
  tags?: Record<string, string>;
  extra?: Record<string, any>;
}

export interface ErrorReport {
  message: string;
  level: "fatal" | "error" | "warning" | "info";
  timestamp: string;
  fingerprint?: string;
  context?: ErrorContext;
  sourceMapContent?: string;
}

export interface ErrorTrackingConfig {
  enabled: boolean;
  environment: "development" | "staging" | "production";
  debug: boolean;
  dsn?: string;
  tracesSampleRate?: number;
  beforeSend?: (event: any) => any;
  ignoreErrors?: string[];
}
