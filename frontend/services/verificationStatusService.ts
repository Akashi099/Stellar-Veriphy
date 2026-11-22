import { type VerificationFailure, verificationAction } from "@/lib/verificationErrors";

export type VerificationPhase = "submitted" | "pending" | "processing" | "verified" | "rejected" | "cancelled" | "failed" | "expired";
export interface VerificationStatus {
  jobId: string;
  phase: VerificationPhase;
  progress: number;
  message: string;
  txHash?: string | undefined;
  requestId?: string | undefined;
  updatedAt: string;
  terminal: boolean;
  failure?: VerificationFailure | undefined;
}
export interface WatchOptions {
  txHash?: string | undefined;
  requestId?: string | undefined;
  /** Retained for callers that also show a ledger explorer link. Status comes from the backend. */
  horizonUrl?: string | undefined;
  intervalMs?: number | undefined;
  timeoutMs?: number | undefined;
  onUpdate: (status: VerificationStatus) => void;
  onTerminal?: ((status: VerificationStatus) => void) | undefined;
  onError?: ((err: Error, jobId: string) => void) | undefined;
  useCache?: boolean | undefined;
  cacheTtlMs?: number | undefined;
}
export const PHASE_LABEL: Record<VerificationPhase, string> = {
  submitted: "Transaction submitted", pending: "Request received", processing: "Provider processing",
  verified: "Verification complete", rejected: "Rejected", cancelled: "Cancelled", failed: "Error", expired: "Expired",
};
const progress: Record<VerificationPhase, number> = { submitted: 10, pending: 25, processing: 55, verified: 100, rejected: 100, cancelled: 100, failed: 100, expired: 100 };
const phases: Record<string, VerificationPhase> = { pending: "pending", processing: "processing", certified: "verified", failed: "failed", cancelled: "cancelled" };
const terminal = new Set<VerificationPhase>(["verified", "rejected", "cancelled", "failed", "expired"]);
export const DEFAULT_VERIFICATION_CACHE_TTL_MS = 5_000;
export class VerificationStatusApiError extends Error {
  constructor(readonly status: number) { super(status === 409 ? "Verification can no longer be cancelled." : status === 401 || status === 403 ? "You are not authorized to cancel this verification." : "Verification service is temporarily unavailable."); }
}
interface PollRecord {
  opts: WatchOptions;
  stopped: boolean;
  timer?: ReturnType<typeof setTimeout>;
  timeout?: ReturnType<typeof setTimeout>;
  controller: AbortController;
  last?: string;
}
export type CancellationRequest = () => Promise<{ status: string }>;

export class VerificationStatusService {
  private polls = new Map<string, PollRecord>();
  private ttl = DEFAULT_VERIFICATION_CACHE_TTL_MS;
  setCacheTtl(ttlMs: number): void { this.ttl = Math.max(0, ttlMs); }
  get cacheTtlMs(): number { return this.ttl; }
  /** Status reads intentionally bypass caches, including immediately after cancellation. */
  invalidateCache(_jobId?: string, _requestId?: string): void {}

  private emit(jobId: string, record: PollRecord, data: { status: string; updatedAt?: string; failure?: VerificationFailure; txHash?: string }): VerificationStatus {
    const phase = phases[data.status];
    if (!phase) throw new Error("Unknown verification status. Refresh or contact support.");
    const status: VerificationStatus = {
      jobId, phase, progress: progress[phase], terminal: terminal.has(phase),
      message: data.failure ? verificationAction(data.failure) : PHASE_LABEL[phase],
      updatedAt: data.updatedAt ?? new Date().toISOString(),
      txHash: data.txHash ?? record.opts.txHash, requestId: record.opts.requestId, failure: data.failure,
    };
    if (record.stopped) return status;
    const key = JSON.stringify([data.status, data.updatedAt, data.failure]);
    const changed = record.last !== key;
    record.last = key;
    if (status.terminal) this.unwatch(jobId);
    if (changed) record.opts.onUpdate(status);
    if (status.terminal) record.opts.onTerminal?.(status);
    return status;
  }

  watch(jobId: string, opts: WatchOptions): () => void {
    this.unwatch(jobId);
    const record: PollRecord = { opts, stopped: false, controller: new AbortController() };
    this.polls.set(jobId, record);
    const tick = async () => {
      try {
        const response = await fetch("/api/verifications/" + encodeURIComponent(jobId), { cache: "no-store", signal: record.controller.signal });
        if (!response.ok) throw new VerificationStatusApiError(response.status);
        const data = await response.json();
        if (!record.stopped) this.emit(jobId, record, data);
      } catch (error) {
        if (!record.stopped) opts.onError?.(error instanceof Error ? error : new Error("Status lookup failed"), jobId);
      } finally {
        if (!record.stopped) record.timer = setTimeout(() => { void tick(); }, opts.intervalMs ?? 3_000);
      }
    };
    record.timeout = setTimeout(() => {
      if (record.stopped) return;
      this.unwatch(jobId);
      opts.onError?.(new Error("Status polling paused. Refresh to check this verification again."), jobId);
    }, opts.timeoutMs ?? 300_000);
    void tick();
    return () => { if (this.polls.get(jobId) === record) this.unwatch(jobId); };
  }

  /** Callback may use the caller's authenticated transport. Resolve only on confirmed cancellation. */
  async cancel(jobId: string, request?: CancellationRequest): Promise<VerificationStatus> {
    const record = this.polls.get(jobId);
    const result = request ? await request() : await (async () => {
      const response = await fetch("/api/verifications/" + encodeURIComponent(jobId) + "/cancel", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new VerificationStatusApiError(response.status);
      return response.json() as Promise<{ status: string }>;
    })();
    if (result.status !== "cancelled") throw new Error("Cancellation was not confirmed.");
    // Ignore responses from polling that started before the confirmed cancellation.
    if (record && this.polls.get(jobId) === record) return this.emit(jobId, record, { status: "cancelled" });
    return { jobId, phase: "cancelled", progress: 100, message: PHASE_LABEL.cancelled, terminal: true, updatedAt: new Date().toISOString() };
  }
  unwatch(jobId: string): void {
    const record = this.polls.get(jobId);
    if (!record) return;
    record.stopped = true; record.controller.abort();
    clearTimeout(record.timer); clearTimeout(record.timeout); this.polls.delete(jobId);
  }
  unwatchAll(): void { for (const jobId of this.polls.keys()) this.unwatch(jobId); }
  isWatching(jobId: string): boolean { return this.polls.has(jobId); }
}
export const verificationStatusService = new VerificationStatusService();
