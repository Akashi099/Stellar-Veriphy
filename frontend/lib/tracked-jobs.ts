// Remembers which verification jobs this browser submitted, so their status can
// be restored after a refresh or navigation. The server stays the source of truth.

const STORAGE_KEY = "veriphy:tracked-jobs";
const MAX_TRACKED = 50;
const CHANGE_EVENT = "veriphy:tracked-jobs-changed";

export interface TrackedJob {
  id: string;
  label: string;       // e.g. the file name
  submittedAt: string;
}

export function readTrackedJobs(): TrackedJob[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(jobs: TrackedJob[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, MAX_TRACKED)));
  } catch {
    // Storage may be unavailable (private mode); tracking just won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function trackJob(job: TrackedJob) {
  write([job, ...readTrackedJobs().filter((j) => j.id !== job.id)]);
}

export function untrackJob(id: string) {
  write(readTrackedJobs().filter((j) => j.id !== id));
}

export function onTrackedJobsChange(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && listener();
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
