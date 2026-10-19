# Feature Flags System

A comprehensive feature flag management system for gradual rollouts, A/B testing, and environment-specific features.

## Features

- **Environment-based flags**: Different flags for development, staging, production
- **User-based flags**: Target specific users or user percentages
- **Rollout scheduling**: Schedule feature rollouts with start/end dates
- **Percentage rollouts**: Gradually roll out features to a percentage of users
- **Admin UI**: Toggle flags and manage configurations
- **Analytics integration**: Track feature flag evaluations and updates
- **TypeScript support**: Full type safety

## Quick Start

### 1. Initialize Feature Flags

In your app initialization (e.g., `app.tsx` or layout component):

```typescript
import { initializeFeatureFlags, FEATURE_FLAGS } from "@/lib/feature-flags";

initializeFeatureFlags(FEATURE_FLAGS, {
  userId: "user@example.com",
  userRole: "user",
  environment: "production",
});
```

### 2. Use in React Components

#### Simple Hook Usage

```tsx
import { useFeatureFlag } from "@/lib/feature-flags";

export function MyComponent() {
  const isAdvancedVerificationEnabled = useFeatureFlag("advanced_verification");

  return <div>{isAdvancedVerificationEnabled && <AdvancedVerificationPanel />}</div>;
}
```

#### Conditional Rendering Component

```tsx
import { FeatureFlagged } from "@/lib/feature-flags";

export function MyComponent() {
  return (
    <FeatureFlagged name="dark_mode">
      <DarkModeToggle />
    </FeatureFlagged>
  );
}
```

#### Multiple Flags

```tsx
import { useFeatureFlags } from "@/lib/feature-flags";

export function MyComponent() {
  const flags = useFeatureFlags([
    "advanced_verification",
    "batch_verification",
    "ai_content_analysis",
  ]);

  return (
    <div>
      {flags.advanced_verification && <AdvancedFeature />}
      {flags.batch_verification && <BatchFeature />}
    </div>
  );
}
```

#### Detailed Evaluation

```tsx
import { useFeatureFlagEvaluation } from "@/lib/feature-flags";

export function MyComponent() {
  const evaluation = useFeatureFlagEvaluation("advanced_verification");

  return (
    <div>
      <p>Enabled: {evaluation?.enabled}</p>
      <p>Reason: {evaluation?.reason}</p>
    </div>
  );
}
```

### 3. Admin UI

Include the admin component in your admin panel:

```tsx
import { FeatureFlagAdmin } from "@/components/admin/FeatureFlagAdmin";

export function AdminDashboard() {
  return (
    <div>
      <h1>Admin Dashboard</h1>
      <FeatureFlagAdmin />
    </div>
  );
}
```

## Configuration

### Defining Feature Flags

Edit `lib/feature-flags/config.ts`:

```typescript
export const FEATURE_FLAGS: Record<string, FeatureFlagConfig> = {
  my_feature: {
    name: "my_feature",
    description: "Enable my awesome feature",
    enabled: true,
    environments: {
      development: true,
      staging: true,
      production: false,
    },
    rollout: {
      percentage: 20, // Start with 20% of users
      startDate: "2025-09-15",
    },
    users: {
      allowList: ["admin@example.com"], // Optional: allow specific users
      percentage: 50, // Optional: % of allowed users
    },
    analytics: {
      trackEnabled: true, // Track when flag is evaluated
      trackVariant: true, // Track which variant was served
    },
  },
};
```

### Configuration Properties

- **name** (string): Unique identifier for the flag
- **description** (string): Human-readable description
- **enabled** (boolean): Default enabled state
- **environments** (object): Override by environment
  - `development`: Boolean override for dev
  - `staging`: Boolean override for staging
  - `production`: Boolean override for prod
- **rollout** (object): Gradual rollout settings
  - `percentage`: % of users to enable for (0-100)
  - `startDate`: ISO date when rollout starts
  - `endDate`: ISO date when rollout ends
- **users** (object): User-specific rules
  - `allowList`: Array of user IDs that always get the flag
  - `blockList`: Array of user IDs that never get the flag
  - `percentage`: % of users to enable for
- **analytics** (object): Analytics configuration
  - `trackEnabled`: Track evaluations
  - `trackVariant`: Track which variant won

## Evaluation Logic

Flags are evaluated in this order:

1. Check if globally enabled
2. Check environment override
3. Check user blocklist
4. Check user allowlist
5. Check user percentage rollout
6. Check rollout start/end dates
7. Check rollout percentage

The **first matching rule** determines the result.

## Use Cases

### Gradual Rollout

```typescript
{
  name: "new_feature",
  enabled: true,
  environments: {
    production: true,
  },
  rollout: {
    percentage: 5, // Start with 5%
  },
}
```

### Beta Testing

```typescript
{
  name: "beta_feature",
  enabled: true,
  users: {
    allowList: ["beta_user_1@example.com", "beta_user_2@example.com"],
  },
}
```

### A/B Testing

```typescript
{
  name: "variant_a",
  enabled: true,
  users: {
    percentage: 50, // 50% of users see variant A
  },
}
```

### Environment-Specific

```typescript
{
  name: "experimental_feature",
  enabled: true,
  environments: {
    development: true,
    staging: true,
    production: false, // Only in dev/staging
  },
}
```

### Scheduled Rollout

```typescript
{
  name: "scheduled_feature",
  enabled: true,
  rollout: {
    startDate: "2025-09-15",
    endDate: "2025-12-31",
    percentage: 100,
  },
}
```

## Analytics Integration

Setup analytics tracking for feature flag evaluations:

```typescript
// In your app initialization
window.__FEATURE_FLAG_ANALYTICS__ = {
  track: (event, data) => {
    // Send to your analytics service
    analytics.track(event, data);
  },
};
```

Tracked events:

- `feature_flag_evaluated`: When a flag is evaluated
  - `flag`: Flag name
  - `enabled`: Whether it was enabled
  - `reason`: Why (environment, rollout, user, etc.)
  - `userId`: User ID if provided
  - `environment`: Current environment

- `feature_flag_updated`: When a flag is updated
  - `flag`: Flag name
  - `updates`: Changes made
  - `timestamp`: When update occurred

## Best Practices

1. **Use descriptive names**: `advanced_verification` not `feature1`
2. **Document purpose**: Explain why flag exists
3. **Clean up old flags**: Remove flags after full rollout (100%)
4. **Monitor rollout**: Track performance with each percentage increase
5. **Default to false**: New features should default to disabled
6. **Test both states**: Test with flag enabled and disabled
7. **Gradual rollout**: Don't jump to 100% immediately
8. **User feedback**: Monitor user issues during rollout

## API Reference

### Client API

```typescript
// Check if flag is enabled
isFeatureEnabled(flagName: string, defaultValue?: boolean): boolean

// Get detailed evaluation
evaluateFeatureFlag(flagName: string): FeatureFlagEvaluationResult | null

// Get all flags
getAllFeatureFlags(): Record<string, boolean>

// Set context
setFeatureFlagContext(context: Partial<FeatureFlagContext>): void

// Update flag (admin only)
updateFeatureFlag(flagName: string, updates: Partial<FeatureFlagConfig>): void

// Get config
getFeatureFlagConfig(flagName: string): FeatureFlagConfig | null
```

### React Hooks

```typescript
// Check if flag is enabled
useFeatureFlag(flagName: string, options?: UseFeatureFlagOptions): boolean

// Get multiple flags
useFeatureFlags(flagNames: string[], options?: UseFeatureFlagOptions): Record<string, boolean>

// Get detailed evaluation
useFeatureFlagEvaluation(flagName: string, options?: UseFeatureFlagOptions): FeatureFlagEvaluationResult | null

// Conditional rendering
<FeatureFlagged name="flag_name">
  <ComponentToRender />
</FeatureFlagged>
```

## Troubleshooting

### Flag always returns false

Check evaluation reasons:

```typescript
const result = evaluateFeatureFlag("my_flag");
console.log("Reason:", result?.reason); // Shows why disabled
```

### Context not updating

Make sure to call `setFeatureFlagContext` with user info:

```typescript
setFeatureFlagContext({
  userId: user.id,
  userRole: user.role,
});
```

### Analytics not tracking

Ensure analytics handler is set up:

```typescript
window.__FEATURE_FLAG_ANALYTICS__ = {
  track: (event, data) => console.log(event, data),
};
```

## Performance

- Flags are cached after first evaluation
- Cache clears when context changes
- Minimal runtime overhead
- Consistent hashing for rollout percentages
