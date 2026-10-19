"use client";

/**
 * MaintenanceBanner.tsx (#787)
 *
 * Shows a site-wide notice while maintenance mode is on. Polls /api/maintenance so the
 * banner appears and disappears without a reload when an operator toggles the flag.
 */

import { useEffect, useState } from "react";

interface MaintenanceStatus {
  enabled: boolean;
  message?: string | null;
  endsAt?: string | null;
}

const DEFAULT_MESSAGE =
  "We're performing scheduled maintenance. You can still look up existing verifications; new submissions are temporarily paused.";

function formatEnd(endsAt: string): string | null {
  const date = new Date(endsAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function MaintenanceBanner({ pollIntervalMs = 60_000 }: { pollIntervalMs?: number }) {
  const [status, setStatus] = useState<MaintenanceStatus>({ enabled: false });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/maintenance", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as MaintenanceStatus;
        if (!cancelled) setStatus(body);
      } catch {
        // Keep the last known state; a failed poll is not a reason to show or hide the banner.
      }
    };

    void check();
    const timer = setInterval(() => void check(), pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollIntervalMs]);

  if (!status.enabled) return null;

  const until = status.endsAt ? formatEnd(status.endsAt) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <span className="font-semibold">Maintenance in progress.</span>
        <span>{status.message || DEFAULT_MESSAGE}</span>
        {until && <span className="sm:ml-auto whitespace-nowrap">Expected back by {until}.</span>}
      </div>
    </div>
  );
}

export default MaintenanceBanner;
