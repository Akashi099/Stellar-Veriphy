/**
 * Unit tests for lib/performance.ts
 *
 * Tests Web Vitals tracking, custom performance marks,
 * API latency tracking, and render time measurement.
 */

import {
  type ApiMetric,
  checkWebVitalsThresholds,
  type PerformanceMetric,
  performanceTracker,
  reportPerformanceMetrics,
  trackedFetch,
} from "../performance";

// Mock performance API
const mockPerformanceNow = jest.fn();
let performanceTime = 0;

beforeEach(() => {
  jest.clearAllMocks();
  performanceTime = 0;

  // Mock performance.now()
  mockPerformanceNow.mockImplementation(() => {
    performanceTime += 10;
    return performanceTime;
  });

  global.performance.now = mockPerformanceNow as any;

  // Clear metrics
  performanceTracker.clearMetrics();
});

describe("PerformanceTracker - Basic Metrics", () => {
  it("records custom metrics", () => {
    performanceTracker.recordMetric({
      name: "test_operation",
      value: 100,
      unit: "ms",
      timestamp: Date.now(),
    });

    const metrics = performanceTracker.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].name).toBe("test_operation");
    expect(metrics[0].value).toBe(100);
  });

  it("records multiple metrics", () => {
    performanceTracker.recordMetric({
      name: "metric1",
      value: 50,
      unit: "ms",
      timestamp: Date.now(),
    });

    performanceTracker.recordMetric({
      name: "metric2",
      value: 75,
      unit: "ms",
      timestamp: Date.now(),
    });

    expect(performanceTracker.getMetrics()).toHaveLength(2);
  });

  it("includes metadata in metrics", () => {
    performanceTracker.recordMetric({
      name: "operation",
      value: 100,
      unit: "ms",
      timestamp: Date.now(),
      metadata: {
        certificateId: "cert-123",
        userId: "user-456",
      },
    });

    const metrics = performanceTracker.getMetrics();
    expect(metrics[0].metadata).toEqual({
      certificateId: "cert-123",
      userId: "user-456",
    });
  });
});

describe("PerformanceTracker - Measure Operations", () => {
  it("measures operation duration", () => {
    const stop = performanceTracker.startMeasure("operation");

    performanceTime += 100; // Simulate work
    const duration = stop();

    expect(duration).toBeGreaterThan(0);
    expect(performanceTracker.getMetrics()).toHaveLength(1);
    expect(performanceTracker.getMetrics()[0].value).toBe(duration);
  });

  it("records multiple measurements", () => {
    const stop1 = performanceTracker.startMeasure("op1");
    performanceTime += 50;
    stop1();

    const stop2 = performanceTracker.startMeasure("op2");
    performanceTime += 75;
    stop2();

    const metrics = performanceTracker.getMetrics();
    expect(metrics).toHaveLength(2);
  });

  it("records metric name correctly", () => {
    const stop = performanceTracker.startMeasure("certificate_verification");
    performanceTime += 100;
    stop();

    const metrics = performanceTracker.getMetrics();
    expect(metrics[0].name).toBe("certificate_verification");
  });
});

describe("PerformanceTracker - API Tracking", () => {
  it("tracks API calls", () => {
    performanceTracker.trackApiCall("GET", "/api/certificates", 245);

    const metrics = performanceTracker.getApiMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].method).toBe("GET");
    expect(metrics[0].endpoint).toBe("/api/certificates");
    expect(metrics[0].duration).toBe(245);
  });

  it("tracks API status codes", () => {
    performanceTracker.trackApiCall("POST", "/api/verify", 100, 200);
    performanceTracker.trackApiCall("POST", "/api/verify", 50, 400);

    const metrics = performanceTracker.getApiMetrics();
    expect(metrics[0].status).toBe(200);
    expect(metrics[0].error).toBe(false);
    expect(metrics[1].status).toBe(400);
    expect(metrics[1].error).toBe(true);
  });

  it("marks errors based on status code", () => {
    performanceTracker.trackApiCall("GET", "/api/test", 100, 500);
    performanceTracker.trackApiCall("GET", "/api/test", 100, 200);

    const metrics = performanceTracker.getApiMetrics();
    expect(metrics[0].error).toBe(true);
    expect(metrics[1].error).toBe(false);
  });

  it("calculates average API latency", () => {
    performanceTracker.trackApiCall("GET", "/api/certs", 100);
    performanceTracker.trackApiCall("GET", "/api/certs", 200);
    performanceTracker.trackApiCall("GET", "/api/certs", 150);

    const average = performanceTracker.getAverageApiLatency("/api/certs");
    expect(average).toBe(150);
  });

  it("calculates average latency across all endpoints", () => {
    performanceTracker.trackApiCall("GET", "/api/certs", 100);
    performanceTracker.trackApiCall("POST", "/api/verify", 200);

    const average = performanceTracker.getAverageApiLatency();
    expect(average).toBe(150);
  });

  it("returns 0 for empty API metrics", () => {
    const average = performanceTracker.getAverageApiLatency();
    expect(average).toBe(0);
  });
});

describe("PerformanceTracker - Render Tracking", () => {
  it("tracks component render time", () => {
    performanceTracker.trackRender("CertificateCard", 25);

    const metrics = performanceTracker.getRenderMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].component).toBe("CertificateCard");
    expect(metrics[0].renderTime).toBe(25);
  });

  it("includes props in render metrics", () => {
    performanceTracker.trackRender("CertificateCard", 25, {
      id: "cert-123",
      showDetails: true,
    });

    const metrics = performanceTracker.getRenderMetrics();
    expect(metrics[0].props).toEqual({
      id: "cert-123",
      showDetails: true,
    });
  });

  it("calculates average render time by component", () => {
    performanceTracker.trackRender("Card", 20);
    performanceTracker.trackRender("Card", 30);
    performanceTracker.trackRender("Button", 5);

    const cardAvg = performanceTracker.getAverageRenderTime("Card");
    expect(cardAvg).toBe(25);

    const buttonAvg = performanceTracker.getAverageRenderTime("Button");
    expect(buttonAvg).toBe(5);
  });

  it("calculates average render time across all components", () => {
    performanceTracker.trackRender("Card", 20);
    performanceTracker.trackRender("Button", 10);

    const average = performanceTracker.getAverageRenderTime();
    expect(average).toBe(15);
  });

  it("warns for slow renders", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    performanceTracker.trackRender("SlowComponent", 100);

    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe("PerformanceTracker - Web Vitals", () => {
  it("retrieves current Web Vitals", () => {
    const vitals = performanceTracker.getWebVitals();

    expect(vitals).toBeDefined();
    expect(typeof vitals).toBe("object");
  });

  it("returns copy of Web Vitals", () => {
    const vitals1 = performanceTracker.getWebVitals();
    const vitals2 = performanceTracker.getWebVitals();

    expect(vitals1).not.toBe(vitals2);
    expect(vitals1).toEqual(vitals2);
  });
});

describe("PerformanceTracker - Data Management", () => {
  it("clears all metrics", () => {
    performanceTracker.recordMetric({
      name: "test",
      value: 100,
      unit: "ms",
      timestamp: Date.now(),
    });
    performanceTracker.trackApiCall("GET", "/api/test", 100);
    performanceTracker.trackRender("Component", 20);

    expect(performanceTracker.getMetrics().length).toBeGreaterThan(0);

    performanceTracker.clearMetrics();

    expect(performanceTracker.getMetrics()).toHaveLength(0);
    expect(performanceTracker.getApiMetrics()).toHaveLength(0);
    expect(performanceTracker.getRenderMetrics()).toHaveLength(0);
  });

  it("gets performance summary", () => {
    performanceTracker.recordMetric({
      name: "test",
      value: 100,
      unit: "ms",
      timestamp: Date.now(),
    });
    performanceTracker.trackApiCall("GET", "/api/test", 150);
    performanceTracker.trackRender("Component", 25);

    const summary = performanceTracker.getSummary();

    expect(summary).toHaveProperty("webVitals");
    expect(summary).toHaveProperty("totalMetrics");
    expect(summary).toHaveProperty("totalApiCalls");
    expect(summary).toHaveProperty("averageApiLatency");
    expect(summary).toHaveProperty("totalRenders");
    expect(summary).toHaveProperty("averageRenderTime");

    expect(summary.totalMetrics).toBe(1);
    expect(summary.totalApiCalls).toBe(1);
    expect(summary.totalRenders).toBe(1);
  });
});

describe("trackedFetch", () => {
  it("tracks successful fetch", async () => {
    const mockFetch = jest.fn().mockResolvedValue({ data: "success", status: 200 });

    performanceTime = 0;
    const result = await trackedFetch("GET", "/api/test", mockFetch);

    expect(result).toEqual({ data: "success", status: 200 });
    expect(performanceTracker.getApiMetrics()).toHaveLength(1);
  });

  it("tracks failed fetch", async () => {
    const error = new Error("Network error");
    const mockFetch = jest.fn().mockRejectedValue(error);

    await expect(trackedFetch("GET", "/api/test", mockFetch)).rejects.toThrow("Network error");

    expect(performanceTracker.getApiMetrics()).toHaveLength(1);
    const metric = performanceTracker.getApiMetrics()[0];
    expect(metric.error).toBe(true);
  });

  it("records duration for successful call", async () => {
    const mockFetch = jest.fn().mockResolvedValue({ success: true });

    performanceTime = 0;
    await trackedFetch("GET", "/api/test", mockFetch);

    const metric = performanceTracker.getApiMetrics()[0];
    expect(metric.duration).toBeGreaterThan(0);
  });

  it("records duration for failed call", async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error("fail"));

    performanceTime = 0;
    try {
      await trackedFetch("GET", "/api/test", mockFetch);
    } catch (e) {
      // Expected to fail
    }

    const metric = performanceTracker.getApiMetrics()[0];
    expect(metric.duration).toBeGreaterThan(0);
  });
});

describe("reportPerformanceMetrics", () => {
  it("calls callback with summary", () => {
    const callback = jest.fn();

    performanceTracker.recordMetric({
      name: "test",
      value: 100,
      unit: "ms",
      timestamp: Date.now(),
    });

    reportPerformanceMetrics(callback);

    expect(callback).toHaveBeenCalled();
    const summary = callback.mock.calls[0][0];
    expect(summary.totalMetrics).toBe(1);
  });

  it("works without callback", () => {
    expect(() => {
      reportPerformanceMetrics();
    }).not.toThrow();
  });

  it("logs summary to console", () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation();

    performanceTracker.recordMetric({
      name: "test",
      value: 100,
      unit: "ms",
      timestamp: Date.now(),
    });

    reportPerformanceMetrics();

    expect(infoSpy).toHaveBeenCalled();

    infoSpy.mockRestore();
  });
});

describe("checkWebVitalsThresholds", () => {
  it("passes when no vitals exceed thresholds", () => {
    const result = checkWebVitalsThresholds();

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("detects LCP violations", () => {
    // Mock Web Vitals with LCP > 2500ms
    performanceTracker["webVitals"].LCP = 3000;

    const result = checkWebVitalsThresholds();

    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].metric).toBe("LCP");
    expect(result.violations[0].value).toBe(3000);
  });

  it("detects FID violations", () => {
    performanceTracker["webVitals"].FID = 150;

    const result = checkWebVitalsThresholds();

    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.metric === "FID")).toBe(true);
  });

  it("detects CLS violations", () => {
    performanceTracker["webVitals"].CLS = 0.2;

    const result = checkWebVitalsThresholds();

    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.metric === "CLS")).toBe(true);
  });

  it("detects multiple violations", () => {
    performanceTracker["webVitals"].LCP = 3000;
    performanceTracker["webVitals"].FID = 150;
    performanceTracker["webVitals"].CLS = 0.2;

    const result = checkWebVitalsThresholds();

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(3);
  });
});

describe("PerformanceTracker - Real-World Scenarios", () => {
  it("tracks certificate verification workflow", async () => {
    const stop = performanceTracker.startMeasure("verify_certificate");

    // Simulate fetch
    performanceTime += 100;
    performanceTracker.trackApiCall("POST", "/api/verify", 100);

    performanceTime += 50;
    const duration = stop();

    expect(duration).toBeGreaterThan(0);
    expect(performanceTracker.getMetrics()).toHaveLength(1);
    expect(performanceTracker.getApiMetrics()).toHaveLength(1);
  });

  it("tracks multiple operations concurrently", () => {
    const stop1 = performanceTracker.startMeasure("operation1");
    const stop2 = performanceTracker.startMeasure("operation2");

    performanceTime += 50;
    const dur1 = stop1();

    performanceTime += 50;
    const dur2 = stop2();

    expect(dur1).toBeGreaterThan(0);
    expect(dur2).toBeGreaterThan(0);
    expect(performanceTracker.getMetrics()).toHaveLength(2);
  });

  it("tracks complete user interaction", () => {
    // User starts verification
    const stopMeasure = performanceTracker.startMeasure("user_verification");

    // Component renders
    performanceTracker.trackRender("VerificationForm", 15);

    // API call
    performanceTime += 200;
    performanceTracker.trackApiCall("POST", "/api/certificates/verify", 200);

    // Component re-renders
    performanceTracker.trackRender("ResultCard", 20);

    const duration = stopMeasure();

    const summary = performanceTracker.getSummary();
    expect(summary.totalMetrics).toBe(1);
    expect(summary.totalApiCalls).toBe(1);
    expect(summary.totalRenders).toBe(2);
  });
});
