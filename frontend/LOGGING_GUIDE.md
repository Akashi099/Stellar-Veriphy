# Logging Strategy & Best Practices

Comprehensive guide for structured logging throughout the Stellar-Veriphy application.

## Overview

The logging system provides:

- **Four log levels**: debug, info, warn, error
- **Structured logging**: JSON output with context/metadata
- **Production-safe**: Minimal verbosity in production
- **Custom handlers**: Integrate with APM/logging services
- **Context tracking**: Trace requests through the system
- **Performance-optimized**: Minimal overhead, skip disabled levels

## Architecture

### Log Levels

| Level   | Weight | Usage                    | Production  |
| ------- | ------ | ------------------------ | ----------- |
| `debug` | 0      | Verbose development info | Disabled    |
| `info`  | 1      | Normal operation events  | Disabled    |
| `warn`  | 2      | Potential problems       | **Enabled** |
| `error` | 3      | Errors/failures          | **Enabled** |

Production defaults to `warn` level to reduce log volume.

### Log Entry Structure

```typescript
{
  timestamp: "2024-01-15T10:30:45.123Z",  // ISO 8601
  level: "info",                          // debug, info, warn, error
  message: "Certificate verified",        // Human-readable message
  context: {                              // Structured metadata
    certificateId: "cert-123",
    verificationLevel: "strict",
    userId: "user-456",
    duration: 245
  }
}
```

## Usage

### Basic Logging

```typescript
import { logger } from "@/lib/logger";

// Simple messages
logger.debug("Initializing component");
logger.info("User logged in");
logger.warn("Cache miss for certificate");
logger.error("Failed to connect to blockchain");
```

### Structured Logging with Context

```typescript
// Include metadata for aggregation/analysis
logger.info("Certificate verified", {
  certificateId: "cert-123",
  verificationLevel: "strict",
  duration: 245,
  validSignature: true,
});

logger.warn("Rate limit approaching", {
  userId: "user-456",
  remaining: 3,
  resetTime: 1705329045,
});
```

### Error Logging

```typescript
import { logger, formatError } from "@/lib/logger";

try {
  await verifyCertificate(id);
} catch (err) {
  logger.error("Verification failed", {
    certificateId: id,
    error: formatError(err), // Formats Error objects safely
    retryCount: 3,
    userId: "user-456",
  });
}
```

### Child Loggers with Context

```typescript
import { createChildLogger } from "@/lib/logger";

// Create a logger for a specific component/module
const certLogger = createChildLogger({
  component: "CertificateVerifier",
  feature: "certificates",
});

// All logs from certLogger automatically include these fields
certLogger.info("Starting verification"); // Includes component, feature
certLogger.error("Verification failed", { userId: "user-123" });
```

### Request Tracing

```typescript
// Set global context for a request (e.g., in API middleware)
logger.setGlobalContext({
  traceId: "trace-" + Date.now(),
  userId: currentUser.id,
  requestId: req.id,
});

// All subsequent logs include these fields
logger.info("Processing request");
logger.info("Calling blockchain");
logger.info("Request complete");

// Clear or update when request ends
logger.setGlobalContext({});
```

## Component Integration

### In React Components

```typescript
'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

export function CertificatePanel({ certificateId }: Props) {
  useEffect(() => {
    logger.debug('CertificatePanel mounted', {
      component: 'CertificatePanel',
      certificateId,
    });

    return () => {
      logger.debug('CertificatePanel unmounted');
    };
  }, [certificateId]);

  const handleVerify = async () => {
    logger.info('Verification started', { certificateId });

    try {
      const result = await verify(certificateId);
      logger.info('Verification succeeded', {
        certificateId,
        duration: result.duration,
        valid: result.isValid,
      });
    } catch (error) {
      logger.error('Verification failed', {
        certificateId,
        error: formatError(error),
      });
    }
  };

  return (
    <button onClick={handleVerify}>Verify</button>
  );
}
```

### In Services

```typescript
// services/certificateVerificationService.ts
import { logger, createChildLogger } from "@/lib/logger";

const verifyLogger = createChildLogger({
  component: "CertificateVerificationService",
  feature: "certificates",
});

export async function verifyCertificateAuthenticity(id: string) {
  verifyLogger.debug("Starting authenticity verification", { id });

  const startTime = Date.now();

  try {
    const cert = await getCertificateById(id);
    verifyLogger.debug("Certificate retrieved", { id });

    const hashValid = await validateHash(cert);
    const signatureValid = await validateSignature(cert);

    const duration = Date.now() - startTime;

    verifyLogger.info("Authenticity verification complete", {
      id,
      hashValid,
      signatureValid,
      duration,
    });

    return {
      authentic: hashValid && signatureValid,
      hashMatch: hashValid,
      signatureValid: signatureValid,
      details: ["Hash validated", "Signature verified"],
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    verifyLogger.error("Authenticity verification failed", {
      id,
      error: formatError(error),
      duration,
    });
    throw error;
  }
}
```

### In Hooks

```typescript
// hooks/useCertificateQueries.ts
import { useQuery } from "@tanstack/react-query";
import { logger } from "@/lib/logger";

export function useCertificateById(id: string | null | undefined) {
  return useQuery({
    queryKey: ["certificates", id],
    queryFn: async () => {
      logger.debug("Fetching certificate", { id });
      const result = await getCertificateById(id!);
      logger.debug("Certificate fetched", { id, success: true });
      return result;
    },
    enabled: Boolean(id),
    onError: (error) => {
      logger.error("Certificate fetch failed", {
        id,
        error: formatError(error),
      });
    },
  });
}
```

### In API Routes

```typescript
// app/api/verification/route.ts
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const traceId = request.headers.get("x-trace-id") || "trace-" + Date.now();

  logger.setGlobalContext({
    traceId,
    endpoint: "/api/verification",
    method: "POST",
  });

  logger.debug("Verification request received");

  try {
    const body = await request.json();
    logger.debug("Request parsed", { contentType: request.headers.get("content-type") });

    const validation = validateVerificationRequest(body);
    if (!validation.valid) {
      logger.warn("Validation failed", {
        errors: validation.errors,
      });
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    logger.info("Processing verification", {
      certificateId: body.certificateId,
      userId: body.userId,
    });

    const result = await verifyOnChain(body);

    logger.info("Verification completed", {
      certificateId: body.certificateId,
      success: true,
      duration: result.duration,
    });

    return Response.json(result);
  } catch (error) {
    logger.error("Verification processing failed", {
      error: formatError(error),
    });
    return Response.json({ error: "Internal error" }, { status: 500 });
  } finally {
    logger.setGlobalContext({}); // Clear context
  }
}
```

## Production Configuration

### Enable Structured Output

In production, configure structured JSON logging:

```typescript
// In your app initialization (e.g., app/layout.tsx)
import { logger } from "@/lib/logger";

if (process.env.NODE_ENV === "production") {
  logger.setMinLevel("warn"); // Only warn/error
  // Structured output is automatic in production
}
```

### Custom Handlers for APM/Logging Services

```typescript
// Add a handler to send logs to a service
logger.addHandler((entry) => {
  // Send to Sentry for errors
  if (entry.level === "error") {
    Sentry.captureException(entry.context?.error, {
      extra: entry.context,
      tags: { component: entry.context?.component },
    });
  }

  // Send to CloudLogging
  if (["warn", "error"].includes(entry.level)) {
    cloudLogging.write({
      severity: entry.level.toUpperCase(),
      jsonPayload: entry,
    });
  }

  // Send to analytics (info level)
  if (entry.level === "info") {
    analytics.logEvent(entry.message, {
      ...entry.context,
      timestamp: entry.timestamp,
    });
  }
});
```

### Environment-Based Configuration

```typescript
// config/logging.ts
import { logger } from "@/lib/logger";

export function initializeLogging() {
  const isDev = process.env.NODE_ENV === "development";
  const isProd = process.env.NODE_ENV === "production";

  // Set log level
  logger.setMinLevel(isDev ? "debug" : "warn");

  // Add handlers in production
  if (isProd) {
    // Error tracking
    logger.addHandler((entry) => {
      if (entry.level === "error") {
        sendToErrorService(entry);
      }
    });

    // Metrics/Analytics
    logger.addHandler((entry) => {
      if (["info", "warn", "error"].includes(entry.level)) {
        recordMetric(entry);
      }
    });
  }
}

// Call during app initialization
initializeLogging();
```

## Best Practices

### 1. Include Relevant Context

```typescript
// ❌ Bad: Message doesn't include important context
logger.info("Verification started");

// ✅ Good: Include all relevant data
logger.info("Verification started", {
  certificateId: "cert-123",
  userId: "user-456",
  verificationLevel: "strict",
});
```

### 2. Use Consistent Field Names

```typescript
// ❌ Inconsistent naming
logger.info("Processing", { certId: "cert-123" });
logger.info("Done", { certificateId: "cert-456" });

// ✅ Use consistent names across app
logger.info("Processing", { certificateId: "cert-123" });
logger.info("Done", { certificateId: "cert-456" });
```

### 3. Log at Appropriate Levels

```typescript
// ❌ Logging too verbosely
logger.debug("User clicked button");
logger.debug("Component rendered");

// ✅ Use appropriate levels
logger.debug("Processing verification request"); // Dev debugging
logger.info("Verification started by user"); // Important operations
logger.warn("Retry attempt 2 of 3"); // Potential issues
logger.error("Verification failed after 3 retries"); // Errors
```

### 4. Always Log Errors with Context

```typescript
// ❌ Don't log errors without context
logger.error("Failed");

// ✅ Include error details and operation context
logger.error("Certificate verification failed", {
  certificateId: "cert-123",
  error: formatError(err),
  retryCount: 3,
  userId: "user-456",
  duration: 5000,
});
```

### 5. Avoid Logging Sensitive Data

```typescript
// ❌ Don't log sensitive information
logger.info("User login", {
  email: user.email,
  password: user.password, // NEVER!
  privateKey: wallet.key, // NEVER!
});

// ✅ Only log non-sensitive identifiers
logger.info("User login", {
  userId: user.id,
  walletAddress: wallet.address, // Public address only
  provider: "freighter",
});
```

### 6. Use Timestamps for Performance Tracking

```typescript
const startTime = Date.now();

try {
  const result = await expensiveOperation();
  const duration = Date.now() - startTime;

  logger.info("Operation completed", {
    operation: "verify_certificate",
    duration,
    success: true,
  });
} catch (error) {
  const duration = Date.now() - startTime;
  logger.error("Operation failed", {
    operation: "verify_certificate",
    duration,
    error: formatError(error),
  });
}
```

### 7. Use Child Loggers for Components

```typescript
// Per-component context
const homePageLogger = createChildLogger({
  component: "HomePage",
  page: "/home",
});

homePageLogger.info("Page loaded"); // Includes component, page
```

## Monitoring & Analysis

### Key Metrics to Track

1. **Error Rate**: Percentage of requests with errors
2. **Performance**: Average duration of operations
3. **User Impact**: Errors affecting specific users
4. **Feature Health**: Success/failure rates per feature

### Log Aggregation Setup

For production, aggregate logs using:

- **Google Cloud Logging** (recommended for Stellar Veriphy deployment)
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Datadog**
- **New Relic**
- **CloudWatch** (if using AWS)

### Sample Queries

```json
// Find errors in last hour
{
  "severity": "ERROR",
  "@timestamp": ["2024-01-15T10:00:00Z", "2024-01-15T11:00:00Z"]
}

// Errors per feature
{
  "feature": "*",
  "severity": "ERROR",
  "group_by": ["feature"]
}

// P95 latency by operation
{
  "duration": "*",
  "operation": "*",
  "percentile": 95
}
```

## Troubleshooting

### Logs Not Appearing

1. Check log level: `logger.setMinLevel('debug')`
2. Verify console output is enabled
3. Check NODE_ENV (production defaults to warn level)

### Too Many Logs

1. Increase log level in development: `logger.setMinLevel('info')`
2. Remove verbose debug logs
3. Filter by component in aggregation tool

### Missing Context

1. Ensure global context is set for request: `logger.setGlobalContext()`
2. Use child loggers for components
3. Always include relevant metadata in context parameter

### Performance Impact

The logging system is optimized for performance:

- Disabled log levels are skipped (no-op)
- Structured output only created when needed
- Handlers run asynchronously where possible
- Use context selectively for high-traffic operations

## References

- [Structured Logging](https://www.kartar.net/2015/12/structured-logging/)
- [Logging Best Practices](https://www.honeycomb.io/blog/logging-in-json/)
- [Cloud Logging Format](https://cloud.google.com/logging/docs/structured-logging)
- [OpenTelemetry](https://opentelemetry.io/)
