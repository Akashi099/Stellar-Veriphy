"use client";

/**
 * AssetDetailTabs.tsx — deep-linkable tabs for asset detail pages (#906)
 *
 * The active tab is stored in the `tab` query parameter (for example
 * `/v/<id>?tab=history`), so a link to a specific tab can be shared and
 * reopened directly.
 *
 * Behaviour:
 *   - Changing a tab uses `router.push`, so browser back and forward move
 *     through previously viewed tabs.
 *   - Unknown or missing `tab` values fall back to the first available tab.
 *   - Other query parameters (for example `mode` and `role` used by the
 *     auditor view) are preserved when the tab changes.
 *   - Panels are passed in as server-rendered nodes, so their content is
 *     rendered on the server and only the tab chrome is client-side.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { Suspense } from "react";

import { LazyEvidenceSection } from "@/components/LazyEvidenceSection";
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "@/components/ui/Tabs";
import { resolveMediaFallback } from "@/lib/mediaFallback";

export const ASSET_DETAIL_TAB_PARAM = "tab";

export interface AssetDetailTabItem {
  id: string;
  label: string;
  content: React.ReactNode;
  /**
   * When true, the panel content is deferred until it scrolls into view
   * (see #920). The panel reserves space so the page does not jump.
   */
  lazy?: boolean;
  /** Reserved height (px) for a lazy panel before it renders. */
  lazyMinHeight?: number;
}

/** Default reserved height for below-fold lazy panels. */
const DEFAULT_LAZY_MIN_HEIGHT = 320;

/**
 * Resolves an image source through the bounded media fallback chain (#918).
 * Returns the standard placeholder when every source fails, so callers never
 * retry indefinitely and errors degrade to a consistent state.
 */
export function resolveAssetImage(
  primarySrc: string | null | undefined,
  fallbackSrc?: string | null
): string {
  return resolveMediaFallback(primarySrc, fallbackSrc);
}

/**
 * Returns the requested tab id when it is one of `availableIds`, otherwise the
 * first available id. Used so invalid or stale `tab` values never break the page.
 */
export function resolveAssetDetailTab(
  requested: string | null | undefined,
  availableIds: readonly string[]
): string {
  if (requested && availableIds.includes(requested)) return requested;
  return availableIds[0] ?? "";
}

export function AssetDetailTabs({ tabs }: { tabs: AssetDetailTabItem[] }) {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <AssetDetailTabsInner tabs={tabs} />
    </Suspense>
  );
}

function AssetDetailTabsInner({ tabs }: { tabs: AssetDetailTabItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const ids = tabs.map((t) => t.id);
  const activeId = resolveAssetDetailTab(searchParams.get(ASSET_DETAIL_TAB_PARAM), ids);

  const handleChange = (id: string) => {
    if (id === activeId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(ASSET_DETAIL_TAB_PARAM, id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <Tabs activeTab={activeId} onChange={handleChange} className="w-full">
      <TabList aria-label="Asset details">
        {tabs.map((t) => (
          <Tab key={t.id} id={t.id}>
            {t.label}
          </Tab>
        ))}
      </TabList>
      <TabPanels className="mt-4">
        {tabs.map((t) => (
          <TabPanel key={t.id} id={t.id}>
            {t.lazy ? (
              <LazyEvidenceSection
                id={`asset-detail-panel-${t.id}`}
                minHeight={t.lazyMinHeight ?? DEFAULT_LAZY_MIN_HEIGHT}
                eager={t.id === activeId}
              >
                {t.content}
              </LazyEvidenceSection>
            ) : (
              t.content
            )}
          </TabPanel>
        ))}
      </TabPanels>
    </Tabs>
  );
}

export default AssetDetailTabs;
