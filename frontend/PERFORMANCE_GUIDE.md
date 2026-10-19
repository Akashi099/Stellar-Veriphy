# Performance Monitoring & Optimization Guide

Comprehensive guide for monitoring and optimizing application performance.

## Overview

The performance monitoring system provides:

- **Web Vitals tracking**: LCP, FID, CLS, TTFB, FCP
- **Custom operation timing**: Measure any operation
- **API latency tracking**: Monitor endpoint performance
- **Component render profiling**: Track render times
- **Performance reporting**: Summarize and report metrics
- **Threshold detection**: Alert on performance degradation

## Architecture

### Web Vitals

| Metric   | Full Name                | Threshold | Measures                        |
| -------- | ------------------------ | --------- | ------------------------------- |
| **LCP**  | Largest Contentful Paint | ≤ 2.5s    | When largest content is visible |
| **FID**  | First Input Delay        | ≤ 100ms   | Responsiveness to user input    |
| **CLS**  | Cumulative Layout Shift  | ≤ 0.1     | Visual stability                |
| **TTFB** | Time to First Byte       | ≤ 600ms   | Server response time            |
| **FCP**  | First Contentful Paint   | ≤ 1.8s    | When first content appears      |

### Performance Data Flow

```
Operation Execution
    ↓
Performance Measurement
    ↓
Metric Recording
    ↓
Handler/Callback
    ↓
Analytics/Logging
```

## Basic Usage

### Measure Custom Operations

```typescript
import { performanceTracker } from "@/lib/performance";

// Simple measurement
const stop = performanceTracker.startMeasure("my_operation");

// Do work
await doSomething();

// Stop and get duration
const duration = stop(); // Returns duration in ms
console.log(`Operation took ${duration}ms`);
```

### Track API Calls

```typescript
import { performanceTracker, trackedFetch } from "@/lib/performance";

// Manual tracking
const start = performance.now();
const response = await fetch("/api/certificates");
const duration = performance.now() - start;
performanceTracker.trackApiCall("GET", "/api/certificates", duration);

// Automatic tracking with wrapper
const data = await trackedFetch("GET", "/api/certificates", () =>
  fetch("/api/certificates").then((r) => r.json())
);
```

### Track Component Renders

```typescript
import { performanceTracker } from '@/lib/performance';

export function CertificateCard({ data }: Props) {
  const start = performance.now();

  // Component content
  const content = (
    <div>
      {/* rendering */}
    </div>
  );

  // After first paint, record render time
  useLayoutEffect(() => {
    const renderTime = performance.now() - start;
    performanceTracker.trackRender('CertificateCard', renderTime);
  }, []);

  return content;
}
```

## Advanced Usage

### Record Metrics with Context

```typescript
// Record metric with metadata
performanceTracker.recordMetric({
  name: "certificate_verification",
  value: 245,
  unit: "ms",
  timestamp: Date.now(),
  metadata: {
    certificateId: "cert-123",
    verificationLevel: "strict",
    success: true,
  },
});
```

### Get Performance Statistics

```typescript
// Average API latency for specific endpoint
const avgLatency = performanceTracker.getAverageApiLatency("/api/certificates");

// Average latency across all endpoints
const overallLatency = performanceTracker.getAverageApiLatency();

// Average render time for component
const cardRenderTime = performanceTracker.getAverageRenderTime("CertificateCard");

// Full performance summary
const summary = performanceTracker.getSummary();
console.log(summary);
/*
{
  webVitals: { LCP: 1234, FID: 45, CLS: 0.05 },
  totalMetrics: 142,
  totalApiCalls: 23,
  averageApiLatency: 189,
  totalRenders: 54,
  averageRenderTime: 18
}
*/
```

### Check Performance Thresholds

```typescript
import { checkWebVitalsThresholds } from "@/lib/performance";

const { passed, violations } = checkWebVitalsThresholds();

if (!passed) {
  violations.forEach(({ metric, value, threshold }) => {
    console.warn(`${metric} violation: ${value}ms (threshold: ${threshold}ms)`);
  });

  // Send alert
  notifyPerformanceDegradation(violations);
}
```

### Report Performance Metrics

```typescript
import { reportPerformanceMetrics } from "@/lib/performance";

// With callback
reportPerformanceMetrics((summary) => {
  console.log("Performance Report:", summary);
  analyticsService.trackPerformance(summary);
});

// Without callback (logs to console)
reportPerformanceMetrics();
```

## Integration Patterns

### In React Components

```typescript
'use client';

import { useEffect } from 'react';
import { performanceTracker } from '@/lib/performance';

export function VerificationPanel() {
  useEffect(() => {
    const stop = performanceTracker.startMeasure('verification_interaction');

    // Log cleanup with duration
    return () => {
      const duration = stop();
      performanceTracker.recordMetric({
        name: 'verification_panel_lifetime',
        value: duration,
        unit: 'ms',
        timestamp: Date.now(),
      });
    };
  }, []);

  return <div>{/* content */}</div>;
}
```

### In Services

```typescript
// services/certificateVerificationService.ts
import { performanceTracker } from "@/lib/performance";

export async function verifyCertificateAuthenticity(id: string) {
  const stop = performanceTracker.startMeasure(`verify_authenticity_${id}`);

  try {
    const cert = await getCertificateById(id);
    const hashValid = await validateHash(cert);
    const signatureValid = await validateSignature(cert);

    const duration = stop();

    performanceTracker.recordMetric({
      name: "certificate_verification_success",
      value: duration,
      unit: "ms",
      timestamp: Date.now(),
      metadata: {
        certificateId: id,
        hashValid,
        signatureValid,
      },
    });

    return {
      authentic: hashValid && signatureValid,
      details: ["Hash validated", "Signature verified"],
    };
  } catch (error) {
    const duration = stop();

    performanceTracker.recordMetric({
      name: "certificate_verification_error",
      value: duration,
      unit: "ms",
      timestamp: Date.now(),
      metadata: {
        certificateId: id,
        error: error.message,
      },
    });

    throw error;
  }
}
```

### With React Query

```typescript
import { useQuery } from "@tanstack/react-query";
import { performanceTracker } from "@/lib/performance";

export function useCertificateById(id: string) {
  return useQuery({
    queryKey: ["certificates", id],
    queryFn: async () => {
      const stop = performanceTracker.startMeasure(`fetch_cert_${id}`);

      try {
        const result = await getCertificateById(id);
        const duration = stop();

        performanceTracker.recordMetric({
          name: "certificate_fetch",
          value: duration,
          unit: "ms",
          timestamp: Date.now(),
          metadata: { certificateId: id, success: true },
        });

        return result;
      } catch (error) {
        const duration = stop();
        performanceTracker.recordMetric({
          name: "certificate_fetch_error",
          value: duration,
          unit: "ms",
          timestamp: Date.now(),
          metadata: { certificateId: id, error: error.message },
        });
        throw error;
      }
    },
  });
}
```

### API Middleware Integration

```typescript
// middleware/performanceMiddleware.ts
import { performanceTracker } from "@/lib/performance";

export function withPerformanceTracking(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    const method = req.method;
    const endpoint = new URL(req.url).pathname;
    const start = performance.now();

    try {
      const response = await handler(req);
      const duration = performance.now() - start;

      performanceTracker.trackApiCall(method, endpoint, duration, response.status);

      return response;
    } catch (error) {
      const duration = performance.now() - start;
      performanceTracker.trackApiCall(method, endpoint, duration, 500);
      throw error;
    }
  };
}

// Usage
export async function POST(request: Request) {
  return withPerformanceTracking(async () => {
    // handler code
  })(request);
}
```

## Performance Optimization

### Identifying Bottlenecks

1. **Monitor Web Vitals**

   ```typescript
   checkWebVitalsThresholds(); // Check for violations
   ```

2. **Track Slow Operations**

   ```typescript
   // Alert when render > 50ms
   performanceTracker.trackRender(component, time);
   ```

3. **Monitor API Performance**
   ```typescript
   // Get slow endpoints
   const latency = performanceTracker.getAverageApiLatency(endpoint);
   if (latency > 300) {
     logger.warn("Slow endpoint", { endpoint, latency });
   }
   ```

### Common Performance Issues & Solutions

| Issue             | Metric           | Solution                               |
| ----------------- | ---------------- | -------------------------------------- |
| Slow initial load | High LCP         | Code splitting, lazy loading           |
| Unresponsive UI   | High FID         | Reduce JS execution                    |
| Layout shifts     | High CLS         | Fixed dimensions, content placeholders |
| Slow API          | High latency     | Caching, pagination, optimization      |
| Slow render       | High render time | Memoization, virtualization            |

### Best Practices

1. **Measure Real User Performance**

   ```typescript
   // Not synthetic/lab data
   reportPerformanceMetrics((summary) => {
     sendToAnalytics(summary); // Real user metrics
   });
   ```

2. **Set Performance Budgets**

   ```typescript
   const latency = performanceTracker.getAverageApiLatency("/api/verify");
   if (latency > 500) {
     // Budget exceeded
     alertPerformanceDegradation();
   }
   ```

3. **Monitor Continuously**

   ```typescript
   // Check Web Vitals regularly
   setInterval(() => {
     checkWebVitalsThresholds();
   }, 30000);
   ```

4. **Optimize Before It's Critical**
   ```typescript
   if (avgRenderTime > 50) {
     // Warn before it becomes a problem
     logger.warn("Component render approaching threshold");
   }
   ```

## Production Setup

### Enable Performance Monitoring

```typescript
// app/layout.tsx
import { performanceTracker, reportPerformanceMetrics } from '@/lib/performance';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Set up performance reporting
  useEffect(() => {
    // Report on page unload
    const handleBeforeUnload = () => {
      reportPerformanceMetrics((summary) => {
        // Send to analytics
        navigator.sendBeacon('/api/metrics', JSON.stringify(summary));
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

### Custom Handler for APM Integration

```typescript
import { performanceTracker } from "@/lib/performance";

// Send performance data to service
const performanceHandler = (metric: PerformanceMetric) => {
  // Send to DataDog, New Relic, etc.
  if (process.env.NEXT_PUBLIC_APM_ENDPOINT) {
    fetch(process.env.NEXT_PUBLIC_APM_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        name: metric.name,
        value: metric.value,
        unit: metric.unit,
        timestamp: metric.timestamp,
        metadata: metric.metadata,
      }),
    });
  }
};

// Register handler (e.g., in app initialization)
performanceTracker["onMetric"] = performanceHandler;
```

### Monitor Thresholds

```typescript
// Check Web Vitals periodically
setInterval(() => {
  const { passed, violations } = checkWebVitalsThresholds();

  if (!passed) {
    violations.forEach(({ metric, value, threshold }) => {
      logger.warn("Performance threshold exceeded", {
        metric,
        value,
        threshold,
      });

      // Alert on-call if critical
      if (value > threshold * 1.5) {
        sendAlert(`Critical: ${metric} = ${value}`);
      }
    });
  }
}, 60000); // Check every minute
```

## Monitoring Dashboard Metrics

Key metrics to display in a dashboard:

```typescript
const dashboardData = {
  webVitals: performanceTracker.getWebVitals(),
  apiMetrics: {
    totalCalls: performanceTracker.getApiMetrics().length,
    avgLatency: performanceTracker.getAverageApiLatency(),
    errorRate: errorCount / totalCount,
    slowCalls: slowCallCount, // > 500ms
  },
  renderMetrics: {
    totalRenders: performanceTracker.getRenderMetrics().length,
    avgRenderTime: performanceTracker.getAverageRenderTime(),
    slowRenders: slowRenderCount, // > 50ms
  },
  health: {
    allMetricsNormal: checkWebVitalsThresholds().passed,
    p95ApiLatency: calculatePercentile(95),
    errorRate: calculateErrorRate(),
  },
};
```

## Troubleshooting

### Metrics Not Recording

1. Check if tracker is initialized
2. Verify handlers are registered
3. Check log level (should be at least 'debug')

### High Latency Issues

1. Check API endpoint performance
2. Look for network issues
3. Profile backend services

### Render Time Too High

1. Check component complexity
2. Use React DevTools profiler
3. Look for unnecessary re-renders
4. Consider memoization/virtualization

## References

- [Web Vitals](https://web.dev/vitals/)
- [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API)
- [PerformanceObserver](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver)
- [React Profiler](https://react.dev/reference/react/Profiler)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
