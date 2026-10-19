# Component Architecture & Atomic Design

This document describes the component organization structure following atomic design principles.

## Overview

Components are organized into a hierarchical structure based on the atomic design methodology:

```
components/
├── atoms/           # Basic building blocks (buttons, inputs, badges)
├── molecules/       # Simple combinations of atoms (forms, cards)
├── organisms/       # Complex combinations (headers, sidebars)
├── templates/       # Page-level layouts
├── features/        # Feature-specific components
└── utilities/       # Helper and provider components
```

## Directory Structure

### 1. Atoms (`components/atoms/`)

The smallest, most reusable components. These are pure presentational components with no dependencies on business logic.

**Examples:**

- `Button.tsx` - Basic button with variants
- `Badge.tsx` - Status badge display
- `Avatar.tsx` - User/creator avatar
- `Spinner.tsx` - Loading spinner
- `Tooltip.tsx` - Tooltip overlay
- `FormInput.tsx` - Text input field
- `EmptyState.tsx` - Empty state placeholder

**Guidelines:**

- No dependencies on domain services or hooks
- Accept all configuration via props
- Export types and interfaces in adjacent `types.ts` if needed
- Keep styling self-contained (Tailwind or CSS modules)

### 2. Molecules (`components/molecules/`)

Combinations of atoms that form simple, functional units. Still largely presentational but may contain simple local state.

**Examples:**

- `SearchField.tsx` - Search input with icon button
- `CertificateCard.tsx` - Card displaying certificate info
- `StatusIndicator.tsx` - Status badge with loading spinner
- `FormGroup.tsx` - Label + input + error message
- `ProgressTracker.tsx` - Stepper or progress bar component
- `FileUpload.tsx` - File input with preview

**Guidelines:**

- Combine atoms into meaningful, reusable patterns
- May include simple local state (expand/collapse, focus states)
- Keep business logic minimal
- Document expected prop shapes clearly

### 3. Organisms (`components/organisms/`)

Complex combinations of molecules and atoms. These form logical sections of a page and often contain application logic.

**Examples:**

- `CertificateSearchPanel.tsx` - Full search interface with form + results
- `WalletConnector.tsx` - Wallet connection flow
- `VerificationHeader.tsx` - Navigation and state indicators
- `CertificateDetailView.tsx` - Full certificate display with actions
- `TransactionHistory.tsx` - List with pagination and filters

**Guidelines:**

- Combine molecules and atoms into complete UI sections
- May contain hooks for data fetching (useQuery, useState)
- Include application logic (handlers, validations)
- Coordinate multiple atoms/molecules together
- Export types if needed via `types.ts`

### 4. Templates (`components/templates/`)

Page-level layouts that compose organisms into complete page structures. These typically don't render directly but are composed in page routes.

**Examples:**

- `CertificateVerificationTemplate.tsx` - Layout for verification page
- `LandingPageTemplate.tsx` - Homepage layout
- `DashboardTemplate.tsx` - Dashboard with sidebar and main content
- `AuthTemplate.tsx` - Authentication flow layout

**Guidelines:**

- Use primarily for page composition
- Accept content/organisms as children
- Handle page-level routing and state
- Keep layout concerns separate from business logic

### 5. Features (`components/features/`)

Feature-specific component collections organized by feature domain. These house all components for a particular feature.

**Structure:**

```
features/
├── certificates/
│   ├── CertificateLookup.tsx
│   ├── CertificateVerifier.tsx
│   ├── CertificateExporter.tsx
│   └── index.ts
├── batch/
│   ├── BatchUploadForm.tsx
│   ├── BatchResults.tsx
│   └── index.ts
├── wallet/
│   ├── WalletConnection.tsx
│   ├── WalletSelector.tsx
│   └── index.ts
└── manifest/
    ├── ManifestGenerator.tsx
    ├── ManifestPreview.tsx
    └── index.ts
```

**Guidelines:**

- Group all related feature components together
- Feature components can span atoms → organisms
- Include `index.ts` for convenient imports
- Keep feature-specific types in `types.ts` within feature folder
- Features may import from atoms/molecules/organisms

### 6. Utilities (`components/utils/`)

Provider components, helpers, and utilities that support the component hierarchy.

**Examples:**

- `ThemeProvider.tsx` - Theme context and toggle
- `ToastProvider.tsx` - Toast notification system
- `ErrorBoundary.tsx` - Error boundary wrapper
- `KeyboardShortcutsProvider.tsx` - Global keyboard shortcuts
- `LanguageProvider.tsx` - i18n provider

**Guidelines:**

- Wrap application at root level
- Provide global state/context
- Handle cross-cutting concerns
- Export hooks for accessing provided context

## Import Conventions

### Import Patterns

**Bad (deep imports):**

```tsx
import Button from "../../../atoms/Button";
import { SearchField } from "../../molecules/SearchField";
```

**Good (use index files):**

```tsx
import { Button } from "@/components/atoms";
import { SearchField } from "@/components/molecules";
```

**Best (feature imports):**

```tsx
import { CertificateLookup, CertificateExporter } from "@/components/features/certificates";
```

### Path Aliases

Configure in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/components/*": ["./components/*"],
      "@/components/atoms": ["./components/atoms/index.ts"],
      "@/components/molecules": ["./components/molecules/index.ts"],
      "@/components/organisms": ["./components/organisms/index.ts"],
      "@/components/templates": ["./components/templates/index.ts"],
      "@/components/features/*": ["./components/features/*/index.ts"]
    }
  }
}
```

## Component File Structure

### Typical Component File

````typescript
/**
 * ComponentName.tsx
 *
 * Brief description of component purpose.
 *
 * @example
 * ```tsx
 * <ComponentName prop="value" />
 * ```
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface ComponentNameProps {
  /** Description of prop */
  prop: string;
  /** Optional children */
  children?: ReactNode;
  /** Optional CSS class names */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ComponentName({
  prop,
  children,
  className,
}: ComponentNameProps) {
  return (
    <div className={cn('base-styles', className)}>
      {children}
    </div>
  );
}

export default ComponentName;
````

### With Hooks/Logic

```typescript
/**
 * ComplexComponent.tsx
 *
 * Description with any hooks used.
 */

'use client'; // If using hooks

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/atoms';
import { useDataFetch } from '@/hooks/useDataFetch';

export interface ComplexComponentProps {
  onSubmit?: (data: unknown) => void;
}

export function ComplexComponent({ onSubmit }: ComplexComponentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data, isLoading } = useDataFetch();

  const handleClick = () => {
    setIsOpen(!isOpen);
  };

  return (
    <Button onClick={handleClick} disabled={isLoading}>
      Click me
    </Button>
  );
}
```

## Index Files

Each category should export all components via an `index.ts`:

**components/atoms/index.ts:**

```typescript
// UI Primitives
export { Button, type ButtonProps } from "./Button";
export { Badge, type BadgeProps } from "./Badge";
export { Avatar, type AvatarProps } from "./Avatar";
export { Spinner } from "./Spinner";
export { Tooltip, type TooltipProps } from "./Tooltip";

// Form Inputs
export { FormInput, type FormInputProps } from "./FormInput";
export { Checkbox } from "./Checkbox";
export { RadioButton } from "./RadioButton";

// Layout
export { EmptyState, type EmptyStateProps } from "./EmptyState";
```

**components/molecules/index.ts:**

```typescript
export { SearchField, type SearchFieldProps } from "./SearchField";
export { CertificateCard, type CertificateCardProps } from "./CertificateCard";
export { StatusIndicator } from "./StatusIndicator";
export { FormGroup, type FormGroupProps } from "./FormGroup";
```

## Component Testing

Place tests alongside components using `.test.tsx` extension:

```
components/
├── atoms/
│   ├── Button.tsx
│   ├── Button.test.tsx
│   ├── Badge.tsx
│   └── Badge.test.tsx
├── molecules/
│   ├── CertificateCard.tsx
│   └── CertificateCard.test.tsx
```

### Test Organization

```typescript
describe("Button Component", () => {
  describe("rendering", () => {
    it("renders button text", () => {
      /* ... */
    });
  });

  describe("variants", () => {
    it("applies primary variant styles", () => {
      /* ... */
    });
  });

  describe("interactions", () => {
    it("calls onClick handler when clicked", () => {
      /* ... */
    });
  });
});
```

## Styling Guidelines

### Tailwind CSS

- Use Tailwind utility classes for styling
- Create Tailwind components for reusable patterns using `@apply`
- Use `cn()` utility for conditional class names

### Custom Styles

- Keep CSS module files alongside components
- Use naming convention: `ComponentName.module.css`
- Keep styles scoped to component concerns

## Accessibility

- Use semantic HTML (`<button>`, `<input>`, `<label>`)
- Include ARIA labels where appropriate
- Ensure keyboard navigation support
- Test with screen readers
- Maintain sufficient color contrast
- Use LiveRegion component for announcements

## Performance Considerations

- Use `React.memo()` for expensive renders
- Use `useCallback()` for stable function references
- Lazy load heavy components with `React.lazy()`
- Avoid unnecessary re-renders through proper dependency arrays
- Profile with React DevTools

## Migration Guide

When refactoring existing components:

1. Identify component category (atom/molecule/organism)
2. Extract types to dedicated `types.ts` if complex
3. Create directory structure
4. Move component file
5. Create `index.ts` with exports
6. Update all imports throughout codebase
7. Add tests if missing
8. Document in component storybook/stories

## Examples

### Atomic Component (Button)

```typescript
// components/atoms/Button.tsx
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };

  const sizeClasses = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={cn(
        'font-semibold rounded transition',
        variantClasses[variant],
        sizeClasses[size],
      )}
      {...props}
    >
      {isLoading ? <Spinner /> : children}
    </button>
  );
}
```

## Benefits

1. **Scalability** - Clear hierarchy for growing component libraries
2. **Reusability** - Atoms can be combined into higher-level components
3. **Maintainability** - Components have single, clear responsibilities
4. **Testability** - Smaller components are easier to test
5. **Onboarding** - New developers understand structure quickly
6. **Documentation** - Clear naming and organization self-document code
