"use client";

/**
 * CertificateHistoryTimeline.tsx
 *
 * Displays a chronological timeline of events for a certificate
 * (minted, transferred, metadata updated, revoked, renewed, linked, etc.)
 *
 * In production, this data comes from the Provenance contract's
 * `get_certificate_history` function (#181).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HistoryEvent {
  id: number;
  action: string;
  modifier: string;
  timestamp: number;
  details?: string;
}

interface CertificateHistoryTimelineProps {
  events: HistoryEvent[];
  /** Optional callback to view more history */
  onLoadMore?: () => void;
  hasMore?: boolean;
}

// ---------------------------------------------------------------------------
// Event icon and color mapping
// ---------------------------------------------------------------------------

interface EventStyle {
  icon: string;
  bg: string;
  ring: string;
  label: string;
}

const EVENT_STYLES: Record<string, EventStyle> = {
  minted: {
    icon: "✦",
    bg: "bg-emerald-100 dark:bg-emerald-900/50",
    ring: "ring-emerald-500",
    label: "Certificate minted",
  },
  transferred: {
    icon: "⇄",
    bg: "bg-blue-100 dark:bg-blue-900/50",
    ring: "ring-blue-500",
    label: "Ownership transferred",
  },
  metadata_updated: {
    icon: "✎",
    bg: "bg-violet-100 dark:bg-violet-900/50",
    ring: "ring-violet-500",
    label: "Metadata updated",
  },
  revoked: {
    icon: "⊘",
    bg: "bg-red-100 dark:bg-red-900/50",
    ring: "ring-red-500",
    label: "Certificate revoked",
  },
  renewed: {
    icon: "⟳",
    bg: "bg-amber-100 dark:bg-amber-900/50",
    ring: "ring-amber-500",
    label: "Certificate renewed",
  },
  linked: {
    icon: "⊞",
    bg: "bg-cyan-100 dark:bg-cyan-900/50",
    ring: "ring-cyan-500",
    label: "Certificate linked",
  },
  locked: {
    icon: "🔒",
    bg: "bg-purple-100 dark:bg-purple-900/50",
    ring: "ring-purple-500",
    label: "Certificate locked",
  },
};

function getEventStyle(action: string): EventStyle {
  return (
    EVENT_STYLES[action] || {
      icon: "●",
      bg: "bg-gray-100 dark:bg-gray-800",
      ring: "ring-gray-400",
      label: action,
    }
  );
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CertificateHistoryTimeline({
  events,
  onLoadMore,
  hasMore = false,
}: CertificateHistoryTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
        No history events recorded for this certificate.
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul role="list" className="-mb-8">
        {events.map((event, idx) => {
          const style = getEventStyle(event.action);
          const isLast = idx === events.length - 1;

          return (
            <li key={event.id}>
              <div className="relative pb-8">
                {/* Vertical connector line */}
                {!isLast && (
                  <span
                    className="absolute left-5 top-10 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700"
                    aria-hidden="true"
                  />
                )}

                <div className="relative flex items-start gap-2 sm:gap-4">
                  {/* Event icon */}
                  <span
                    className={`relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ring-2 ring-white dark:ring-gray-900 ${style.bg}`}
                    aria-hidden="true"
                  >
                    <span className="text-sm">{style.icon}</span>
                  </span>

                  {/* Event content */}
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                        {style.label}
                      </p>
                      <time className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
                        {formatTime(event.timestamp)}
                      </time>
                    </div>
                    {event.modifier && (
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 break-all">
                        by{" "}
                        <span className="font-mono text-gray-600 dark:text-gray-300">
                          {truncateAddress(event.modifier)}
                        </span>
                      </p>
                    )}
                    {event.details && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-words">
                        {event.details}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Load more */}
      {hasMore && onLoadMore && (
        <div className="text-center pt-2">
          <button
            onClick={onLoadMore}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            Load more history
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock history generator (for prototyping)
// ---------------------------------------------------------------------------

export function generateMockHistory(
  certificateId: string,
  creator: string,
  createdAt: number
): HistoryEvent[] {
  const events: HistoryEvent[] = [
    {
      id: 1,
      action: "minted",
      modifier: creator,
      timestamp: createdAt,
      details: "Certificate #".concat(certificateId, " created with Standard verification"),
    },
  ];

  // Add a metadata update
  if (parseInt(certificateId, 10) > 1) {
    events.push({
      id: 2,
      action: "metadata_updated",
      modifier: creator,
      timestamp: createdAt + 3600,
      details: "Display name and description updated",
    });
  }

  return events;
}
