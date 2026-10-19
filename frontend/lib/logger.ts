/**
 * logger.ts
 *
 * Structured logging utility with level-based filtering, context support,
 * and production-safe output. Supports both simple messages and structured
 * JSON logging for aggregation and analysis.
 *
 * Features:
 * - Four log levels: debug, info, warn, error
 * - Context/metadata support for structured logging
 * - Production-safe with reduced verbosity in prod
 * - Performance-optimized with minimal overhead
 * - Compatible with common logging aggregators (ELK, CloudLogging, etc.)
 *
 * @module lib/logger
 *
 * @example
 * ```typescript
 * // Simple logging
 * logger.info('User logged in');
 *
 * // Structured logging with context
 * logger.info('Certificate verified', {
 *   certificateId: 'cert-123',
 *   verificationLevel: 'strict',
 *   duration: 245,
 * });
 *
 * // Error logging
 * logger.error('Failed to verify certificate', {
 *   error: err,
 *   certificateId: 'cert-123',
 *   retryCount: 3,
 * });
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Supported log levels in order of severity.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Structured log context containing metadata about the log entry.
 */
export interface LogContext {
  /** Unique request or operation ID for tracing */
  traceId?: string;
  /** User or session identifier */
  userId?: string;
  /** Component or module name where log originated */
  component?: string;
  /** Feature domain (certificates, wallet, batch, etc.) */
  feature?: string;
  /** Operation identifier (e.g., "verify_certificate") */
  operation?: string;
  /** Error object if present */
  error?: Error | unknown;
  /** Additional key-value metadata */
  [key: string]: unknown;
}

/**
 * Configuration for logger behavior.
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  minLevel?: LogLevel;
  /** Enable structured JSON output */
  structured?: boolean;
  /** Enable console output (disable for custom handlers) */
  useConsole?: boolean;
  /** Custom handlers for log entries */
  handlers?: Array<(entry: LogEntry) => void>;
}

/**
 * Internal representation of a complete log entry.
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext | undefined;
  tags?: string[] | undefined;
}

// ============================================================================
// Constants & Configuration
// ============================================================================

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isProduction = process.env.NODE_ENV === "production";

// In production, only warn and error are logged by default
const DEFAULT_LEVEL: LogLevel = isProduction ? "warn" : "debug";
const DEFAULT_STRUCTURED = isProduction; // Structured output in production

// ============================================================================
// Logger Class (Enhanced)
// ============================================================================

/**
 * StructuredLogger provides flexible, production-safe logging with support for
 * structured output, context injection, and custom handlers.
 *
 * @example
 * ```ts
 * const logger = new StructuredLogger({
 *   minLevel: 'debug',
 *   structured: false,
 * });
 *
 * logger.info('App started', { version: '1.0.0' });
 * ```
 */
class StructuredLogger {
  private minLevel: LogLevel = DEFAULT_LEVEL;
  private structured: boolean = DEFAULT_STRUCTURED;
  private useConsole: boolean = true;
  private handlers: Array<(entry: LogEntry) => void> = [];
  private globalContext: LogContext = {};

  constructor(config?: LoggerConfig) {
    if (config?.minLevel !== undefined) {
      this.minLevel = config.minLevel;
    }
    if (config?.structured !== undefined) {
      this.structured = config.structured;
    }
    if (config?.useConsole !== undefined) {
      this.useConsole = config.useConsole;
    }
    if (config?.handlers) {
      this.handlers = config.handlers;
    }
  }

  /**
   * Set global context that will be included in all log entries.
   * Useful for setting request ID, user ID, etc. that apply to all logs.
   *
   * @param context - Global context to merge with all logs
   *
   * @example
   * ```ts
   * logger.setGlobalContext({ userId: 'user-123', traceId: 'abc-def' });
   * logger.info('Later log'); // Includes userId and traceId
   * ```
   */
  setGlobalContext(context: LogContext): void {
    this.globalContext = { ...this.globalContext, ...context };
  }

  /**
   * Update the minimum log level.
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Check if a log level is enabled.
   */
  isEnabled(level: LogLevel): boolean {
    return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[this.minLevel];
  }

  /**
   * Add a custom log handler (e.g., for sending to APM/logging service).
   *
   * @example
   * ```ts
   * logger.addHandler((entry) => {
   *   if (entry.level === 'error') {
   *     sendToSentry(entry);
   *   }
   * });
   * ```
   */
  addHandler(handler: (entry: LogEntry) => void): void {
    this.handlers.push(handler);
  }

  /**
   * Log at debug level (most verbose).
   *
   * @param message - Log message
   * @param context - Optional context/metadata
   */
  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  /**
   * Log at info level (normal operation).
   *
   * @param message - Log message
   * @param context - Optional context/metadata
   */
  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  /**
   * Log at warn level (potential problems).
   *
   * @param message - Log message
   * @param context - Optional context/metadata
   */
  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  /**
   * Log at error level (errors - always logged in production).
   *
   * @param message - Log message
   * @param context - Optional context/metadata (usually includes error object)
   */
  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  /**
   * Core logging function that handles all levels.
   *
   * @internal
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    // Skip if level not enabled
    if (!this.isEnabled(level)) {
      return;
    }

    // Merge global context with provided context
    const mergedContext = {
      ...this.globalContext,
      ...context,
    };

    // Create log entry
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: Object.keys(mergedContext).length > 0 ? mergedContext : undefined,
    };

    // Output to console if enabled
    if (this.useConsole) {
      this.outputConsole(entry);
    }

    // Call all registered handlers
    for (const handler of this.handlers) {
      try {
        handler(entry);
      } catch (err) {
        // Silently fail to prevent logging from breaking the app
        console.error("[Logger Handler Error]", err);
      }
    }
  }

  /**
   * Format and output to console.
   *
   * @internal
   */
  private outputConsole(entry: LogEntry): void {
    const consoleMethod = entry.level as "debug" | "info" | "warn" | "error";

    if (this.structured) {
      // Structured JSON output (for production/aggregation)
      const output = {
        "@timestamp": entry.timestamp,
        level: entry.level.toUpperCase(),
        message: entry.message,
        ...entry.context,
      };
      console[consoleMethod](JSON.stringify(output));
    } else {
      // Human-readable output (for development)
      const prefix = `[${entry.level.toUpperCase()}]`;
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
      console[consoleMethod](`${prefix} ${entry.message}${contextStr}`);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global logger instance. Use this for all logging throughout the app.
 *
 * @example
 * ```ts
 * import { logger } from '@/lib/logger';
 *
 * logger.info('Something happened');
 * ```
 */
export const logger = new StructuredLogger({
  minLevel: DEFAULT_LEVEL,
  structured: DEFAULT_STRUCTURED,
  useConsole: true,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a child logger with additional context that will be included
 * in all logs from that logger instance.
 *
 * @param baseContext - Context to include in all logs from child logger
 * @returns New logger instance with context
 *
 * @example
 * ```ts
 * const certLogger = createChildLogger({ component: 'CertificatePanel' });
 * certLogger.info('Verification started'); // Includes component: 'CertificatePanel'
 * ```
 */
export function createChildLogger(baseContext: LogContext): StructuredLogger {
  const child = new StructuredLogger({
    minLevel: logger["minLevel"] ?? DEFAULT_LEVEL,
    structured: logger["structured"] ?? DEFAULT_STRUCTURED,
  });
  child.setGlobalContext(baseContext);
  return child;
}

/**
 * Format an error for structured logging.
 *
 * @param error - Error object or any throwable value
 * @returns Formatted error object suitable for logging context
 *
 * @example
 * ```ts
 * try {
 *   // ...
 * } catch (err) {
 *   logger.error('Operation failed', { error: formatError(err) });
 * }
 * ```
 */
export function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }

  return {
    errorValue: String(error),
  };
}
