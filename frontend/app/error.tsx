"use client";

/**
 * Route-level error boundary (#763). Catches render/data errors in any page and
 * offers a one-click retry that re-fetches server data and re-renders the
 * segment, instead of leaving the user on a blank or broken screen.
 */

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

import { RetryableError } from "@/components/ui/RetryableError";
import { ApiError } from "@/lib/api/errors";
import { captureException } from "@/lib/error-tracking/client";

/**
 * Capabilities the app depends on for session persistence and offline support.
 * When one is missing we surface targeted guidance instead of a generic error.
 */
const CAPABILITY_LABELS: Record<string, string> = {
  serviceWorker: "Service Workers",
  crypto: "the Web Crypto API",
  indexedDB: "IndexedDB",
  localStorage: "local storage",
  sessionStorage: "session storage",
};

const CAPABILITY_PATTERN = /\b(serviceWorker|crypto|indexedDB|localStorage|sessionStorage)\b/i;

function detectMissingCapability(error: Error): string | null {
  const match = `${error.name} ${error.message}`.match(CAPABILITY_PATTERN);
  if (match) {
    return CAPABILITY_LABELS[match[1]] ?? match[1];
  }
  if (typeof window !== "undefined") {
    if (!("serviceWorker" in navigator)) return CAPABILITY_LABELS.serviceWorker;
    if (!("crypto" in window) || !window.crypto?.subtle) return CAPABILITY_LABELS.crypto;
    if (!("indexedDB" in window)) return CAPABILITY_LABELS.indexedDB;
  }
  return null;
}

function isSessionPersistenceError(error: Error): boolean {
  return /session|persist|auth state|storage/i.test(`${error.name} ${error.message}`);
}

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    captureException(error, { tags: { source: "route_error_boundary" }, extra: { digest: error.digest } });
  }, [error]);

  const serviceUnavailable = ApiError.isServiceUnavailable(error);
  const missingCapability = detectMissingCapability(error);
  const sessionPersistenceFailure = !missingCapability && isSessionPersistenceError(error);

  const title = missingCapability
    ? "Your browser is missing a required feature"
    : sessionPersistenceFailure
      ? "We couldn't restore your session"
      : "This page couldn't be loaded";

  const fallbackMessage = missingCapability
    ? `This app needs ${missingCapability}, which your browser doesn't support or has disabled. Try updating your browser, disabling strict privacy extensions, or switching to a recent version of Chrome, Firefox, Edge, or Safari.`
    : sessionPersistenceFailure
      ? "Your sign-in state couldn't be saved or restored after a reload. Retry to continue; if this keeps happening, check that cookies and site storage are enabled for this site, then sign in again."
      : "Something went wrong while loading this page.";

  return (
    <main id="main-content" className="mx-auto flex min-h-[50vh] max-w-xl items-center px-4 py-12">
      <div className="w-full space-y-3">
        <RetryableError
          error={error}
          title={serviceUnavailable ? "Verification service is temporarily unavailable" : "This page couldn't be loaded"}
          fallbackMessage={
            serviceUnavailable
              ? "We couldn't reach the verification service right now. Your data is safe — please try again in a moment."
              : "Something went wrong while loading this page."
          }
          title={title}
          fallbackMessage={fallbackMessage}
          retrying={isPending}
          onRetry={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        />
        {serviceUnavailable && (
          <p className="text-center text-sm text-gray-600 dark:text-gray-300">
            Still having trouble?{" "}
            <a href="/" className="font-medium text-blue-600 underline hover:text-blue-700 dark:text-blue-400">
              Return to home
            </a>{" "}
            or{" "}
            <a href="/verify" className="font-medium text-blue-600 underline hover:text-blue-700 dark:text-blue-400">
              start a new verification
            </a>
            .
          </p>
        )}
        {error.digest && (
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Error reference: <code className="select-all font-mono">{error.digest}</code>
          </p>
        )}
      </div>
    </main>
  );
}
