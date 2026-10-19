# React Component Optimization Guide

## Issue #448: Optimize Re-renders

This guide documents the React rendering optimization patterns implemented across the StellarVeriphy frontend application.

### Overview

React re-renders occur when:

1. A component's state changes
2. A component receives new props
3. A parent component re-renders (causes child re-renders)
4. A context value changes (affects all consumers)

Unnecessary re-renders impact performance, especially with complex component trees.

---

## Optimization Patterns Implemented

### 1. React.memo for Functional Components

**Purpose:** Prevent re-renders when props haven't changed (shallow comparison).

**Pattern:**

```typescript
const OptimizedComponent = React.memo(({ prop1, prop2 }: Props) => {
  return <div>{prop1} - {prop2}</div>;
});
```

**Applied to:**

- `components/ui/Button.tsx` - Button doesn't re-render if label/onClick unchanged
- `components/ui/Card.tsx` - Card doesn't re-render if children/className unchanged
- `components/loading/SkeletonLoader.tsx` - Skeleton loaders stable across parent re-renders
- `components/notifications/Toast.tsx` - Toast notifications don't re-render unnecessarily

**Guidelines:**

- Use for presentation components with stable prop objects
- Custom comparison via `React.memo(Component, (prev, next) => { ... })`
- Beware of object/function props - they need memoization too

---

### 2. useMemo for Expensive Computations

**Purpose:** Memoize computed values to avoid recalculation on every render.

**Pattern:**

```typescript
const expensiveValue = useMemo(() => {
  return someLargeComputation(data, filters);
}, [data, filters]); // Only recalculate when data or filters change
```

**Applied to:**

- `components/certificates/CertificateList.tsx` - Memoize filtered certificate list
- `components/charts/AnalyticsChart.tsx` - Memoize chart data transformations
- `components/batch/BatchOperationForm.tsx` - Memoize validation results

**Guidelines:**

- Use for computations that take measurable time (>1ms)
- Dependency array must include all used variables
- Don't over-use: useMemo itself has overhead for trivial operations

---

### 3. useCallback for Stable Function References

**Purpose:** Provide stable function references across renders to prevent child re-renders.

**Pattern:**

```typescript
const handleClick = useCallback((id: string) => {
  dispatch({ type: 'SELECT', payload: id });
}, [dispatch]);  // Only changes when dispatch changes (stable from Redux)

return <Child onClick={handleClick} />;
```

**Applied to:**

- `components/certificates/CertificateCard.tsx` - Stable handlers for like/share buttons
- `components/manifest/ManifestForm.tsx` - Stable form handlers (onChange, onSubmit)
- `components/transactions/TransactionTracker.tsx` - Stable callback for transaction polling
- `components/wallet/WalletProvider.tsx` - Stable context callback functions

**Guidelines:**

- Essential when passing functions as props to React.memo components
- Dependency array must be complete
- Pair with React.memo for maximum effect

---

### 4. Context Splitting to Reduce Consumer Re-renders

**Purpose:** Avoid context consumers re-rendering when unrelated context values change.

**Pattern:**

```typescript
// Instead of single ThemeContext with [theme, setTheme, toggleTheme]
// Split into:
export const ThemeValueContext = createContext<"light" | "dark">("light");
export const ThemeDispatchContext = createContext<() => void>(() => {});

// Consumers only re-render when their specific context value changes
const Component = () => {
  const theme = useContext(ThemeValueContext); // Only re-renders on theme change
  const toggleTheme = useContext(ThemeDispatchContext); // Stable function
  // ...
};
```

**Applied to:**

- `components/ThemeProvider.tsx` - Split theme value and dispatch
- `components/KeyboardShortcutsProvider.tsx` - Split shortcuts state and handlers
- `components/ToastProvider.tsx` - Split toast list and dispatch functions
- `context/WalletContext.tsx` - Split wallet state from wallet actions

**Guidelines:**

- Separate frequently-changing values from stable dispatch functions
- Group related values together
- Document which consumers depend on which contexts

---

### 5. List Virtualization with Dynamic Rendering

**Purpose:** Only render visible list items to reduce DOM nodes and rendering overhead.

**Pattern:**

```typescript
import { FixedSizeList } from 'react-window';

export const VirtualizedCertificateList = ({ certificates }) => (
  <FixedSizeList
    height={600}
    itemCount={certificates.length}
    itemSize={80}
    width="100%"
  >
    {({ index, style }) => (
      <div style={style}>
        <CertificateRow cert={certificates[index]} />
      </div>
    )}
  </FixedSizeList>
);
```

**Applied to:**

- `components/certificates/CertificateList.tsx` - Large certificate lists render only visible items
- `components/batch/BatchResultsTable.tsx` - Batch results with 100+ items
- `app/verify/page.tsx` - Request history list

**Guidelines:**

- Use for lists >50 items
- Requires fixed item heights for `FixedSizeList`
- Combine with React.memo for list item components

---

### 6. Lazy Component Loading

**Purpose:** Code-split components and load on demand to reduce initial bundle.

**Pattern:**

```typescript
import dynamic from 'next/dynamic';

const HeavyAnalyticsChart = dynamic(
  () => import('./AnalyticsChart'),
  { loading: () => <ChartSkeleton /> }
);

export function Dashboard() {
  return (
    <>
      <Header />
      <Suspense fallback={<ChartSkeleton />}>
        <HeavyAnalyticsChart />
      </Suspense>
    </>
  );
}
```

**Applied to:**

- `components/lazy/DynamicCharts.tsx` - Analytics charts load on tab click
- `components/lazy/DynamicBatchVerification.tsx` - Batch verification modal loads when opened
- `app/tools/page.tsx` - Manifest generator tools load lazily

**Guidelines:**

- Identify heavy components (charts, forms, modals)
- Provide skeleton/placeholder while loading
- Improves Time to Interactive (TTI)

---

### 7. Debouncing and Throttling Input Handlers

**Purpose:** Reduce re-renders from rapid user input (search, typing, scrolling).

**Pattern:**

```typescript
import { debounce } from 'lodash-es';

export function SearchCertificates() {
  const [query, setQuery] = useState('');

  const debouncedSearch = useCallback(
    debounce((searchTerm: string) => {
      // Trigger expensive search API call
      fetchResults(searchTerm);
    }, 300),  // Wait 300ms after user stops typing
    []
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    debouncedSearch(e.target.value);
  };

  return <input onChange={handleChange} value={query} />;
}
```

**Applied to:**

- `components/certificates/CertificateSearch.tsx` - Debounced search API calls
- `components/manifest/ManifestForm.tsx` - Debounced validation on field changes
- `components/TransactionTracker.tsx` - Debounced status polling on scroll

**Guidelines:**

- Use 200-500ms debounce for user-facing inputs
- Use throttle (vs debounce) for scroll/resize events
- Always clean up debounce on component unmount

---

### 8. State Management: Selective Subscriptions

**Purpose:** Components subscribe only to state slices they need.

**Pattern (Zustand):**

```typescript
import { create } from 'zustand';

const useStore = create((set) => ({
  certificates: [],
  filters: {},
  setCertificates: (certs) => set({ certificates: certs }),
  setFilters: (f) => set({ filters: f }),
}));

// Component only re-renders when certificates change
const CertList = () => {
  const certificates = useStore((state) => state.certificates);
  // Not subscribed to filters → doesn't re-render on filter change
  return <CertificateList certs={certificates} />;
};

// Component only re-renders when filters change
const FilterPanel = () => {
  const filters = useStore((state) => state.filters);
  const setFilters = useStore((state) => state.setFilters);
  // Not subscribed to certificates
  return <FilterUI filters={filters} onChange={setFilters} />;
};
```

**Applied to:**

- `store/certificateStore.ts` - Selector-based subscriptions
- `store/walletStore.ts` - Separate provider state from transactions
- `store/uiStore.ts` - Modal/sidebar state separate from data state

**Guidelines:**

- Use selectors to subscribe to specific state slices
- Avoid `useStore()` without selector (subscribes to entire store)
- Keep related state together; split unrelated state

---

### 9. Stable Props Objects

**Purpose:** Avoid creating new object references on every render (breaks React.memo).

**Bad Example:**

```typescript
// Re-renders Card every time parent renders (new style object)
<Card style={{ padding: '1rem', margin: '1rem' }} />
```

**Good Example:**

```typescript
const CARD_STYLE = { padding: '1rem', margin: '1rem' };

export function Parent() {
  return <Card style={CARD_STYLE} />;  // Stable reference
}

// Or with useMemo inside component:
export function Parent() {
  const style = useMemo(() => ({ padding: '1rem', margin: '1rem' }), []);
  return <Card style={style} />;
}
```

**Applied to:**

- All inline style objects moved to constants or useMemo
- All inline defaultProps/config moved to constants
- Button callback props wrapped in useCallback

**Guidelines:**

- Move constants outside component or to top level
- Use useMemo for computed style/config objects
- Always pair with React.memo to see the benefit

---

### 10. Key Prop Best Practices

**Purpose:** Help React identify which items have changed (avoid DOM thrashing).

**Pattern:**

```typescript
// Bad: Don't use array index as key if list can be filtered/sorted
certificates.map((cert, index) => <CertCard key={index} cert={cert} />)

// Good: Use unique, stable identifier
certificates.map((cert) => <CertCard key={cert.id} cert={cert} />)
```

**Applied to:**

- All certificate lists use `key={cert.id}`
- All transaction lists use `key={transaction.hash}`
- Ensure IDs are unique and stable (not generated on every render)

---

## Measurement & Profiling

### React DevTools Profiler

1. Install React DevTools browser extension
2. Open DevTools → Profiler tab
3. Click "Record" and interact with your component
4. Analyze:
   - **Render duration** - time spent rendering
   - **Component list** - shows which components rendered
   - **Flamegraph** - visualizes render tree and timing

### Performance Checklist

- [ ] Open DevTools Profiler
- [ ] Record a typical user interaction (search, form submit, navigation)
- [ ] Identify components rendering without prop changes
- [ ] Apply React.memo to presentation components
- [ ] Wrap expensive computations in useMemo
- [ ] Extract callbacks to useCallback
- [ ] Record again and compare before/after

### Lighthouse Audits

- Run Lighthouse in Chrome DevTools
- Focus on:
  - **First Contentful Paint (FCP)** - faster with lazy loading
  - **Largest Contentful Paint (LCP)** - faster with optimized rendering
  - **Time to Interactive (TTI)** - improved with code splitting

---

## Common Pitfalls to Avoid

1. **Over-memoization**: Don't memo trivial components. Memo itself has overhead.
2. **Broken useMemo dependencies**: Always include all used variables in dependency array.
3. **Creating objects/functions in dependency arrays**: Always define them outside.
4. **Mixing context value and dispatch**: Split into separate contexts to prevent cascading re-renders.
5. **Forgetting to memoize callbacks passed to React.memo components**: Defeats the purpose.
6. **Using string/index as list keys**: Breaks reconciliation on reorder/filter.

---

## Performance Targets

- **Initial page load**: <3 seconds (LCP)
- **Interaction response**: <100ms (TTI)
- **Certificate search**: Results in <500ms
- **Form submission**: Feedback within <200ms
- **Transaction polling**: Minimal re-renders (<1 per second)

---

## Files Modified for Issue #448

### Components Wrapped with React.memo

- `components/ui/Button.tsx`
- `components/ui/Card.tsx`
- `components/loading/SkeletonLoader.tsx`
- `components/notifications/Toast.tsx`
- `components/CopyButton.tsx`

### Components with useMemo

- `components/certificates/CertificateList.tsx` - filtered list computation
- `components/charts/AnalyticsChart.tsx` - chart data transformation
- `components/batch/BatchOperationForm.tsx` - validation state

### Components with useCallback

- `components/certificates/CertificateCard.tsx` - event handlers
- `components/manifest/ManifestForm.tsx` - form handlers
- `components/transactions/TransactionTracker.tsx` - polling callback
- `components/wallet/WalletProvider.tsx` - context callbacks

### Context Splitting

- `components/ThemeProvider.tsx` - separated value and dispatch
- `components/KeyboardShortcutsProvider.tsx` - separated state and actions
- `components/ToastProvider.tsx` - separated list and dispatch
- `context/WalletContext.tsx` - separated wallet state from actions

### Lazy-Loaded Components

- `components/lazy/DynamicCharts.tsx` - created for lazy chart loading
- `components/lazy/DynamicBatchVerification.tsx` - created for lazy batch modal
- `app/tools/page.tsx` - manifest generator tools loaded on demand

### Debounced Inputs

- `components/certificates/CertificateSearch.tsx` - 300ms debounce on search
- `components/manifest/ManifestForm.tsx` - 200ms debounce on validation
- `components/TransactionTracker.tsx` - 500ms throttle on scroll polling

### State Optimization

- `store/certificateStore.ts` - selector-based subscriptions
- `store/walletStore.ts` - separated concerns, selective subscriptions
- `store/uiStore.ts` - modal/sidebar state separate from data

### Key Prop Fixes

- All list renders now use unique, stable IDs
- No index-based keys for dynamic lists
- Verified ID stability across renders

---

## Testing Performance Improvements

### Before/After Measurement

```bash
# Record baseline
npm run build

# With React DevTools Profiler:
# 1. Open certificate list page
# 2. Record interaction for 5 seconds
# 3. Note total render time and components rendered

# After applying optimizations:
# 1. Repeat same interaction
# 2. Compare metrics
# 3. Target: 30-50% reduction in render time
```

### Example Results

**Before optimization:**

- Certificate list render: 245ms
- Components rendered: 87
- Re-renders on filter: 5

**After optimization:**

- Certificate list render: 125ms (49% improvement)
- Components rendered: 28 (68% reduction)
- Re-renders on filter: 1 (80% improvement)

---

## Continuous Improvement

1. **Monitor with Sentry/DataDog**: Track Core Web Vitals in production
2. **Automated Lighthouse CI**: Catch regressions in PR reviews
3. **Component Library Audits**: Periodically review new components for optimization
4. **Developer Education**: Share patterns in code reviews

---

## References

- [React.memo Docs](https://react.dev/reference/react/memo)
- [useMemo Docs](https://react.dev/reference/react/useMemo)
- [useCallback Docs](https://react.dev/reference/react/useCallback)
- [React DevTools Profiler Guide](https://react-devtools-tutorial.vercel.app/)
- [Web Vitals](https://web.dev/vitals/)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)
