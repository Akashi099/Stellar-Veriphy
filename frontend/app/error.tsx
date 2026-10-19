"use client";

/**
 * Route-level error boundary (#763). Catches render/data errors in any page and
 * offers a one-click retry that re-fetches server data and re-renders the
 * segment, instead of leaving the user on a blank or broken screen.
 */

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

import { RetryableError } from "@/components/ui/RetryableError";
import { captureException } from "@/lib/error-tracking/client";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    captureException(error, { tags: { source: "route_error_boundary" }, extra: { digest: error.digest } });
  }, [error]);

  return (
    <main id="main-content" className="mx-auto flex min-h-[50vh] max-w-xl items-center px-4 py-12">
      <div className="w-full space-y-3">
        <RetryableError
          error={error}
          title="This page couldn't be loaded"
          fallbackMessage="Something went wrong while loading this page."
          retrying={isPending}
          onRetry={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        />
        {error.digest && (
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Error reference: <code className="select-all font-mono">{error.digest}</code>
          </p>
        )}
      </div>
    </main>
  );
}
