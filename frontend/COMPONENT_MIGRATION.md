# Component Import Migration Guide

This guide helps migrate existing component imports to the new atomic design structure.

## Quick Reference

### Old vs. New Import Patterns

#### Atoms (Basic Building Blocks)

```typescript
// OLD
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/StatusBadge";

// NEW
import { Button, Badge } from "@/components/atoms";
```

#### Molecules (Simple Combinations)

```typescript
// OLD
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";

// NEW
import { Card, Modal } from "@/components/molecules";
```

#### Organisms (Complex Sections)

```typescript
// OLD
import Header from "@/components/Header";
import Footer from "@/components/Footer";

// NEW
import { Header, Footer } from "@/components/organisms";
```

#### Features (Feature Collections)

```typescript
// OLD
import CertificateLookupForm from "@/components/certificates/CertificateLookupForm";
import CertificateResultCard from "@/components/certificates/CertificateResultCard";

// NEW
import { CertificateLookupForm, CertificateResultCard } from "@/components/features/certificates";
```

#### Utils/Providers

```typescript
// OLD
import ThemeProvider from "@/components/ThemeProvider";

// NEW
import { ThemeProvider } from "@/components/utils";
```

## Migration Strategy

### Phase 1: Update Index Files (DONE)

- ✅ Create `atoms/index.ts`
- ✅ Create `molecules/index.ts`
- ✅ Create `organisms/index.ts`
- ✅ Create `features/*/index.ts`
- ✅ Create `utils/index.ts`
- ✅ Create main `components/index.ts`

### Phase 2: Update Imports in Components

When refactoring component imports, follow this pattern:

1. Identify the component category
2. Replace direct imports with index imports
3. Test to ensure functionality remains the same

#### Example: Updating a Component

**Before:**

```typescript
// components/certificates/CertificateLookupForm.tsx
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
```

**After:**

```typescript
// components/certificates/CertificateLookupForm.tsx
import { Button, Spinner } from "@/components/atoms";
import { Card } from "@/components/molecules";
```

### Phase 3: Update Page/Feature Imports

When importing components in app pages or features:

**Before:**

```typescript
// app/page.tsx
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CertificateLookupForm } from "@/components/certificates";
```

**After:**

```typescript
// app/page.tsx
import { Header, Footer } from "@/components/organisms";
import { CertificateLookupForm } from "@/components/features/certificates";
```

### Phase 4: Update Hook/Hook Tests

When updating components with hooks:

**Before:**

```typescript
// hooks/__tests__/useComponentLogic.test.tsx
import Button from "@/components/ui/Button";
```

**After:**

```typescript
// hooks/__tests__/useComponentLogic.test.tsx
import { Button } from "@/components/atoms";
```

## Common Import Patterns

### Importing Multiple Atoms

```typescript
import { Button, Badge, Spinner, Tooltip, FormInput } from "@/components/atoms";
```

### Importing Specific Features

```typescript
import {
  CertificateLookupForm,
  CertificateResultCard,
  CertificateHistoryTimeline,
} from "@/components/features/certificates";
```

### Importing All Features (Less Common)

```typescript
import * as certificates from '@/components/features/certificates';
import * as batch from '@/components/features/batch';
import * as wallet from '@/components/features/wallet';

// Usage
<certificates.CertificateLookupForm />
<batch.BatchVerificationPanel />
```

### Importing Utilities/Providers

```typescript
import {
  ThemeProvider,
  ToastProvider,
  ErrorBoundary,
  KeyboardShortcutsProvider,
} from "@/components/utils";
```

## Files to Update

### High Priority (Most Imports)

- `app/layout.tsx` - Uses providers
- `app/page.tsx` - Landing page
- `app/batch-verification/page.tsx`
- `components/certificates/*`
- `components/wallet/*`
- `components/manifest/*`

### Medium Priority

- `hooks/__tests__/*`
- `components/ui/*` - Internal imports
- `components/notifications/*`
- `components/landing/*`

### Lower Priority

- `__mocks__/*`
- One-off utility components

## Batch Migration Script

To help migrate imports, you can use this search-and-replace pattern in your editor:

### Find and Replace Examples

#### Replace Button imports

- **Find:** `import.*Button.*from.*'@/components/ui/Button'`
- **Replace:** `import { Button } from '@/components/atoms'`

#### Replace Card imports

- **Find:** `import.*Card.*from.*'@/components/ui/Card'`
- **Replace:** `import { Card } from '@/components/molecules'`

#### Replace Certificate components

- **Find:** `from '@/components/certificates/`
- **Replace:** `from '@/components/features/certificates'`

## Type Exports

When components export types, they remain accessible:

```typescript
// Both work - same export
import type { ButtonProps } from "@/components/atoms";
import type { ButtonProps } from "@/components/ui/Button";
```

Prefer using the index import for consistency.

## Breaking Changes

There are **no breaking changes** with this migration. All components continue to work the same way:

- Props remain unchanged
- Functionality is identical
- Only import paths change
- Backward compatibility maintained during transition

## Testing the Migration

After updating imports, verify:

1. **TypeScript compilation:** `npm run build`
2. **Tests pass:** `npm test`
3. **E2E tests pass:** `npm run test:e2e`
4. **Dev server runs:** `npm run dev`

## Rollout Plan

1. Update documentation and structure (DONE)
2. Update all component-to-component imports
3. Update all page imports
4. Update test files
5. Update hook files
6. Final verification and testing

## Questions?

Refer to `COMPONENT_ARCHITECTURE.md` for detailed guidelines on:

- Component organization principles
- When to use atoms vs. molecules
- Creating new components
- Naming conventions
- Testing guidelines
