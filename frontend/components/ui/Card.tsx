"use client";

/**
 * Card.tsx — #428
 *
 * Comprehensive card component system with multiple variants:
 * - Base card (generic container)
 * - CertificateCard (provenance certificate display)
 * - StatCard (metric/stat display)
 * - ActionCard (call-to-action card)
 *
 * All variants support hover effects and dark mode.
 *
 * Usage:
 * ─────────────────────────────────────────────────────────────────────────────
 * <Card>Content</Card>
 * <Card variant="elevated" hoverable>Content</Card>
 *
 * <CertificateCard
 *   id="cert-001"
 *   status="verified"
 *   title="My Asset"
 *   creator="GCREATOR..."
 *   timestamp={1700000000}
 * />
 *
 * <StatCard label="Total Verified" value="12,450" icon={<CheckIcon />} trend={+5.2} />
 *
 * <ActionCard
 *   title="Verify Content"
 *   description="Upload your file to verify its authenticity."
 *   icon={<ShieldIcon />}
 *   action={{ label: "Get Started", onClick: () => {} }}
 * />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";

import { cn } from "@/utils/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Base Card
// ─────────────────────────────────────────────────────────────────────────────

export type CardVariant = "default" | "elevated" | "outlined" | "ghost";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual style variant. Defaults to 'default'. */
  variant?: CardVariant;
  /** Adds a hover elevation effect. */
  hoverable?: boolean;
  /** Renders the card with reduced padding. */
  compact?: boolean;
  /** Makes the card visually indicate it's in a selected/active state. */
  selected?: boolean;
}

const cardVariantClasses: Record<CardVariant, string> = {
  default: "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm",
  elevated: "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-md",
  outlined: "bg-transparent border border-gray-300 dark:border-gray-600 shadow-none",
  ghost: "bg-gray-50 dark:bg-gray-800/50 border border-transparent shadow-none",
};

export function Card({
  variant = "default",
  hoverable = false,
  compact = false,
  selected = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl transition-all duration-200",
        cardVariantClasses[variant],
        hoverable &&
          "hover:shadow-lg hover:-translate-y-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected && "ring-2 ring-primary",
        compact ? "p-3" : "p-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// #448 — Memoized to prevent re-renders when parent re-renders without prop changes

// ─────────────────────────────────────────────────────────────────────────────
// Card sub-components (Header, Body, Footer)
// ─────────────────────────────────────────────────────────────────────────────

// #448 — Memoized sub-components
export const CardHeader = React.memo(function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-gray-800 mb-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export const CardBody = React.memo(function CardBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("space-y-3", className)} {...props}>
      {children}
    </div>
  );
});

export const CardFooter = React.memo(function CardFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 pt-4 border-t border-gray-100 dark:border-gray-800 mt-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// CertificateCard
// ─────────────────────────────────────────────────────────────────────────────

export type CertificateCardStatus = "verified" | "pending" | "revoked" | "expired";

const certStatusConfig: Record<
  CertificateCardStatus,
  { label: string; className: string; dot: string }
> = {
  verified: {
    label: "Verified",
    className:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  pending: {
    label: "Pending",
    className:
      "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  revoked: {
    label: "Revoked",
    className:
      "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800",
    dot: "bg-red-500",
  },
  expired: {
    label: "Expired",
    className:
      "bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700",
    dot: "bg-gray-400",
  },
};

export interface CertificateCardProps {
  id: string;
  title?: string;
  creator: string;
  timestamp: number;
  status: CertificateCardStatus;
  storageRef?: string;
  onClick?: () => void;
  className?: string;
  /** Optional footer actions slot */
  actions?: React.ReactNode;
}

function truncate(str: string, maxLen = 20): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, 8) + "…" + str.slice(-8);
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// #448 — Memoized CertificateCard
export const CertificateCard = React.memo(function CertificateCard({
  id,
  title,
  creator,
  timestamp,
  status,
  storageRef,
  onClick,
  className,
  actions,
}: CertificateCardProps) {
  const statusCfg = certStatusConfig[status];

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700",
        "shadow-sm transition-all duration-200",
        onClick && "hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      {/* Top accent bar — colour-coded by status */}
      <div
        className={cn(
          "h-1 rounded-t-xl",
          status === "verified" && "bg-emerald-500",
          status === "pending" && "bg-amber-500",
          status === "revoked" && "bg-red-500",
          status === "expired" && "bg-gray-400"
        )}
        aria-hidden="true"
      />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Icon */}
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
              <svg
                className="w-5 h-5 text-blue-600 dark:text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <p
                className="text-sm font-semibold text-gray-900 dark:text-white truncate"
                title={title || `Certificate #${id}`}
              >
                {title || `Certificate #${id}`}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                #{truncate(id)}
              </p>
            </div>
          </div>
          {/* Status badge */}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0",
              statusCfg.className
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg.dot)} aria-hidden="true" />
            {statusCfg.label}
          </span>
        </div>

        {/* Details */}
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-gray-400 dark:text-gray-500">Verification</dt>
            <dd className="text-gray-700 dark:text-gray-300 text-xs mt-0.5">{statusCfg.label} record</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400 dark:text-gray-500">Creator</dt>
            <dd
              className="font-mono text-gray-700 dark:text-gray-300 truncate text-xs mt-0.5"
              title={creator}
            >
              {truncate(creator)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400 dark:text-gray-500">Created</dt>
            <dd className="text-gray-700 dark:text-gray-300 text-xs mt-0.5">
              {formatDate(timestamp)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-gray-400 dark:text-gray-500">Provenance</dt>
            <dd className="text-gray-700 dark:text-gray-300 text-xs mt-0.5">
              {storageRef ? "Anchored with a storage reference" : "On-chain record pending storage reference"}
            </dd>
          </div>
          {storageRef && (
            <div className="col-span-1 sm:col-span-2">
              <dt className="text-xs text-gray-400 dark:text-gray-500">Storage Ref</dt>
              <dd className="font-mono text-gray-700 dark:text-gray-300 truncate text-xs mt-0.5">
                {truncate(storageRef, 36)}
              </dd>
            </div>
          )}
        </dl>

        {/* Footer actions */}
        {actions && (
          <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// StatCard
// ─────────────────────────────────────────────────────────────────────────────

export interface StatCardProps {
  label: string;
  value: string | number;
  /** Optional sub-value / description text */
  description?: string;
  /** Optional icon (e.g. a Lucide icon element) */
  icon?: React.ReactNode;
  /** Percentage change. Positive = green, Negative = red, Zero = neutral. */
  trend?: number;
  /** Colour accent for the icon background */
  accentColor?: "blue" | "emerald" | "violet" | "amber" | "red" | "cyan";
  className?: string;
  onClick?: () => void;
}

const accentMap: Record<NonNullable<StatCardProps["accentColor"]>, { bg: string; text: string }> = {
  blue: { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400" },
  emerald: {
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  violet: {
    bg: "bg-violet-50 dark:bg-violet-900/30",
    text: "text-violet-600 dark:text-violet-400",
  },
  amber: { bg: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-400" },
  red: { bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400" },
  cyan: { bg: "bg-cyan-50 dark:bg-cyan-900/30", text: "text-cyan-600 dark:text-cyan-400" },
};

// #448 — Memoized StatCard
export const StatCard = React.memo(function StatCard({
  label,
  value,
  description,
  icon,
  trend,
  accentColor = "blue",
  className,
  onClick,
}: StatCardProps) {
  const accent = accentMap[accentColor];
  const hasTrend = trend !== undefined && trend !== null;
  const trendPositive = hasTrend && trend! > 0;
  const trendNeutral = hasTrend && trend === 0;

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6",
        "transition-all duration-200",
        onClick && "hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{label}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white tracking-tight truncate">
            {value}
          </p>
          {description && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{description}</p>
          )}
          {hasTrend && (
            <div className="mt-2 flex items-center gap-1">
              {trendNeutral ? (
                <span className="text-xs text-gray-400">No change</span>
              ) : (
                <>
                  {/* Arrow */}
                  <svg
                    className={cn(
                      "w-3 h-3",
                      trendPositive ? "text-emerald-500 rotate-0" : "text-red-500 rotate-180"
                    )}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12 4l8 16H4z" />
                  </svg>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      trendPositive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    )}
                  >
                    {trendPositive ? "+" : ""}
                    {trend!.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-400">vs last period</span>
                </>
              )}
            </div>
          )}
        </div>

        {icon && (
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
              accent.bg,
              accent.text
            )}
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ActionCard
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionCardProps {
  title: string;
  description: string;
  /** Optional icon displayed at the top */
  icon?: React.ReactNode;
  /** Primary action button config */
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  /** Optional secondary action */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Optional badge/tag shown in the top-right corner */
  badge?: string;
  /** If true, applies a highlighted/featured style */
  featured?: boolean;
  className?: string;
}

// #448 — Memoized ActionCard
export const ActionCard = React.memo(function ActionCard({
  title,
  description,
  icon,
  action,
  secondaryAction,
  badge,
  featured = false,
  className,
}: ActionCardProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col bg-white dark:bg-gray-900 rounded-xl border shadow-sm p-6 transition-all duration-200",
        featured
          ? "border-primary/50 shadow-primary/10 shadow-md"
          : "border-gray-200 dark:border-gray-700",
        "hover:shadow-md",
        className
      )}
    >
      {/* Featured indicator */}
      {featured && (
        <div
          className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary to-blue-400 rounded-t-xl"
          aria-hidden="true"
        />
      )}

      {/* Badge */}
      {badge && (
        <span className="absolute top-4 right-4 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
          {badge}
        </span>
      )}

      {/* Icon */}
      {icon && (
        <div
          className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}

      {/* Title + description */}
      <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 flex-1">{description}</p>

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="mt-5 flex items-center gap-3">
          {action && (
            <button
              onClick={action.onClick}
              disabled={action.disabled || action.loading}
              className={cn(
                "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:pointer-events-none disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              {action.loading && (
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
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
              )}
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className={cn(
                "inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                "bg-transparent border border-input hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
