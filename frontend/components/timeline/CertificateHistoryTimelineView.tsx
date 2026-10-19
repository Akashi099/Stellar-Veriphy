"use client";

import { ArrowRight, Calendar, ChevronDown, ChevronUp, Download, Filter } from "lucide-react";
import { useRef, useState } from "react";

import { HistoryEvent } from "../certificates/CertificateHistoryTimeline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineViewProps {
  certificateId: string;
  events: HistoryEvent[];
  onLoadMore?: () => void;
  hasMore?: boolean;
}

type EventType =
  | "all"
  | "minted"
  | "transferred"
  | "metadata_updated"
  | "revoked"
  | "renewed"
  | "linked"
  | "locked";

// ---------------------------------------------------------------------------
// Event Styles
// ---------------------------------------------------------------------------

const EVENT_STYLES: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  minted: {
    icon: "✦",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-900/50",
    label: "Minted",
  },
  transferred: {
    icon: "⇄",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-900/50",
    label: "Transferred",
  },
  metadata_updated: {
    icon: "✎",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-900/50",
    label: "Metadata Updated",
  },
  revoked: {
    icon: "⊘",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-900/50",
    label: "Revoked",
  },
  renewed: {
    icon: "⟳",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/50",
    label: "Renewed",
  },
  linked: {
    icon: "⊞",
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-900/50",
    label: "Linked",
  },
  locked: {
    icon: "🔒",
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-100 dark:bg-purple-900/50",
    label: "Locked",
  },
};

function getEventStyle(action: string) {
  return (
    EVENT_STYLES[action] || {
      icon: "●",
      color: "text-gray-600 dark:text-gray-400",
      bg: "bg-gray-100 dark:bg-gray-800",
      label: action,
    }
  );
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function formatDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.slice(0, 8) + "..." + addr.slice(-6);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CertificateHistoryTimelineView({
  certificateId,
  events,
  onLoadMore,
  hasMore = false,
}: TimelineViewProps) {
  const [filterType, setFilterType] = useState<EventType>("all");
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Filter events
  const filteredEvents =
    filterType === "all" ? events : events.filter((e) => e.action === filterType);

  // Toggle event expansion
  const toggleExpand = (eventId: number) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  // Export timeline as image
  const exportAsImage = async () => {
    if (!timelineRef.current) return;

    try {
      // Use html2canvas if available, otherwise fallback to window.print
      // @ts-ignore
      if (typeof window !== "undefined" && window.html2canvas) {
        // @ts-ignore
        const canvas = await window.html2canvas(timelineRef.current);
        const link = document.createElement("a");
        link.download = `certificate-${certificateId}-timeline.png`;
        link.href = canvas.toDataURL();
        link.click();
      } else {
        // Fallback: print dialog
        window.print();
      }
    } catch (error) {
      console.error("Failed to export timeline:", error);
    }
  };

  // Export timeline as PDF
  const exportAsPDF = () => {
    // For production: integrate with a PDF library like jsPDF or use server-side generation
    // For now, trigger print dialog
    window.print();
  };

  if (events.length === 0) {
    return (
      <div className="w-full max-w-5xl mx-auto p-6">
        <div className="text-center py-16">
          <Calendar className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-700 mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            No timeline events found for this certificate.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white break-words">
            Certificate Timeline
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 break-all">
            Certificate ID: <span className="font-mono">{certificateId}</span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-shrink-0">
          {/* Filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-sm rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <Filter className="w-4 h-4 flex-shrink-0" />
              <span>Filter</span>
              {filterType !== "all" && (
                <span className="ml-0 sm:ml-1 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full flex-shrink-0">
                  {filterType}
                </span>
              )}
            </button>

            {showFilterMenu && (
              <div className="absolute left-0 sm:right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                {[
                  "all",
                  "minted",
                  "transferred",
                  "metadata_updated",
                  "revoked",
                  "renewed",
                  "linked",
                  "locked",
                ].map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setFilterType(type as EventType);
                      setShowFilterMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      filterType === type
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                        : "text-gray-900 dark:text-white"
                    }`}
                  >
                    {type === "all" ? "All Events" : EVENT_STYLES[type]?.label || type}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export */}
          <button
            onClick={exportAsImage}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            title="Export as Image"
          >
            <Download className="w-4 h-4 flex-shrink-0" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Event Count */}
      {filterType !== "all" && (
        <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
          Showing {filteredEvents.length} of {events.length} events
        </div>
      )}

      {/* Timeline */}
      <div ref={timelineRef} className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 sm:left-8 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

        <div className="space-y-4 sm:space-y-6">
          {filteredEvents.map((event, idx) => {
            const style = getEventStyle(event.action);
            const isExpanded = expandedEvents.has(event.id);
            const isLast = idx === filteredEvents.length - 1;

            return (
              <div key={event.id} className="relative flex gap-3 sm:gap-6 group">
                {/* Event icon */}
                <div
                  className={`relative z-10 flex-shrink-0 w-10 sm:w-16 h-10 sm:h-16 flex items-center justify-center rounded-full ring-4 ring-white dark:ring-gray-900 ${style.bg}`}
                >
                  <span className="text-lg sm:text-2xl">{style.icon}</span>
                </div>

                {/* Event card */}
                <div className="flex-1 pb-8">
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 ease-out motion-reduce:transition-none">
                <div className="flex-1 pb-4 sm:pb-8">
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                    {/* Event header */}
                    <div className="p-3 sm:p-4 cursor-pointer" onClick={() => toggleExpand(event.id)}>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 sm:gap-3 flex-wrap">
                            <h3 className={`text-base sm:text-lg font-semibold ${style.color} break-words`}>
                              {style.label}
                            </h3>
                            <ArrowRight className="w-4 h-4 text-gray-400 hidden sm:inline flex-shrink-0" />
                          </div>

                          <div className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-1 sm:gap-2 break-all">
                              <Calendar className="w-4 h-4 flex-shrink-0" />
                              {formatDateTime(event.timestamp)}
                            </div>
                          </div>

                          {event.modifier && (
                            <div className="mt-0.5 sm:mt-1 text-xs text-gray-500 dark:text-gray-400 break-all">
                              by{" "}
                              <span className="font-mono text-gray-700 dark:text-gray-300">
                                {truncateAddress(event.modifier)}
                              </span>
                            </div>
                          )}
                        </div>

                        <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && event.details && (
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0 border-t border-gray-100 dark:border-gray-700">
                        <div className="mt-2 sm:mt-3 text-xs sm:text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 rounded p-2 sm:p-3 break-words">
                          <p className="font-medium mb-1">Details:</p>
                          <p>{event.details}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Load More */}
      {hasMore && onLoadMore && (
        <div className="text-center pt-2 sm:pt-4">
          <button
            onClick={onLoadMore}
            className="px-4 sm:px-6 py-2 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-sm rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Load More Events
          </button>
        </div>
      )}

      {/* Export note */}
      <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2 sm:pt-4 border-t border-gray-200 dark:border-gray-700">
        Timeline can be exported as image or PDF using the Export button above
      </div>
    </div>
  );
}
