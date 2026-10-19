"use client";

/**
 * Search.tsx — #430
 *
 * Search input with autocomplete, recent searches, keyboard navigation,
 * clear button, and loading state.
 *
 * Usage:
 * ─────────────────────────────────────────────────────────────────────────────
 * // Basic (controlled)
 * <Search
 *   value={query}
 *   onChange={setQuery}
 *   onSearch={(q) => runSearch(q)}
 *   placeholder="Search certificates…"
 * />
 *
 * // With autocomplete suggestions
 * <Search
 *   value={query}
 *   onChange={setQuery}
 *   suggestions={[
 *     { id: "1", label: "Certificate #001", description: "Verified • 2024-01-01" },
 *   ]}
 *   onSuggestionSelect={(s) => navigate(`/cert/${s.id}`)}
 *   loading={isFetching}
 * />
 *
 * // Disable recent searches
 * <Search value={q} onChange={setQ} persistRecentSearches={false} />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { forwardRef, useCallback, useEffect, useId, useRef, useState } from "react";

import { cn } from "@/utils/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchSuggestion {
  /** Unique ID */
  id: string;
  /** Primary label shown in the list */
  label: string;
  /** Optional sub-label / description */
  description?: string;
  /** Optional icon element */
  icon?: React.ReactNode;
}

export interface SearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the user submits (Enter key or search icon click) */
  onSearch?: (value: string) => void;
  /** Autocomplete suggestions */
  suggestions?: SearchSuggestion[];
  /** Called when a suggestion is selected */
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  /** Placeholder text shown in the search input.
   * Examples: "Search by asset ID, creator address, or hash…"
   */
  placeholder?: string;
  /** Shows a spinner inside the input while true */
  loading?: boolean;
  disabled?: boolean;
  /** Input size variant */
  size?: "sm" | "md" | "lg";
  /** If true, stores and shows recent searches using localStorage */
  persistRecentSearches?: boolean;
  /** localStorage key for persisting recent searches */
  recentSearchesKey?: string;
  /** Maximum number of recent searches to store */
  maxRecentSearches?: number;
  className?: string;
  /** Extra className applied to the input element */
  inputClassName?: string;
  "aria-label"?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent searches helpers
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_STORAGE_KEY = "sv_recent_searches";
const DEFAULT_MAX_RECENT = 5;

function readRecentSearches(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

function writeRecentSearches(key: string, searches: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(searches));
  } catch {
    // Storage not available — fail silently
  }
}

function addRecentSearch(key: string, query: string, max: number): string[] {
  const trimmed = query.trim();
  if (!trimmed) return readRecentSearches(key);
  const existing = readRecentSearches(key).filter((s) => s !== trimmed);
  const updated = [trimmed, ...existing].slice(0, max);
  writeRecentSearches(key, updated);
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
    />
  </svg>
);

const CloseIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Size variants
// ─────────────────────────────────────────────────────────────────────────────

const inputSizeClasses = {
  sm: "h-8 text-sm pl-8 pr-8",
  md: "h-10 text-sm pl-10 pr-10",
  lg: "h-12 text-base pl-12 pr-12",
};

const iconSizeClasses = {
  sm: "w-4 h-4 left-2",
  md: "w-4 h-4 left-3",
  lg: "w-5 h-5 left-3.5",
};

const clearSizeClasses = {
  sm: "w-4 h-4 right-2",
  md: "w-4 h-4 right-3",
  lg: "w-5 h-5 right-3.5",
};

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

export const Search = forwardRef<HTMLInputElement, SearchProps>(
  (
    {
      value,
      onChange,
      onSearch,
      suggestions = [],
      onSuggestionSelect,
      placeholder = "Search…",
      loading = false,
      disabled = false,
      size = "md",
      persistRecentSearches = true,
      recentSearchesKey = DEFAULT_STORAGE_KEY,
      maxRecentSearches = DEFAULT_MAX_RECENT,
      className,
      inputClassName,
      "aria-label": ariaLabel = "Search",
    },
    ref
  ) => {
    const instanceId = useId();
    const listboxId = `${instanceId}-listbox`;

    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Merge external ref
    const setRef = useCallback(
      (node: HTMLInputElement | null) => {
        (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
      },
      [ref]
    );

    // Load recent searches on mount
    useEffect(() => {
      if (persistRecentSearches) {
        setRecentSearches(readRecentSearches(recentSearchesKey));
      }
    }, [persistRecentSearches, recentSearchesKey]);

    // Dismiss on outside click
    useEffect(() => {
      const handlePointerDown = (e: PointerEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
          setActiveIndex(-1);
        }
      };
      document.addEventListener("pointerdown", handlePointerDown);
      return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, []);

    // ── Derived list items ──────────────────────────────────────────────────
    // Priority: if there are autocomplete suggestions show those,
    // otherwise show recent searches when the input is empty/unfocused.

    type ListItem =
      { kind: "suggestion"; data: SearchSuggestion } | { kind: "recent"; query: string };

    const listItems: ListItem[] = React.useMemo(() => {
      if (suggestions.length > 0) {
        return suggestions.map((s) => ({ kind: "suggestion" as const, data: s }));
      }
      if (!value && recentSearches.length > 0 && persistRecentSearches) {
        return recentSearches.map((q) => ({ kind: "recent" as const, query: q }));
      }
      return [];
    }, [suggestions, value, recentSearches, persistRecentSearches]);

    const shouldShowDropdown = open && listItems.length > 0;

    // ── Handlers ───────────────────────────────────────────────────────────

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
      setActiveIndex(-1);
      setOpen(true);
    };

    const handleFocus = () => setOpen(true);

    const commitSearch = useCallback(
      (query: string) => {
        if (!query.trim()) return;
        if (persistRecentSearches) {
          const updated = addRecentSearch(recentSearchesKey, query, maxRecentSearches);
          setRecentSearches(updated);
        }
        onSearch?.(query);
        setOpen(false);
        setActiveIndex(-1);
      },
      [persistRecentSearches, recentSearchesKey, maxRecentSearches, onSearch]
    );

    const selectItem = useCallback(
      (item: ListItem) => {
        if (item.kind === "suggestion") {
          onChange(item.data.label);
          onSuggestionSelect?.(item.data);
          commitSearch(item.data.label);
        } else {
          onChange(item.query);
          commitSearch(item.query);
        }
        inputRef.current?.focus();
      },
      [onChange, onSuggestionSelect, commitSearch]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!shouldShowDropdown) {
        if (e.key === "Enter") commitSearch(value);
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % listItems.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + listItems.length) % listItems.length);
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && listItems[activeIndex]) {
            selectItem(listItems[activeIndex]);
          } else {
            commitSearch(value);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
          break;
        case "Tab":
          setOpen(false);
          setActiveIndex(-1);
          break;
      }
    };

    const handleClear = () => {
      onChange("");
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.focus();
    };

    const removeRecentSearch = (query: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const updated = recentSearches.filter((s) => s !== query);
      setRecentSearches(updated);
      writeRecentSearches(recentSearchesKey, updated);
    };

    // ── Render ─────────────────────────────────────────────────────────────

    return (
      <div ref={containerRef} className={cn("relative w-full", className)}>
        {/* Input row */}
        <div className="relative flex items-center group">
          {/* Search icon / spinner */}
          <span
            className={cn(
              "absolute top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400 transition-colors duration-200",
              "group-focus-within:text-blue-500 dark:group-focus-within:text-blue-400",
              iconSizeClasses[size]
            )}
            aria-hidden="true"
          >
            {loading ? (
              <svg className="animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <SearchIcon className="w-full h-full" />
            )}
          </span>

          <input
            ref={setRef}
            type="search"
            role="combobox"
            aria-label={ariaLabel}
            aria-autocomplete="list"
            aria-expanded={shouldShowDropdown}
            aria-controls={shouldShowDropdown ? listboxId : undefined}
            aria-activedescendant={
              activeIndex >= 0 ? `${instanceId}-option-${activeIndex}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className={cn(
              "w-full rounded-lg border border-input bg-background text-foreground",
              "placeholder:text-muted-foreground",
              "transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900",
              "focus-visible:border-blue-500 dark:focus-visible:border-blue-400",
              "disabled:cursor-not-allowed disabled:opacity-50",
              // Remove native search cancel button
              "[&::-webkit-search-cancel-button]:appearance-none",
              inputSizeClasses[size],
              inputClassName
            )}
          />

          {/* Clear button */}
          {value && !loading && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              tabIndex={-1}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
                "transition-all duration-150 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                clearSizeClasses[size]
              )}
            >
              <CloseIcon className="w-full h-full" />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {shouldShowDropdown && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Search suggestions"
            className={cn(
              "absolute z-50 w-full mt-1.5 rounded-lg border border-gray-200 dark:border-gray-700",
              "bg-white dark:bg-gray-900 shadow-lg",
              "py-1 max-h-72 overflow-y-auto",
              "animate-in fade-in slide-in-from-top-1 duration-100"
            )}
          >
            {/* Section header for recent searches */}
            {listItems[0]?.kind === "recent" && (
              <li className="px-3 py-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Recent searches
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRecentSearches([]);
                    writeRecentSearches(recentSearchesKey, []);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Clear all
                </button>
              </li>
            )}

            {listItems.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <li
                  key={item.kind === "suggestion" ? item.data.id : `recent-${item.query}`}
                  id={`${instanceId}-option-${index}`}
                  role="option"
                  aria-selected={isActive}
                  onPointerDown={(e) => {
                    // Prevent the input losing focus before we can select
                    e.preventDefault();
                  }}
                  onClick={() => selectItem(item)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none",
                    "text-sm text-gray-700 dark:text-gray-300",
                    "transition-colors duration-75",
                    isActive
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/70"
                  )}
                >
                  {/* Icon */}
                  <span className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500">
                    {item.kind === "suggestion" ? (
                      (item.data.icon ?? <SearchIcon className="w-4 h-4" />)
                    ) : (
                      <ClockIcon className="w-4 h-4" />
                    )}
                  </span>

                  {/* Label + description */}
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">
                      {item.kind === "suggestion" ? item.data.label : item.query}
                    </span>
                    {item.kind === "suggestion" && item.data.description && (
                      <span className="block text-xs text-gray-400 dark:text-gray-500 truncate">
                        {item.data.description}
                      </span>
                    )}
                  </span>

                  {/* Remove recent search */}
                  {item.kind === "recent" && (
                    <button
                      type="button"
                      onClick={(e) => removeRecentSearch(item.query, e)}
                      aria-label={`Remove "${item.query}" from recent searches`}
                      className="shrink-0 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
                    >
                      <CloseIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }
);

Search.displayName = "Search";
