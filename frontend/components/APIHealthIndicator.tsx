"use client";

/**
 * APIHealthIndicator.tsx
 *
 * Displays API health status with a lightweight loading spinner.
 * Checks the API health endpoint periodically and shows:
 * - Loading spinner while checking
 * - Green checkmark when healthy
 * - Red indicator when unhealthy or slow
 */

import { useEffect, useState } from "react";

type HealthStatus = "idle" | "loading" | "healthy" | "unhealthy" | "slow";

interface APIHealthIndicatorProps {
  /** Interval in ms to check health (default: 30000) */
  checkInterval?: number;
  /** Timeout in ms for health check (default: 5000) */
  timeout?: number;
  className?: string;
}

export function APIHealthIndicator({
  checkInterval = 30000,
  timeout = 5000,
  className = "",
}: APIHealthIndicatorProps) {
  const [status, setStatus] = useState<HealthStatus>("idle");
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      setStatus("loading");
      const startTime = Date.now();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch("/api/health", {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        if (response.ok) {
          setStatus(duration > timeout / 2 ? "slow" : "healthy");
        } else {
          setStatus("unhealthy");
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          setStatus("slow");
        } else {
          setStatus("unhealthy");
        }
      }

      setLastCheck(new Date());
    };

    // Check immediately on mount
    checkHealth();

    // Set up periodic checks
    const interval = setInterval(checkHealth, checkInterval);
    return () => clearInterval(interval);
  }, [checkInterval, timeout]);

  const statusColors: Record<HealthStatus, string> = {
    idle: "text-gray-400",
    loading: "text-blue-400 animate-spin",
    healthy: "text-emerald-400",
    unhealthy: "text-red-400",
    slow: "text-amber-400",
  };

  const statusLabels: Record<HealthStatus, string> = {
    idle: "Checking…",
    loading: "Checking…",
    healthy: "API Healthy",
    unhealthy: "API Unavailable",
    slow: "API Slow",
  };

  const statusMessages: Record<HealthStatus, string> = {
    idle: "API status checking",
    loading: "API health check in progress",
    healthy: "API is responding normally",
    unhealthy: "API is currently unavailable",
    slow: "API is responding slowly",
  };

  return (
    <div
      className={`flex items-center gap-2 text-sm ${className}`}
      role="status"
      aria-live="polite"
      aria-label={statusMessages[status]}
    >
      {/* Loading spinner or status icon */}
      <svg
        className={`h-3.5 w-3.5 shrink-0 ${statusColors[status]}`}
        fill={status === "loading" ? "none" : "currentColor"}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {status === "loading" ? (
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
        ) : (
          <circle cx="12" cy="12" r="11" />
        )}
      </svg>

      {/* Status label */}
      <span className={`text-xs font-medium ${statusColors[status]}`}>
        {statusLabels[status]}
      </span>

      {/* Last check time (for accessibility) */}
      {lastCheck && status !== "loading" && (
        <span className="text-xs text-gray-500">
          ({lastCheck.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
        </span>
      )}
    </div>
  );
}
