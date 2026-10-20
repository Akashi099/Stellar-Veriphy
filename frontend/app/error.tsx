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

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    captureException(error, { tags: { source: "route_error_boundary" }, extra: { digest: error.digest } });
  }, [error]);

  const serviceUnavailable = ApiError.isServiceUnavailable(error);

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
