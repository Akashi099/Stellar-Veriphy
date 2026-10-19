/**
 * performance.ts
 *
 * Performance monitoring utilities including Web Vitals tracking,
 * custom performance marks, and latency measurement.
 *
 * Features:
 * - Web Vitals (LCP, FID, CLS) tracking
 * - Custom performance marks and measures
 * - Operation timing and latency tracking
 * - Render time measurement for components
 * - Automatic reporting and custom handlers
 *
 * @module lib/performance
 *
 * @example
 * ```typescript
 * // Track Web Vitals
 * setupWebVitalsTracking((vitals) => {
 *   console.log('Web Vitals:', vitals);
 *   sendToAnalytics(vitals);
 * });
 *
 * // Measure custom operations
 * const stopMeasuring = startMeasure('certificate_verification');
 * await verifyCertificate(id);
 * const duration = stopMeasuring();
 *
 * // Track API latency
 * trackApiCall('GET', '/api/certificates', 245);
 * ```
 */

import { useEffect } from "react";

import { logger } from "./logger";

// ============================================================================
// Types
// ============================================================================

/**
 * Core Web Vital metrics.
 */
export interface WebVitals {
  /** Largest Contentful Paint - when main content is visible */
  LCP?: number;
  /** First Input Delay - responsiveness to user interaction */
  FID?: number;
  /** Cumulative Layout Shift - visual stability */
  CLS?: number;
  /** Time to First Byte - server response time */
  TTFB?: number;
  /** First Contentful Paint - when first content is visible */
  FCP?: number;
}

/**
 * Performance metric entry.
 */
export interface PerformanceMetric {
  name: string;
  value: number;
  unit: "ms" | "bytes" | "score";
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * API call performance metric.
 */
export interface ApiMetric {
  method: string;
  endpoint: string;
  duration: number;
  timestamp: number;
  status?: number | undefined;
  error?: boolean;
}

/**
 * Component render performance.
 */
export interface RenderMetric {
  component: string;
  renderTime: number;
  timestamp: number;
  props?: Record<string, unknown> | undefined;
}

/**
 * Configuration for performance monitoring.
 */
export interface PerformanceConfig {
  enableWebVitals?: boolean;
  enableApiTracking?: boolean;
  enableRenderTracking?: boolean;
  onMetric?: (metric: PerformanceMetric) => void;
  onWebVitals?: (vitals: WebVitals) => void;
  onApiMetric?: (metric: ApiMetric) => void;
  onRenderMetric?: (metric: RenderMetric) => void;
}

// ============================================================================
// Performance Tracker Class
// ============================================================================

/**
 * PerformanceTracker manages application performance monitoring.
 * Tracks Web Vitals, custom operations, API calls, and component rendering.
 */
class PerformanceTracker {
  private enableWebVitals = true;
  private enableApiTracking = true;
  private enableRenderTracking = true;
  private onMetric?: ((metric: PerformanceMetric) => void) | undefined;
  private onWebVitals?: ((vitals: WebVitals) => void) | undefined;
  private onApiMetric?: ((metric: ApiMetric) => void) | undefined;
  private onRenderMetric?: ((metric: RenderMetric) => void) | undefined;
  private metrics: PerformanceMetric[] = [];
  private apiMetrics: ApiMetric[] = [];
  private renderMetrics: RenderMetric[] = [];
  private webVitals: WebVitals = {};
  private marks: Map<string, number> = new Map();

  constructor(config?: PerformanceConfig) {
    if (config?.enableWebVitals !== undefined) {
      this.enableWebVitals = config.enableWebVitals;
    }
    if (config?.enableApiTracking !== undefined) {
      this.enableApiTracking = config.enableApiTracking;
    }
    if (config?.enableRenderTracking !== undefined) {
      this.enableRenderTracking = config.enableRenderTracking;
    }
    this.onMetric = config?.onMetric;
    this.onWebVitals = config?.onWebVitals;
    this.onApiMetric = config?.onApiMetric;
    this.onRenderMetric = config?.onRenderMetric;

    this.initializeWebVitalsTracking();
  }

  /**
   * Initialize Web Vitals tracking using native browser APIs.
   *
   * @internal
   */
  private initializeWebVitalsTracking(): void {
    if (!this.enableWebVitals || typeof window === "undefined") {
      return;
    }

    // Track Largest Contentful Paint (LCP)
    if ("PerformanceObserver" in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as
            (PerformanceEntry & { renderTime?: number; loadTime?: number }) | undefined;
          if (!lastEntry) return;
          const lcp = lastEntry.renderTime || lastEntry.loadTime;
          if (lcp !== undefined) this.webVitals.LCP = lcp;
          this.reportWebVitals();
        });
        lcpObserver.observe({ entryTypes: ["largest-contentful-paint"] });
      } catch (err) {
        logger.debug("LCP tracking failed", { error: String(err) });
      }

      // Track Cumulative Layout Shift (CLS)
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if ((entry as any).hadRecentInput) continue;
            clsValue += (entry as any).value;
            this.webVitals.CLS = clsValue;
            this.reportWebVitals();
          }
        });
        clsObserver.observe({ entryTypes: ["layout-shift"] });
      } catch (err) {
        logger.debug("CLS tracking failed", { error: String(err) });
      }

      // Track First Input Delay (FID) - deprecated but still useful
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            const entry = entries[0] as any;
            this.webVitals.FID = entry.processingDuration;
            this.reportWebVitals();
          }
        });
        fidObserver.observe({ entryTypes: ["first-input"] });
      } catch (err) {
        logger.debug("FID tracking failed", { error: String(err) });
      }
    }

    // Track TTFB and FCP via navigation timing
    if ("performance" in window) {
      window.addEventListener("load", () => {
        const navigation = window.performance.getEntriesByType("navigation")[0] as any;
        if (navigation) {
          this.webVitals.TTFB = navigation.responseStart - navigation.fetchStart;
        }

        const fcpEntries = window.performance.getEntriesByName("first-contentful-paint");
        if (fcpEntries.length > 0 && fcpEntries[0]) {
          this.webVitals.FCP = fcpEntries[0].startTime;
        }

        this.reportWebVitals();
      });
    }
  }

  /**
   * Report Web Vitals to handlers.
   *
   * @internal
   */
  private reportWebVitals(): void {
    if (this.onWebVitals) {
      this.onWebVitals(this.webVitals);
    }

    logger.debug("Web Vitals updated", {
      vitals: this.webVitals,
    });
  }

  /**
   * Start measuring a named operation.
   *
   * @param name - Name of the operation
   * @returns Stop function that returns duration in ms
   *
   * @example
   * ```ts
   * const stop = tracker.startMeasure('verify_certificate');
   * await verifyCertificate(id);
   * const duration = stop();
   * ```
   */
  startMeasure(name: string): () => number {
    const startTime = performance.now();
    this.marks.set(name, startTime);

    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      this.marks.delete(name);

      this.recordMetric({
        name,
        value: duration,
        unit: "ms",
        timestamp: Date.now(),
      });

      return duration;
    };
  }

  /**
   * Record a custom performance metric.
   *
   * @param metric - Metric to record
   */
  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    if (this.onMetric) {
      this.onMetric(metric);
    }

    logger.debug("Performance metric recorded", {
      metric: metric.name,
      value: metric.value,
      unit: metric.unit,
    });
  }

  /**
   * Track API call latency.
   *
   * @param method - HTTP method (GET, POST, etc.)
   * @param endpoint - API endpoint
   * @param duration - Request duration in ms
   * @param status - HTTP status code (optional)
   *
   * @example
   * ```ts
   * const start = performance.now();
   * const response = await fetch('/api/certificates');
   * const duration = performance.now() - start;
   * tracker.trackApiCall('GET', '/api/certificates', duration, response.status);
   * ```
   */
  trackApiCall(method: string, endpoint: string, duration: number, status?: number): void {
    const metric: ApiMetric = {
      method,
      endpoint,
      duration,
      timestamp: Date.now(),
      status,
      error: status ? status >= 400 : false,
    };

    if (this.enableApiTracking) {
      this.apiMetrics.push(metric);

      if (this.onApiMetric) {
        this.onApiMetric(metric);
      }

      logger.debug("API call tracked", {
        method,
        endpoint,
        duration,
        status,
      });
    }
  }

  /**
   * Track component render time.
   *
   * @param component - Component name
   * @param renderTime - Render duration in ms
   * @param props - Component props (optional)
   *
   * @example
   * ```ts
   * const start = performance.now();
   * // component rendering
   * const duration = performance.now() - start;
   * tracker.trackRender('CertificateCard', duration);
   * ```
   */
  trackRender(component: string, renderTime: number, props?: Record<string, unknown>): void {
    const metric: RenderMetric = {
      component,
      renderTime,
      timestamp: Date.now(),
      props,
    };

    if (this.enableRenderTracking) {
      this.renderMetrics.push(metric);

      if (this.onRenderMetric) {
        this.onRenderMetric(metric);
      }

      // Warn if render time exceeds threshold
      if (renderTime > 50) {
        logger.warn("Slow component render", {
          component,
          renderTime,
          threshold: 50,
        });
      }
    }
  }

  /**
   * Get all recorded metrics.
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get all API metrics.
   */
  getApiMetrics(): ApiMetric[] {
    return [...this.apiMetrics];
  }

  /**
   * Get all render metrics.
   */
  getRenderMetrics(): RenderMetric[] {
    return [...this.renderMetrics];
  }

  /**
   * Get current Web Vitals.
   */
  getWebVitals(): WebVitals {
    return { ...this.webVitals };
  }

  /**
   * Get average API latency by endpoint.
   */
  getAverageApiLatency(endpoint?: string): number {
    const metrics = endpoint
      ? this.apiMetrics.filter((m) => m.endpoint === endpoint)
      : this.apiMetrics;

    if (metrics.length === 0) return 0;

    const total = metrics.reduce((sum, m) => sum + m.duration, 0);
    return total / metrics.length;
  }

  /**
   * Get average render time by component.
   */
  getAverageRenderTime(component?: string): number {
    const metrics = component
      ? this.renderMetrics.filter((m) => m.component === component)
      : this.renderMetrics;

    if (metrics.length === 0) return 0;

    const total = metrics.reduce((sum, m) => sum + m.renderTime, 0);
    return total / metrics.length;
  }

  /**
   * Clear all recorded metrics.
   */
  clearMetrics(): void {
    this.metrics = [];
    this.apiMetrics = [];
    this.renderMetrics = [];
    this.marks.clear();
    logger.debug("Performance metrics cleared");
  }

  /**
   * Get a summary of performance data.
   */
  getSummary() {
    return {
      webVitals: this.getWebVitals(),
      totalMetrics: this.metrics.length,
      totalApiCalls: this.apiMetrics.length,
      averageApiLatency: this.getAverageApiLatency(),
      totalRenders: this.renderMetrics.length,
      averageRenderTime: this.getAverageRenderTime(),
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global performance tracker instance.
 *
 * @example
 * ```ts
 * import { performanceTracker } from '@/lib/performance';
 *
 * const stop = performanceTracker.startMeasure('operation');
 * // do work
 * const duration = stop();
 * ```
 */
export const performanceTracker = new PerformanceTracker({
  enableWebVitals: true,
  enableApiTracking: true,
  enableRenderTracking: process.env.NODE_ENV === "development",
});

// ============================================================================
// React Hook for Component Render Tracking
// ============================================================================

/**
 * React hook to automatically track component render time.
 *
 * Call at the beginning of your component. Will measure time from when
 * component starts rendering to when effect runs (approximately).
 *
 * @param componentName - Name of the component
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   useRenderTracking('MyComponent');
 *   return <div>Content</div>;
 * }
 * ```
 */
export function useRenderTracking(componentName: string): void {
  const startTime = performance.now();

  // Measure using React's useEffect to catch actual render time
  useEffect(() => {
    if (typeof window === "undefined") return;
    const renderTime = performance.now() - startTime;
    performanceTracker.trackRender(componentName, renderTime);
  });
}

// ============================================================================
// API Instrumentation
// ============================================================================

/**
 * Wrap a fetch call to automatically track API latency.
 *
 * @param method - HTTP method
 * @param endpoint - API endpoint
 * @param fetchFn - Async function that makes the request
 * @returns Result of fetchFn with timing tracked
 *
 * @example
 * ```ts
 * const data = await trackedFetch(
 *   'GET',
 *   '/api/certificates',
 *   () => fetch('/api/certificates').then(r => r.json())
 * );
 * ```
 */
export async function trackedFetch<T>(
  method: string,
  endpoint: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  const startTime = performance.now();

  try {
    const result = await fetchFn();
    const duration = performance.now() - startTime;
    performanceTracker.trackApiCall(method, endpoint, duration);
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    performanceTracker.trackApiCall(method, endpoint, duration, 500);
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Report performance metrics to console or external service.
 *
 * @example
 * ```ts
 * reportPerformanceMetrics((summary) => {
 *   console.log('Performance Report:', summary);
 * });
 * ```
 */
export function reportPerformanceMetrics(
  callback?: (summary: ReturnType<typeof performanceTracker.getSummary>) => void
): void {
  const summary = performanceTracker.getSummary();

  logger.info("Performance Summary", summary);

  if (callback) {
    callback(summary);
  }
}

/**
 * Check if any Core Web Vitals exceed recommended thresholds.
 *
 * Thresholds based on Google's recommendations:
 * - LCP: 2.5s
 * - FID: 100ms
 * - CLS: 0.1
 */
export function checkWebVitalsThresholds(): {
  passed: boolean;
  violations: Array<{ metric: string; value: number; threshold: number }>;
} {
  const vitals = performanceTracker.getWebVitals();
  const violations: Array<{
    metric: string;
    value: number;
    threshold: number;
  }> = [];

  if (vitals.LCP && vitals.LCP > 2500) {
    violations.push({ metric: "LCP", value: vitals.LCP, threshold: 2500 });
  }

  if (vitals.FID && vitals.FID > 100) {
    violations.push({ metric: "FID", value: vitals.FID, threshold: 100 });
  }

  if (vitals.CLS && vitals.CLS > 0.1) {
    violations.push({ metric: "CLS", value: vitals.CLS, threshold: 0.1 });
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
