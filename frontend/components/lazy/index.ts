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
