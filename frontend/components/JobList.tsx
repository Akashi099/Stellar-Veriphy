"use client";

import { useEffect, useState } from "react";
import { isTerminal, useJobStatuses } from "@/hooks/useJobStatuses";
import { onTrackedJobsChange, readTrackedJobs, untrackJob, type TrackedJob } from "@/lib/tracked-jobs";
import { JobProgress, JobStatusBadge } from "./JobProgress";

export function JobList() {
  const [tracked, setTracked] = useState<TrackedJob[] | null>(null);

  useEffect(() => {
    const sync = () => setTracked(readTrackedJobs());
    sync();
    return onTrackedJobsChange(sync);
  }, []);

  const { jobs, loading, error, lastUpdated, refresh } = useJobStatuses(tracked?.map((t) => t.id) ?? []);

  if (tracked === null) return <p className="muted">Loading your jobs…</p>;
  if (tracked.length === 0) {
    return (
      <p className="muted">
        You have no verification jobs yet. <a href="/creator/upload-content">Upload content</a> to start one.
      </p>
    );
  }

  const active = Object.values(jobs).filter((j) => !isTerminal(j)).length;

  return (
    <section>
      <div className="toolbar">
        <span className="muted">
          {active > 0 ? `${active} job${active === 1 ? "" : "s"} in progress. Updating automatically.` : "All jobs have finished."}
          {lastUpdated && ` Last checked ${lastUpdated.toLocaleTimeString()}.`}
        </span>
        <button type="button" className="secondary" onClick={() => void refresh()}>Refresh</button>
      </div>
      {error && (
        <p className="notice notice-warning" role="status">
          {error} Showing the last known status; retrying automatically.
        </p>
      )}
      <ul className="job-list">
        {tracked.map((t) => {
          const job = jobs[t.id];
          return (
            <li key={t.id} className="card">
              <div className="job-header">
                <strong>{t.label}</strong>
                {job && <JobStatusBadge status={job.status} />}
              </div>
              <p className="muted">Submitted {new Date(t.submittedAt).toLocaleString()} · Job {t.id}</p>
              {job ? (
                <JobProgress job={job} />
              ) : loading || error ? (
                <p className="muted">Checking status…</p>
              ) : (
                <p className="notice notice-warning">
                  The server has no record of this job. It may have been cleared.{" "}
                  <button type="button" className="link" onClick={() => untrackJob(t.id)}>Remove from list</button>
                </p>
              )}
              {job && isTerminal(job) && (
                <button type="button" className="link" onClick={() => untrackJob(t.id)}>Dismiss</button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
