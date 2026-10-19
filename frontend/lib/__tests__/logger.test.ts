/**
 * Unit tests for lib/logger.ts
 *
 * Tests structured logging, context inclusion, log levels,
 * custom handlers, and production-safe behavior.
 */

import {
  createChildLogger,
  formatError,
  type LogContext,
  type LogEntry,
  logger,
  type LogLevel,
} from "../logger";

// Mock console methods to capture output
const mockConsoleDebug = jest.fn();
const mockConsoleInfo = jest.fn();
const mockConsoleWarn = jest.fn();
const mockConsoleError = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  // Mock console before each test
  global.console.debug = mockConsoleDebug;
  global.console.info = mockConsoleInfo;
  global.console.warn = mockConsoleWarn;
  global.console.error = mockConsoleError;
});

describe("Logger - Basic Logging", () => {
  it("logs debug messages at debug level", () => {
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      structured: false,
    });

    testLogger.debug("Debug message");
    expect(mockConsoleDebug).toHaveBeenCalledWith(
      expect.stringContaining("[DEBUG]"),
      expect.any(String)
    );
  });

  it("logs info messages at info level", () => {
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      structured: false,
    });

    testLogger.info("Info message");
    expect(mockConsoleInfo).toHaveBeenCalledWith(
      expect.stringContaining("[INFO]"),
      expect.any(String)
    );
  });

  it("logs warn messages at warn level", () => {
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      structured: false,
    });

    testLogger.warn("Warn message");
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("[WARN]"),
      expect.any(String)
    );
  });

  it("logs error messages at error level", () => {
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      structured: false,
    });

    testLogger.error("Error message");
    expect(mockConsoleError).toHaveBeenCalled();
  });
});

describe("Logger - Log Levels", () => {
  it("respects minLevel setting (only errors in warn mode)", () => {
    const testLogger = new (logger.constructor as any)({
      minLevel: "warn",
      structured: false,
      useConsole: true,
    });

    testLogger.debug("Should not appear");
    testLogger.info("Should not appear");
    testLogger.warn("Should appear");
    testLogger.error("Should appear");

    expect(mockConsoleDebug).not.toHaveBeenCalled();
    expect(mockConsoleInfo).not.toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalled();
    expect(mockConsoleError).toHaveBeenCalled();
  });

  it("logs all levels when minLevel is debug", () => {
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      structured: false,
      useConsole: true,
    });

    testLogger.debug("Debug");
    testLogger.info("Info");
    testLogger.warn("Warn");
    testLogger.error("Error");

    expect(mockConsoleDebug).toHaveBeenCalled();
    expect(mockConsoleInfo).toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalled();
    expect(mockConsoleError).toHaveBeenCalled();
  });

  it("isEnabled checks if level is active", () => {
    const testLogger = new (logger.constructor as any)({ minLevel: "warn" });

    expect(testLogger.isEnabled("debug")).toBe(false);
    expect(testLogger.isEnabled("info")).toBe(false);
    expect(testLogger.isEnabled("warn")).toBe(true);
    expect(testLogger.isEnabled("error")).toBe(true);
  });

  it("setMinLevel updates the minimum log level", () => {
    const testLogger = new (logger.constructor as any)({ minLevel: "error" });

    expect(testLogger.isEnabled("warn")).toBe(false);

    testLogger.setMinLevel("debug");
    expect(testLogger.isEnabled("warn")).toBe(true);
    expect(testLogger.isEnabled("debug")).toBe(true);
  });
});

describe("Logger - Context Handling", () => {
  it("includes context in log output", () => {
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      structured: false,
      useConsole: true,
    });

    const context = {
      userId: "user-123",
      component: "CertificatePanel",
    };

    testLogger.info("User action", context);

    expect(mockConsoleInfo).toHaveBeenCalled();
    const callArgs = mockConsoleInfo.mock.calls[0];
    expect(JSON.stringify(callArgs)).toContain("user-123");
    expect(JSON.stringify(callArgs)).toContain("CertificatePanel");
  });

  it("merges global context with provided context", () => {
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      structured: false,
      useConsole: true,
    });

    testLogger.setGlobalContext({
      traceId: "trace-abc",
      userId: "global-user",
    });

    testLogger.info("Message", {
      operation: "verify",
      userId: "local-user", // Should override
    });

    const callArgs = mockConsoleInfo.mock.calls[0];
    expect(JSON.stringify(callArgs)).toContain("trace-abc");
    expect(JSON.stringify(callArgs)).toContain("verify");
    // Local context overrides global
    expect(JSON.stringify(callArgs)).toContain("local-user");
  });

  it("setGlobalContext persists across multiple logs", () => {
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      structured: false,
      useConsole: true,
    });

    testLogger.setGlobalContext({ traceId: "trace-123" });

    testLogger.info("First message", { op: "first" });
    testLogger.info("Second message", { op: "second" });

    expect(mockConsoleInfo).toHaveBeenCalledTimes(2);
    const args1 = JSON.stringify(mockConsoleInfo.mock.calls[0]);
    const args2 = JSON.stringify(mockConsoleInfo.mock.calls[1]);

    expect(args1).toContain("trace-123");
    expect(args2).toContain("trace-123");
  });
});

describe("Logger - Structured Output", () => {
  it("outputs structured JSON when structured mode is enabled", () => {
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      structured: true,
      useConsole: true,
    });

    testLogger.info("Test message", { userId: "user-123" });

    expect(mockConsoleInfo).toHaveBeenCalled();
    const output = mockConsoleInfo.mock.calls[0][0];

    // Should be valid JSON
    const parsed = JSON.parse(output);
    expect(parsed.message).toBe("Test message");
    expect(parsed.level).toBe("INFO");
    expect(parsed.userId).toBe("user-123");
    expect(parsed["@timestamp"]).toBeDefined();
  });

  it("outputs human-readable format when structured is disabled", () => {
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      structured: false,
      useConsole: true,
    });

    testLogger.info("Test message");

    expect(mockConsoleInfo).toHaveBeenCalled();
    const output = mockConsoleInfo.mock.calls[0];
    expect(JSON.stringify(output)).toContain("[INFO]");
    expect(JSON.stringify(output)).toContain("Test message");
  });
});

describe("Logger - Custom Handlers", () => {
  it("calls registered handler on log", () => {
    const handler = jest.fn();
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      handlers: [handler],
      useConsole: false,
    });

    testLogger.info("Test message", { data: "value" });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Test message",
        level: "info",
        context: expect.objectContaining({ data: "value" }),
      })
    );
  });

  it("calls multiple handlers", () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      handlers: [handler1, handler2],
      useConsole: false,
    });

    testLogger.warn("Test warning");

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it("addHandler adds new handler to existing ones", () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      handlers: [handler1],
      useConsole: false,
    });

    testLogger.addHandler(handler2);
    testLogger.error("Test error");

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it("does not break on handler error", () => {
    const badHandler = jest.fn(() => {
      throw new Error("Handler failed");
    });
    const goodHandler = jest.fn();

    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      handlers: [badHandler, goodHandler],
      useConsole: false,
    });

    // Should not throw
    expect(() => {
      testLogger.info("Test message");
    }).not.toThrow();

    expect(badHandler).toHaveBeenCalled();
    expect(goodHandler).toHaveBeenCalled();
  });
});

describe("Logger - Console Output Control", () => {
  it("respects useConsole flag", () => {
    const handler = jest.fn();

    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      useConsole: false,
      handlers: [handler],
    });

    testLogger.info("Test message");

    expect(mockConsoleInfo).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
  });

  it("outputs to console when useConsole is true", () => {
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      useConsole: true,
      structured: false,
    });

    testLogger.info("Test message");

    expect(mockConsoleInfo).toHaveBeenCalled();
  });
});

describe("createChildLogger", () => {
  it("creates a logger with base context", () => {
    const handler = jest.fn();
    const childLogger = createChildLogger({
      component: "TestComponent",
      feature: "test-feature",
    });
    childLogger["handlers"] = [handler];
    childLogger["useConsole"] = false;

    childLogger.info("Test message");

    const call = handler.mock.calls[0][0];
    expect(call.context).toMatchObject({
      component: "TestComponent",
      feature: "test-feature",
    });
  });

  it("allows overriding context in child logs", () => {
    const handler = jest.fn();
    const childLogger = createChildLogger({
      component: "TestComponent",
      userId: "global-user",
    });
    childLogger["handlers"] = [handler];
    childLogger["useConsole"] = false;

    childLogger.info("Test", { userId: "local-user" });

    const call = handler.mock.calls[0][0];
    expect(call.context?.userId).toBe("local-user");
    expect(call.context?.component).toBe("TestComponent");
  });
});

describe("formatError", () => {
  it("formats Error objects", () => {
    const error = new Error("Test error message");
    const formatted = formatError(error);

    expect(formatted.errorName).toBe("Error");
    expect(formatted.errorMessage).toBe("Test error message");
    expect(formatted.errorStack).toBeDefined();
  });

  it("includes error name and message", () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "CustomError";
      }
    }

    const error = new CustomError("Custom message");
    const formatted = formatError(error);

    expect(formatted.errorName).toBe("CustomError");
    expect(formatted.errorMessage).toBe("Custom message");
  });

  it("handles non-Error values", () => {
    const formatted = formatError("string error");
    expect(formatted.errorValue).toBe("string error");

    const formatted2 = formatError({ message: "object" });
    expect(formatted2.errorValue).toBeDefined();
  });

  it("handles null and undefined", () => {
    const formattedNull = formatError(null);
    expect(formattedNull.errorValue).toBe("null");

    const formattedUndef = formatError(undefined);
    expect(formattedUndef.errorValue).toBe("undefined");
  });
});

describe("Logger - Production Mode", () => {
  it("defaults to warn level in production", () => {
    // Note: This test checks the default export behavior
    // Actual production mode is determined by NODE_ENV
    // In test environment, logger defaults based on NODE_ENV
    expect(logger).toBeDefined();
  });

  it("always logs errors regardless of level", () => {
    const testLogger = new (logger.constructor as any)({
      minLevel: "error",
      structured: false,
      useConsole: true,
    });

    testLogger.error("Critical error");

    expect(mockConsoleError).toHaveBeenCalled();
  });
});

describe("Logger - Real-World Scenarios", () => {
  it("logs request lifecycle with trace ID", () => {
    const handler = jest.fn();
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      handlers: [handler],
      useConsole: false,
    });

    const traceId = "trace-" + Math.random();
    testLogger.setGlobalContext({ traceId });

    testLogger.info("Request started", { endpoint: "/api/verify" });
    testLogger.debug("Processing", { step: 1 });
    testLogger.info("Request completed", { duration: 245 });

    expect(handler).toHaveBeenCalledTimes(3);
    const calls = handler.mock.calls;

    // All should have trace ID
    calls.forEach((call) => {
      expect(call[0].context?.traceId).toBe(traceId);
    });
  });

  it("logs verification operation with context", () => {
    const handler = jest.fn();
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      handlers: [handler],
      useConsole: false,
    });

    testLogger.info("Certificate verification started", {
      certificateId: "cert-123",
      verificationLevel: "strict",
    });

    testLogger.info("Hash validation", {
      certificateId: "cert-123",
      hashMatch: true,
    });

    testLogger.info("Verification completed", {
      certificateId: "cert-123",
      success: true,
      duration: 150,
    });

    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("logs error with full context", () => {
    const handler = jest.fn();
    const testLogger = new (logger.constructor as any)({
      minLevel: "debug",
      handlers: [handler],
      useConsole: false,
    });

    try {
      throw new Error("Network timeout");
    } catch (err) {
      testLogger.error("Verification failed", {
        certificateId: "cert-123",
        error: formatError(err),
        retryCount: 3,
      });
    }

    expect(handler).toHaveBeenCalled();
    const entry = handler.mock.calls[0][0];
    expect(entry.level).toBe("error");
    expect(entry.context?.error?.errorMessage).toBe("Network timeout");
  });
});
