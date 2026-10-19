"use client";

/**
 * CertificateStatusBadge.tsx
 *
 * Renders a colored badge indicating the current status of a certificate.
 * Statuses: Active, Revoked, Expired, Locked, Pending
 */

import type { VerificationStatus } from "@/services/verificationStatusService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CertificateStatus = "Active" | "Revoked" | "Expired" | "Locked" | "Pending" | "Failed";

interface CertificateStatusBadgeProps {
  status: CertificateStatus;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

// ---------------------------------------------------------------------------
// Style configuration
// ---------------------------------------------------------------------------

interface StatusStyle {
  bg: string;
  text: string;
  ring: string;
  icon: string;
  label: string;
}

const STATUS_STYLES: Record<CertificateStatus, StatusStyle> = {
  Active: {
    bg: "bg-emerald-50 dark:bg-emerald-950",
    text: "text-emerald-800 dark:text-emerald-100",
    ring: "ring-emerald-600/20 dark:ring-emerald-300/30",
    icon: "✓",
    label: "Certificate is valid and active",
  },
  Revoked: {
    bg: "bg-red-50 dark:bg-red-950",
    text: "text-red-800 dark:text-red-100",
    ring: "ring-red-600/20 dark:ring-red-300/30",
    icon: "✕",
    label: "Certificate has been revoked",
  },
  Expired: {
    bg: "bg-amber-50 dark:bg-amber-950",
    text: "text-amber-900 dark:text-amber-100",
    ring: "ring-amber-600/20 dark:ring-amber-300/30",
    icon: "⚠",
    label: "Certificate has expired",
  },
  Locked: {
    bg: "bg-violet-50 dark:bg-violet-950",
    text: "text-violet-800 dark:text-violet-100",
    ring: "ring-violet-600/20 dark:ring-violet-300/30",
    icon: "🔒",
    label: "Certificate is immutably locked",
  },
  Pending: {
    bg: "bg-blue-50 dark:bg-blue-950",
    text: "text-blue-800 dark:text-blue-100",
    ring: "ring-blue-600/20 dark:ring-blue-300/30",
    icon: "○",
    label: "Verification is pending",
  },
  Failed: {
    bg: "bg-rose-50 dark:bg-rose-950",
    text: "text-rose-800 dark:text-rose-100",
    ring: "ring-rose-600/20 dark:ring-rose-300/30",
    icon: "!!",
    label: "Verification failed",
  },
};

const SIZE_STYLES: Record<string, string> = {
  sm: "text-[10px] px-1.5 py-0.5 gap-1",
  md: "text-xs px-2.5 py-1 gap-1.5",
  lg: "text-sm px-3 py-1.5 gap-2",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CertificateStatusBadge({
  status,
  size = "md",
  showIcon = true,
}: CertificateStatusBadgeProps) {
  const style = STATUS_STYLES[status];

  return (
    <span
      role="status"
      tabIndex={0}
      title={style.label}
      aria-label={style.label}
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset transition-all duration-150 hover:ring-2 hover:brightness-95 dark:hover:brightness-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500 ${style.bg} ${style.text} ${style.ring} ${SIZE_STYLES[size]}`}
    >
      {showIcon && (
        <span className="shrink-0 leading-none" aria-hidden="true">
          {style.icon}
        </span>
      )}
      {status}
    </span>
  );
}
