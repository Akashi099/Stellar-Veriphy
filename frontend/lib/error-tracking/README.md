# Error Tracking System

Comprehensive error tracking and monitoring system for frontend error reporting, source map uploads, and error analytics.

## Features

- **Frontend Error Tracking**: Automatic capture of errors and exceptions
- **Source Map Support**: Upload source maps for readable stack traces
- **Breadcrumb Trail**: Track user actions leading up to errors
- **Error Context**: Attach user and environment information to errors
- **Analytics Dashboard**: Monitor errors and performance
- **Integration Ready**: Works with Sentry, LogRocket, or custom backends

## Quick Start

### 1. Setup Environment Variables

```bash
# .env.local
NEXT_PUBLIC_ERROR_TRACKING=true
NEXT_PUBLIC_ERROR_TRACKING_DSN=https://key@sentry.io/project-id
ERROR_TRACKING_API=https://your-api.com/api/errors
ERROR_TRACKING_TOKEN=your-api-token
```

### 2. Initialize Error Tracking

Wrap your app with the ErrorTrackingProvider:

```tsx
// app.tsx or layout.tsx
import { ErrorTrackingProvider } from "@/lib/error-tracking";

export default function RootLayout({ children }) {
  return (
    <ErrorTrackingProvider
      config={{
        environment: "production",
      }}
      userId={user?.id}
      userRole={user?.role}
    >
      {children}
    </ErrorTrackingProvider>
  );
}
```

### 3. Use in Components

#### Capture Errors

```tsx
import { useErrorTracking } from "@/lib/error-tracking";

export function MyComponent() {
  const { captureError, captureMessage } = useErrorTracking();

  const handleClick = async () => {
    try {
      await someAsyncOperation();
    } catch (error) {
      captureError(error, "error");
    }
  };

  return <button onClick={handleClick}>Click me</button>;
}
```

#### Error Boundary

```tsx
import { ErrorBoundary } from "@/lib/error-tracking";

export function MyPage() {
  return (
    <ErrorBoundary>
      <ExpensiveComponent />
    </ErrorBoundary>
  );
}
```

#### Track User Actions

```tsx
import { useErrorTracking } from "@/lib/error-tracking";

export function MyComponent() {
  const { addBreadcrumb } = useErrorTracking();

  const handleUserAction = () => {
    addBreadcrumb("user-action", "User clicked verify button");
    // ... handle action
  };

  return <button onClick={handleUserAction}>Verify</button>;
}
```

## Configuration

### Error Tracking Config

```typescript
interface ErrorTrackingConfig {
  // Enable/disable error tracking
  enabled: boolean;

  // Environment: development, staging, production
  environment: "development" | "staging" | "production";

  // Debug mode: log to console
  debug: boolean;

  // DSN for Sentry or similar service
  dsn?: string;

  // Sample rate for performance tracking (0-1)
  tracesSampleRate?: number;

  // Custom beforeSend hook for filtering/modifying errors
  beforeSend?: (event: any) => any;

  // Error patterns to ignore
  ignoreErrors?: string[];
}
```

### Initialize with Custom Config

```typescript
import { initializeErrorTracking } from "@/lib/error-tracking";

initializeErrorTracking({
  environment: "production",
  debug: false,
  tracesSampleRate: 0.1,
  ignoreErrors: ["Network request failed", "Browser extensions"],
});
```

## API Reference

### Client Functions

```typescript
// Initialize error tracking
initializeErrorTracking(config: Partial<ErrorTrackingConfig>): void

// Set user/environment context
setErrorContext(context: Partial<ErrorContext>): void

// Capture an error
captureError(error: Error | string, level?: string, extra?: object): void

// Capture an exception
captureException(error: Error, context?: ErrorContext): void

// Capture a message
captureMessage(message: string, level?: "info" | "warning" | "error"): void

// Add breadcrumb
addBreadcrumb(category: string, message: string, level?: string): void

// Get breadcrumbs
getBreadcrumbs(): Breadcrumb[]

// Get status
getErrorTrackingStatus(): ErrorTrackingStatus
```

### React Hooks

```typescript
// Hook for error tracking
useErrorTracking(): {
  captureError: (error, level?) => void
  captureException: (error) => void
  captureMessage: (message, level?) => void
  addBreadcrumb: (category, message, level?) => void
}

// Error Boundary component
<ErrorBoundary fallback={<ErrorPage />} onError={handleError}>
  <YourComponent />
</ErrorBoundary>
```

## Error Types

### Frontend Errors

- **JavaScript Errors**: Syntax errors, runtime errors
- **Network Errors**: Failed API calls, timeout errors
- **React Errors**: Component errors caught by Error Boundary
- **Unhandled Rejections**: Promise rejections without handlers

### Severity Levels

- `fatal`: Critical errors requiring immediate attention
- `error`: Error conditions that should be investigated
- `warning`: Warning conditions worth monitoring
- `info`: Informational messages

## Source Maps

### Automatic Upload

Add to your build process:

```json
{
  "scripts": {
    "build": "next build && node lib/error-tracking/source-map-upload.js"
  }
}
```

### Environment Variables

```bash
RELEASE_VERSION=1.0.0
ERROR_TRACKING_API=https://your-api.com/api/errors
ERROR_TRACKING_TOKEN=your-token
```

### Manual Upload

```bash
node lib/error-tracking/source-map-upload.js
```

## Error Context

### Set User Information

```typescript
import { setErrorContext } from "@/lib/error-tracking";

// After user login
setErrorContext({
  userId: user.id,
  userRole: user.role,
});
```

### Add Custom Context

```typescript
import { captureError } from "@/lib/error-tracking";

captureError(error, "error", {
  feature: "verification",
  action: "submit_form",
  contentId: "123",
});
```

## Breadcrumbs

Track user actions leading to errors:

```typescript
const { addBreadcrumb } = useErrorTracking();

// Track navigation
addBreadcrumb("navigation", "User navigated to /verify");

// Track interactions
addBreadcrumb("user-action", "User clicked submit");

// Track API calls
addBreadcrumb("http", "POST /api/verify - 200 OK");

// Track state changes
addBreadcrumb("state", "Verification status changed to pending");
```

## Analytics Integration

### Dashboard Access

Errors are sent to:

- Console (development mode)
- API endpoint (`/api/errors`)
- Sentry (if DSN configured)
- Database (if enabled)

### Monitoring

Monitor errors through:

- Sentry Dashboard: `https://sentry.io/`
- Custom Dashboard: `https://your-app.com/admin/errors`
- Email Notifications: Configure in settings

### Error Notifications

Configure in your error tracking service:

- Alert on critical errors (fatal level)
- Digest of errors per day
- Specific error patterns
- Team member notifications

## Best Practices

1. **Always provide context**

   ```typescript
   captureError(error, "error", {
     userId: user.id,
     feature: "verification",
   });
   ```

2. **Use breadcrumbs for tracking**

   ```typescript
   addBreadcrumb("action", "User started verification");
   ```

3. **Level appropriately**
   - Use `fatal` only for critical issues
   - Use `error` for bugs
   - Use `warning` for suspicious behavior

4. **Ignore known errors**

   ```typescript
   ignoreErrors: ["Network request failed", "Script error"];
   ```

5. **Catch errors properly**

   ```typescript
   try {
     await operation();
   } catch (error) {
     captureException(error);
     // Handle gracefully for user
   }
   ```

6. **Use Error Boundary for React**

   ```tsx
   <ErrorBoundary>
     <ExpensiveComponent />
   </ErrorBoundary>
   ```

7. **Clean sensitive data**
   ```typescript
   beforeSend: (event) => {
     // Remove PII before sending
     delete event.request.headers.authorization;
     return event;
   };
   ```

## Troubleshooting

### Errors Not Showing Up

1. Check if error tracking is enabled:

   ```typescript
   import { getErrorTrackingStatus } from "@/lib/error-tracking";
   console.log(getErrorTrackingStatus());
   ```

2. Check environment variables:

   ```bash
   echo $NEXT_PUBLIC_ERROR_TRACKING
   echo $NEXT_PUBLIC_ERROR_TRACKING_DSN
   ```

3. Check browser console for errors

4. Verify API endpoint is accessible:
   ```bash
   curl -X POST http://localhost:3000/api/errors
   ```

### Source Maps Not Uploading

1. Ensure source maps are generated:

   ```bash
   ls -la .next/static/**/*.map
   ```

2. Check source map upload script runs:

   ```bash
   node lib/error-tracking/source-map-upload.js
   ```

3. Verify environment variables:
   ```bash
   echo $ERROR_TRACKING_API
   echo $ERROR_TRACKING_TOKEN
   ```

### Performance Impact

- Error tracking is minimal (< 1KB gzipped)
- Breadcrumbs limited to 50 entries
- Errors batched for network efficiency
- Disabled in development by default (set `debug: false`)

## Integration Examples

### With Sentry

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_ERROR_TRACKING_DSN,
  environment: process.env.NEXT_PUBLIC_ENV,
  tracesSampleRate: 0.1,
});
```

### With LogRocket

```typescript
import LogRocket from "logrocket";

LogRocket.init(process.env.NEXT_PUBLIC_LOGROCKET_ID || "");
LogRocket.getSessionURL((sessionURL) => {
  console.log("LogRocket session:", sessionURL);
});
```

### With Custom Backend

Errors automatically POST to `/api/errors`:

```typescript
// Customize in config
beforeSend: (event) => {
  // Modify before sending
  return event;
};
```

## Compliance

### GDPR

- No PII stored by default
- User can opt out via settings
- Data retention: 30 days default
- Anonymous mode available

### Privacy

- Errors sent only to configured services
- Source maps may contain code
- User IPs captured for geo-location
- Can be anonymized in config

## Support

For issues or questions:

- Check documentation: `frontend/lib/error-tracking/README.md`
- Review examples: `frontend/lib/error-tracking/`
- Check API route: `frontend/app/api/errors/route.ts`
