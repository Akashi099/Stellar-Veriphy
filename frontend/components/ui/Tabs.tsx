"use client";

/**
 * Tabs.tsx — #429
 *
 * Accessible tabs component with:
 * - Horizontal and vertical layout variants
 * - Full keyboard navigation (Arrow keys, Home, End, Tab)
 * - Active state styling
 * - Lazy loading of tab content (renders only when first activated)
 * - URL hash synchronization
 *
 * Usage:
 * ─────────────────────────────────────────────────────────────────────────────
 * <Tabs defaultTab="overview">
 *   <TabList>
 *     <Tab id="overview">Overview</Tab>
 *     <Tab id="history">History</Tab>
 *     <Tab id="settings" disabled>Settings</Tab>
 *   </TabList>
 *   <TabPanels>
 *     <TabPanel id="overview"><OverviewContent /></TabPanel>
 *     <TabPanel id="history"><HistoryContent /></TabPanel>
 *     <TabPanel id="settings"><SettingsContent /></TabPanel>
 *   </TabPanels>
 * </Tabs>
 *
 * Vertical layout:
 *   <Tabs orientation="vertical" defaultTab="overview">…</Tabs>
 *
 * URL hash sync:
 *   <Tabs syncHash>…</Tabs>
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { cn } from "@/utils/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
  orientation: "horizontal" | "vertical";
  /** IDs that have been activated at least once (for lazy rendering) */
  activatedTabs: Set<string>;
  instanceId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tab components must be used inside <Tabs>");
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs root
// ─────────────────────────────────────────────────────────────────────────────

export interface TabsProps {
  /** ID of the initially active tab. */
  defaultTab?: string;
  /** Controlled active tab. Provide onChange to handle updates. */
  activeTab?: string;
  onChange?: (id: string) => void;
  /** Layout orientation. Defaults to 'horizontal'. */
  orientation?: "horizontal" | "vertical";
  /** Sync active tab with the URL hash (#tab-id). */
  syncHash?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Tabs({
  defaultTab,
  activeTab: controlledTab,
  onChange,
  orientation = "horizontal",
  syncHash = false,
  className,
  children,
}: TabsProps) {
  const instanceId = useId();

  const getInitialTab = useCallback((): string => {
    if (syncHash && typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "");
      if (hash) return hash;
    }
    return controlledTab ?? defaultTab ?? "";
  }, [syncHash, controlledTab, defaultTab]);

  const [internalTab, setInternalTab] = useState<string>(getInitialTab);
  const [activatedTabs, setActivatedTabs] = useState<Set<string>>(() => {
    const initial = getInitialTab();
    return initial ? new Set([initial]) : new Set();
  });

  const activeTab = controlledTab ?? internalTab;

  const setActiveTab = useCallback(
    (id: string) => {
      if (!controlledTab) setInternalTab(id);
      onChange?.(id);
      setActivatedTabs((prev) => new Set([...prev, id]));
      if (syncHash && typeof window !== "undefined") {
        history.replaceState(null, "", `#${id}`);
      }
    },
    [controlledTab, onChange, syncHash]
  );

  // Initialise activatedTabs when activeTab first resolves
  useEffect(() => {
    if (activeTab) {
      setActivatedTabs((prev) => {
        if (prev.has(activeTab)) return prev;
        return new Set([...prev, activeTab]);
      });
    }
  }, [activeTab]);

  // Handle browser back/forward with hash changes
  useEffect(() => {
    if (!syncHash) return;
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash) setActiveTab(hash);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [syncHash, setActiveTab]);

  return (
    <TabsContext.Provider
      value={{ activeTab, setActiveTab, orientation, activatedTabs, instanceId }}
    >
      <div
        className={cn(orientation === "vertical" ? "flex gap-6" : "flex flex-col gap-0", className)}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TabList
// ─────────────────────────────────────────────────────────────────────────────

export interface TabListProps {
  className?: string;
  children: React.ReactNode;
  /** Optional visible label for the tab list (read by screen readers) */
  "aria-label"?: string;
}

export function TabList({ className, children, "aria-label": ariaLabel }: TabListProps) {
  const { orientation } = useTabsContext();
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? []
    );
    if (!tabs.length) return;

    const currentIndex = tabs.findIndex((t) => t === document.activeElement);

    const isHorizontal = orientation === "horizontal";
    const prevKey = isHorizontal ? "ArrowLeft" : "ArrowUp";
    const nextKey = isHorizontal ? "ArrowRight" : "ArrowDown";

    if (e.key === nextKey) {
      e.preventDefault();
      tabs[(currentIndex + 1) % tabs.length]!.focus();
    } else if (e.key === prevKey) {
      e.preventDefault();
      tabs[(currentIndex - 1 + tabs.length) % tabs.length]!.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      tabs[0]!.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      tabs[tabs.length - 1]!.focus();
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      onKeyDown={handleKeyDown}
      className={cn(
        orientation === "horizontal"
          ? [
              "flex items-end gap-0 border-b border-gray-200 dark:border-gray-700",
              "overflow-x-auto scrollbar-hide",
            ]
          : ["flex flex-col gap-1 shrink-0 min-w-[160px]"],
        className
      )}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab
// ─────────────────────────────────────────────────────────────────────────────

export interface TabProps {
  /** Unique identifier that matches the corresponding TabPanel id. */
  id: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  /** Optional icon rendered before the label */
  icon?: React.ReactNode;
  /** Optional badge/count shown after the label */
  badge?: string | number;
}

export function Tab({ id, disabled = false, className, children, icon, badge }: TabProps) {
  const { activeTab, setActiveTab, orientation, instanceId } = useTabsContext();
  const isActive = activeTab === id;

  const handleClick = () => {
    if (!disabled) setActiveTab(id);
  };

  return (
    <button
      role="tab"
      id={`${instanceId}-tab-${id}`}
      aria-controls={`${instanceId}-panel-${id}`}
      aria-selected={isActive}
      disabled={disabled}
      onClick={handleClick}
      tabIndex={isActive ? 0 : -1}
      className={cn(
        "inline-flex items-center gap-2 text-sm font-medium whitespace-nowrap transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-40",
        orientation === "horizontal"
          ? [
              "px-4 py-2.5 border-b-2 -mb-px",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600",
            ]
          : [
              "w-full px-3 py-2 rounded-lg text-left",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200",
            ],
        className
      )}
    >
      {icon && (
        <span className="w-4 h-4 shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
      {badge !== undefined && (
        <span
          className={cn(
            "inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-medium",
            isActive
              ? "bg-primary text-primary-foreground"
              : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TabPanels
// ─────────────────────────────────────────────────────────────────────────────

export interface TabPanelsProps {
  className?: string;
  children: React.ReactNode;
}

export function TabPanels({ className, children }: TabPanelsProps) {
  return <div className={cn("flex-1 min-w-0", className)}>{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TabPanel
// ─────────────────────────────────────────────────────────────────────────────

export interface TabPanelProps {
  /** Must match the corresponding Tab id. */
  id: string;
  className?: string;
  children: React.ReactNode;
  /** If true, always renders children even when not active (non-lazy). Defaults to false. */
  alwaysRender?: boolean;
}

export function TabPanel({ id, className, children, alwaysRender = false }: TabPanelProps) {
  const { activeTab, activatedTabs, instanceId } = useTabsContext();
  const isActive = activeTab === id;

  // Lazy: render once the panel has been activated at least once
  const hasBeenActivated = activatedTabs.has(id);

  if (!alwaysRender && !hasBeenActivated) return null;

  return (
    <div
      role="tabpanel"
      id={`${instanceId}-panel-${id}`}
      aria-labelledby={`${instanceId}-tab-${id}`}
      hidden={!isActive}
      tabIndex={0}
      className={cn(
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded",
        isActive ? "animate-in fade-in duration-150" : "",
        className
      )}
    >
      {children}
    </div>
  );
}
