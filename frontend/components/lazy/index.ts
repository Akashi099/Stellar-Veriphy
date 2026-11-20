/**
 * lazy/index.ts — #437 Bundle Size Optimisation
 *
 * All heavy components are imported via `next/dynamic` so they are only
 * fetched when the route that renders them is first visited.  This keeps the
 * initial JS payload small and improves Time-to-Interactive on the landing page.
 *
 * Usage (identical API to a static import):
 *   import { LazyChartsBundle, LazySwaggerUI, LazyCertificateComparisonTool } from "@/components/lazy";
 */

import dynamic from "next/dynamic";

// ---------------------------------------------------------------------------
// Below-fold lazy section — #920 lazy loading for verification evidence
//
// Defers expensive evidence rendering until the section scrolls into view.
// A reserved min-height placeholder prevents layout gaps while loading, and
// sections targeted by a URL hash (direct links) are loaded eagerly so the
// correct evidence is revealed immediately.
// ---------------------------------------------------------------------------

export const LazyBelowFoldSection = dynamic(
  () =>
    import("@/components/lazy/BelowFoldSection").then((m) => ({
      default: m.BelowFoldSection,
    })),
  {
    ssr: false,
    // Reserve space to avoid visible layout gaps before the chunk loads.
    loading: () => (
      <div
        aria-busy="true"
        style={{ minHeight: "var(--below-fold-min-height, 320px)" }}
      />
    ),
  }
);

// ---------------------------------------------------------------------------
// Charts (recharts) — ~220 kB gzipped
// ---------------------------------------------------------------------------

export const LazyLineChart = dynamic(
  () => import("@/components/charts/LineChart").then((m) => ({ default: m.LineChart })),
  { ssr: false }
);

export const LazyBarChart = dynamic(
  () => import("@/components/charts/BarChart").then((m) => ({ default: m.BarChart })),
  { ssr: false }
);

export const LazyPieChart = dynamic(
  () => import("@/components/charts/PieChart").then((m) => ({ default: m.PieChart })),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Certificate comparison tool — loads lucide icons + heavy diff logic
// ---------------------------------------------------------------------------

export const LazyCertificateComparisonTool = dynamic(
  () =>
    import("@/components/comparison/CertificateComparisonTool").then((m) => ({
      default: m.CertificateComparisonTool,
    })),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Batch verification panel
// ---------------------------------------------------------------------------

export const LazyBatchVerificationPanel = dynamic(
  () =>
    import("@/components/batch/BatchVerificationPanel").then((m) => ({
      default: m.BatchVerificationPanel,
    })),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Advanced manifest editor
// ---------------------------------------------------------------------------

export const LazyAdvancedManifestEditor = dynamic(
  () =>
    import("@/components/manifest/AdvancedManifestEditor").then((m) => ({
      default: m.AdvancedManifestEditor,
    })),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Notification centre (large component, not needed until opened)
// ---------------------------------------------------------------------------

export const LazyNotificationCenter = dynamic(
  () =>
    import("@/components/notifications/NotificationCenter").then((m) => ({
      default: m.NotificationBell,
    })),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// API key management (not on critical path)
// ---------------------------------------------------------------------------

export const LazyAPIKeyManagement = dynamic(
  () => import("@/components/APIKeyManagement").then((m) => ({ default: m.APIKeyManagement })),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Page-transition loader (only used inside route layouts)
// ---------------------------------------------------------------------------

export const LazyPageTransitionLoader = dynamic(
  () =>
    import("@/components/loading/PageTransitionLoader").then((m) => ({
      default: m.PageTransitionLoader,
    })),
  { ssr: false }
);
