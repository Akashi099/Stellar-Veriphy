# Frontend State Architecture

This document explains how application state, context, and data fetching are organized in the frontend so contributors can quickly find where things live and where new code belongs.

## TL;DR

- **Server data** → TanStack Query (`frontend/lib/queryClient.tsx`, cache config in `config/cache`).
- **Global client state** → Zustand stores (`frontend/store/`).
- **Cross-cutting app concerns** (auth, theme, toasts, etc.) → React context providers (`frontend/context/`).
- **Reusable stateful logic** → custom hooks (`frontend/hooks/`).
- **Local UI state** → `useState`/`useReducer` inside the component.

## State Layers at a Glance

| Layer | Location | Purpose | Examples |
| --- | --- | --- | --- |
| TanStack Query client | `frontend/lib/queryClient.tsx`, `config/cache` | Fetch, cache, and synchronize server data | Query client setup, default cache/stale times |
| Zustand stores | `frontend/store/` | Global client-side state shared across features | `usePreferencesStore`, `useWalletStore` |
| React context providers | `frontend/context/` | App-wide concerns injected through the tree | Auth/session, theme, notifications |
| Custom hooks | `frontend/hooks/` | Encapsulate reusable stateful logic and compose the layers above | Data hooks, wallet hooks, preference hooks |
| Local component state | Component files | Ephemeral UI state that doesn't need to be shared | Form inputs, open/closed toggles |

## Responsibilities and Boundaries

### TanStack Query (server data)

- **Owns:** anything that originates from the backend — fetching, caching, background refetching, invalidation, and optimistic updates.
- **Does not own:** purely client-side UI state (e.g., a sidebar toggle) or derived app-wide settings that aren't server-backed.
- **Boundary:** if the data has a server source of truth, it belongs here. Configure defaults centrally in `frontend/lib/queryClient.tsx` and cache behavior in `config/cache` rather than per-call.

### Zustand stores (global client state)

- **Owns:** client-only state that multiple, unrelated parts of the app need to read or write — user preferences, wallet connection state, and similar.
- **Does not own:** server data (use TanStack Query) or state that only one component tree needs (use context or local state).
- **Boundary:** keep each store focused on a single domain. Prefer selectors to avoid unnecessary re-renders. See `usePreferencesStore` and `useWalletStore` as reference implementations.

### React context providers (app-wide concerns)

- **Owns:** cross-cutting concerns that are naturally provided down the component tree — authentication/session, theming, toast/notification systems.
- **Does not own:** frequently-changing data that would cause broad re-renders, or server data.
- **Boundary:** use context for "ambient" app concerns, not as a general-purpose store. If state changes often or is needed outside React, prefer a Zustand store.

### Custom hooks (composition layer)

- **Owns:** reusable stateful logic that ties the layers together — e.g., a hook that reads from a Zustand store, triggers a mutation, and invalidates a query.
- **Does not own:** global singletons (those live in stores/context) or raw server fetching (delegate to TanStack Query).
- **Boundary:** hooks are the glue. If logic is reused in more than one place, extract it here.

### Local component state

- **Owns:** ephemeral, component-scoped UI state.
- **Boundary:** if two distant components need it, promote it to a store or context; if it comes from the server, use TanStack Query.

## Where Should New State Go?

Use this decision guide when adding a feature:

1. **Does the data come from the backend?**
   → Use TanStack Query. Add a query/mutation hook in `frontend/hooks/` and rely on the shared client in `frontend/lib/queryClient.tsx`.
2. **Is it client-only and needed by multiple unrelated components?**
   → Add it to a Zustand store in `frontend/store/` (create a new focused store if it's a new domain).
3. **Is it an app-wide concern provided through the tree (auth, theme, toasts)?**
   → Add or extend a React context provider in `frontend/context/`.
4. **Is it reusable stateful logic combining the above?**
   → Put it in a custom hook in `frontend/hooks/`.
5. **Is it only used by one component or a small subtree?**
   → Keep it as local `useState`/`useReducer`.

### Quick rules of thumb

- **Server data ≠ client state.** Don't copy query results into a Zustand store; read them from the query cache.
- **One domain per store.** Avoid catch-all stores.
- **Context is for ambient concerns,** not high-frequency updates.
- **Hooks compose; they don't own global state.**
- **Centralize configuration** (cache defaults, providers) rather than duplicating it per feature.

## Relevant Source Files

- Query client: [`frontend/lib/queryClient.tsx`](../frontend/lib/queryClient.tsx)
- Cache configuration: [`config/cache`](../config/cache)
- Zustand stores: [`frontend/store/`](../frontend/store/)
  - [`usePreferencesStore`](../frontend/store/)
  - [`useWalletStore`](../frontend/store/)
- React context providers: [`frontend/context/`](../frontend/context/)
- Custom hooks: [`frontend/hooks/`](../frontend/hooks/)

## Related Docs

- [Frontend README](../frontend/README.md)
- [Docs index](./README.md)