"use client";

import { type DependencyList, useCallback, useEffect, useRef, useState } from "react";

/**
 * useRetryable — #763
 *
 * Runs an async loader, tracks loading/error state, and exposes `retry()` for
 * the matching <RetryableError> component. Stale results from superseded runs
 * are ignored so a slow first attempt can't overwrite a newer retry.
 *
 *   const { data, error, loading, retry } = useRetryable(() => fetchJson("/api/x"), []);
 *   if (error) return <RetryableError error={error} onRetry={retry} retrying={loading} />;
 */
export function useRetryable<T>(loader: () => Promise<T>, deps: DependencyList, options: { immediate?: boolean } = {}) {
  const { immediate = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(immediate);
  const runId = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    const id = ++runId.current;
    setLoading(true);
    try {
      const result = await loaderRef.current();
      if (id === runId.current) {
        setData(result);
        setError(null);
      }
      return result;
    } catch (err) {
      if (id === runId.current) setError(err);
      return undefined;
    } finally {
      if (id === runId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (immediate) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, setData, error, loading, retry: run };
}
