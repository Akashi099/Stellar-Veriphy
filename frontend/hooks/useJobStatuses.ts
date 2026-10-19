"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VerificationJobView } from "@stellarveriphy/shared";
import { api } from "@/lib/api";

const POLL_INTERVAL_MS = 2000;
const MAX_BACKOFF_MS = 30000;

export function isTerminal(job: VerificationJobView): boolean {
  return job.status === "certified" || job.status === "failed";
}

// Polls the server for the given jobs until all of them finish. Polling backs
// off after network errors and resumes immediately when the tab regains focus.
export function useJobStatuses(ids: string[]) {
  const [jobs, setJobs] = useState<Record<string, VerificationJobView>>({});
  const [loading, setLoading] = useState(ids.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const key = ids.join(",");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const failures = useRef(0);

  const poll = useCallback(async () => {
    clearTimeout(timer.current);
    const idList = key ? key.split(",") : [];
    if (idList.length === 0) {
      setLoading(false);
      return;
    }
    try {
      const views = await api.getJobs(idList);
      setJobs(Object.fromEntries(views.map((j) => [j.id, j])));
      setError(null);
      setLastUpdated(new Date());
      failures.current = 0;
      if (views.some((j) => !isTerminal(j))) timer.current = setTimeout(poll, POLL_INTERVAL_MS);
    } catch (err) {
      failures.current += 1;
      setError(err instanceof Error ? err.message : "Could not refresh job status.");
      const delay = Math.min(POLL_INTERVAL_MS * 2 ** failures.current, MAX_BACKOFF_MS);
      timer.current = setTimeout(poll, delay);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    setLoading(key !== "");
    void poll();
    const onVisible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll, key]);

  return { jobs, loading, error, lastUpdated, refresh: poll };
}
