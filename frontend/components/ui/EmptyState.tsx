"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";

import { EmptyCertificates, ErrorState, NoSearchResults } from "@/components/illustrations";

type IllustrationType = "certificates" | "search-no-results" | "error";

interface Action {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface EmptyStateProps {
  illustration: IllustrationType;
  heading: string;
  body: string;
  primaryAction: Action;
  secondaryAction?: Action;
  onboardingTip?: string;
  className?: string;
}

const illustrations: Record<IllustrationType, React.ComponentType<{ className?: string }>> = {
  certificates: EmptyCertificates,
  "search-no-results": NoSearchResults,
  error: ErrorState,
};

export function EmptyState({
  illustration,
  heading,
  body,
  primaryAction,
  secondaryAction,
  onboardingTip,
  className = "",
}: EmptyStateProps) {
  const [showTip, setShowTip] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (onboardingTip) {
      const dismissed = localStorage.getItem(`onboarding-dismissed-${illustration}`);
      if (dismissed === "true") {
        setShowTip(false);
        setIsDismissed(true);
      }
    }
  }, [illustration, onboardingTip]);

  const handleDismissTip = () => {
    localStorage.setItem(`onboarding-dismissed-${illustration}`, "true");
    setShowTip(false);
    setIsDismissed(true);
  };

  const IllustrationComponent = illustrations[illustration];

  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 text-center max-w-md mx-auto ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Illustration */}
      <div className="mb-6 text-gray-400 dark:text-gray-600 w-48 h-48">
        <IllustrationComponent className="w-full h-full" />
      </div>

      {/* Heading */}
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">{heading}</h2>

      {/* Body text */}
      <p className="text-base text-gray-600 dark:text-gray-400 mb-6 max-w-sm">{body}</p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
        {primaryAction.href ? (
          <Link
            href={primaryAction.href}
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 min-h-[44px] flex items-center"
          >
            {primaryAction.label}
          </Link>
        ) : (
          <button
            onClick={primaryAction.onClick}
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 min-h-[44px]"
          >
            {primaryAction.label}
          </button>
        )}

        {secondaryAction && (
          <>
            {secondaryAction.href ? (
              <Link
                href={secondaryAction.href}
                className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded min-h-[44px] flex items-center"
              >
                {secondaryAction.label} →
              </Link>
            ) : (
              <button
                onClick={secondaryAction.onClick}
                className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded min-h-[44px]"
              >
                {secondaryAction.label} →
              </button>
            )}
          </>
        )}
      </div>

      {/* Onboarding tip */}
      {onboardingTip && showTip && !isDismissed && (
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg max-w-sm relative">
          <button
            onClick={handleDismissTip}
            className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-1"
            aria-label="Dismiss tip"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <p className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
            <span className="text-lg" aria-hidden="true">
              💡
            </span>
            <span className="flex-1 pt-0.5">
              <span className="font-medium">Tip: </span>
              {onboardingTip}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
