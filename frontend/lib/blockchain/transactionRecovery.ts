/**
 * transactionRecovery.ts
 *
 * Recovery strategy for orphaned or failed blockchain transactions (#690).
 *
 * Handles three failure modes:
 *   1. PENDING_TIMEOUT — a transaction was submitted but never confirmed
 *      within the expected window.
 *   2. PARTIAL_SUBMISSION — a transaction envelope was signed and sent but
 *      confirmation was never received by the client.
 *   3. NETWORK_STALL — a transaction is stuck because the Stellar network
 *      was congested or the RPC node was unreachable.
 *
 * SAFETY CONTRACT
 * ---------------
 * All recovery paths are designed to be idempotent and read-only unless an
 * operator explicitly initiates a retry or abandonment. The module never
 * resubmits a transaction automatically; that decision always requires human
 * confirmation to avoid duplicate minting or conflicting certificate records.
 *
 * DUPLICATE-MINT GUARD
 * --------------------
 * Before any retry is allowed, `checkDuplicateRisk` must be called. It queries
 * the provenance contract to determine whether a certificate for the given
 * manifest hash already exists on-chain. If one is found, the job is marked
 * ALREADY_MINTED and no retry is permitted.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransactionFailureMode =
  | "PENDING_TIMEOUT"
  | "PARTIAL_SUBMISSION"
  | "NETWORK_STALL"
  | "UNKNOWN";

export type RecoveryAction =
  | "RETRY_SUBMISSION"   // Safe to resubmit — on-chain state confirms nothing was minted
  | "ABANDON"            // Drop the job; cert was not minted, no retry needed
  | "ALREADY_MINTED"     // Certificate already exists on-chain; no action required
  | "ESCALATE"           // Conflicting on-chain state; requires manual operator review
  | "AWAIT"              // Network stall; wait and re-check before deciding
  | "UNKNOWN";

export interface OrphanedTransaction {
  /** Internal job identifier assigned before the transaction was submitted. */
  jobId: string;
  /** Stellar transaction hash, if the envelope was successfully broadcast. */
  txHash?: string;
  /** SHA-256 hex digest of the manifest that was being certified. */
  manifestHash: string;
  /** ISO 8601 timestamp when the transaction was first submitted. */
  submittedAt: string;
  /** Number of previous retry attempts. */
  retryCount: number;
  /** Detected failure mode. */
  failureMode: TransactionFailureMode;
}

export interface RecoveryDiagnosis {
  jobId: string;
  action: RecoveryAction;
  /** Human-readable explanation for operators. */
  rationale: string;
  /** Whether an existing on-chain certificate was found. */
  existingCertificateId?: string;
  /** Whether the transaction was confirmed on-chain as failed (not just absent). */
  confirmedFailed: boolean;
  /** Safe to proceed with retry without risk of duplicate mint. */
  safeToRetry: boolean;
  diagnosedAt: string;
}

export interface RecoveryOutcome {
  jobId: string;
  action: RecoveryAction;
  success: boolean;
  detail: string;
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Milliseconds before a pending transaction is considered timed-out. */
export const PENDING_TIMEOUT_MS = 120_000; // 2 minutes (Stellar 3–5 s finality + buffer)

/** Maximum number of safe automatic retries (operator approval required beyond this). */
export const MAX_SAFE_RETRIES = 3;

// ---------------------------------------------------------------------------
// On-chain lookup helpers (stubs — replaced with real Stellar SDK calls in prod)
// ---------------------------------------------------------------------------

/**
 * Returns the on-chain status of a transaction by its hash.
 * In production, calls `horizon.transactions(txHash)` or `rpc.getTransaction(txHash)`.
 */
async function fetchTransactionStatus(
  txHash: string
): Promise<"SUCCESS" | "FAILED" | "NOT_FOUND"> {
  // Stub: production implementation queries Horizon / Soroban RPC
  void txHash;
  return "NOT_FOUND";
}

/**
 * Checks whether a provenance certificate for the given manifest hash already
 * exists on-chain.
 *
 * In production, invokes `provenance_contract.get_certificate_by_manifest_hash(manifestHash)`
 * via the Soroban SDK.
 *
 * Returns the certificate ID string if found, or null if none exists.
 */
async function lookupCertificateByManifestHash(
  manifestHash: string
): Promise<string | null> {
  // Stub: production implementation queries the provenance Soroban contract
  void manifestHash;
  return null;
}

// ---------------------------------------------------------------------------
// Duplicate-risk check
// ---------------------------------------------------------------------------

/**
 * Determines whether retrying a failed transaction would risk minting a
 * duplicate certificate.
 *
 * Returns:
 *  - `{ duplicate: false }` — safe to retry; no certificate exists on-chain.
 *  - `{ duplicate: true, certificateId }` — a certificate already exists;
 *    the caller must mark the job as ALREADY_MINTED.
 */
export async function checkDuplicateRisk(
  manifestHash: string
): Promise<{ duplicate: boolean; certificateId?: string }> {
  const existing = await lookupCertificateByManifestHash(manifestHash);
  if (existing !== null) {
    return { duplicate: true, certificateId: existing };
  }
  return { duplicate: false };
}

// ---------------------------------------------------------------------------
// Failure mode detection
// ---------------------------------------------------------------------------

/**
 * Detects the failure mode of an orphaned job based on elapsed time and
 * the on-chain transaction status (if a tx hash is available).
 */
export async function detectFailureMode(
  job: Pick<OrphanedTransaction, "jobId" | "txHash" | "submittedAt">
): Promise<TransactionFailureMode> {
  const ageMs = Date.now() - new Date(job.submittedAt).getTime();

  if (!job.txHash) {
    // No hash means the transaction never left the client
    return ageMs > PENDING_TIMEOUT_MS ? "PENDING_TIMEOUT" : "UNKNOWN";
  }

  const onChainStatus = await fetchTransactionStatus(job.txHash);

  switch (onChainStatus) {
    case "NOT_FOUND":
      return ageMs > PENDING_TIMEOUT_MS ? "PARTIAL_SUBMISSION" : "NETWORK_STALL";
    case "FAILED":
      return "PENDING_TIMEOUT"; // The chain rejected it; treat as a clean timeout
    case "SUCCESS":
      // Should not normally reach the recovery path if the transaction succeeded,
      // but we handle it gracefully.
      return "UNKNOWN";
    default:
      return "UNKNOWN";
  }
}

// ---------------------------------------------------------------------------
// Core diagnosis
// ---------------------------------------------------------------------------

/**
 * Diagnoses an orphaned transaction and recommends a recovery action.
 *
 * Steps:
 *   1. Check for an existing on-chain certificate (duplicate-risk gate).
 *   2. Determine on-chain transaction status (if a hash is available).
 *   3. Apply decision tree to select a RecoveryAction.
 *   4. Return a fully documented RecoveryDiagnosis for the operator.
 *
 * This function is read-only and does not mutate any state.
 */
export async function diagnoseOrphanedTransaction(
  job: OrphanedTransaction
): Promise<RecoveryDiagnosis> {
  const diagnosedAt = new Date().toISOString();

  // Step 1 — duplicate-risk gate
  const { duplicate, certificateId } = await checkDuplicateRisk(job.manifestHash);

  if (duplicate && certificateId) {
    return {
      jobId: job.jobId,
      action: "ALREADY_MINTED",
      rationale:
        `A certificate (${certificateId}) already exists on-chain for this manifest hash. ` +
        "No further action is required. Mark the job as completed.",
      existingCertificateId: certificateId,
      confirmedFailed: false,
      safeToRetry: false,
      diagnosedAt,
    };
  }

  // Step 2 — on-chain transaction status
  let confirmedFailed = false;

  if (job.txHash) {
    const status = await fetchTransactionStatus(job.txHash);

    if (status === "SUCCESS") {
      // Transaction succeeded but the client missed the confirmation — treat as minted
      return {
        jobId: job.jobId,
        action: "ALREADY_MINTED",
        rationale:
          "The Stellar transaction was confirmed successful on-chain. " +
          "The certificate was minted; the client missed the confirmation event. " +
          "Re-query the provenance contract to retrieve the certificate ID.",
        confirmedFailed: false,
        safeToRetry: false,
        diagnosedAt,
      };
    }

    confirmedFailed = status === "FAILED";
  }

  // Step 3 — decision tree
  const failureMode = job.failureMode;
  const ageMs = Date.now() - new Date(job.submittedAt).getTime();
  const exceededRetries = job.retryCount >= MAX_SAFE_RETRIES;

  if (failureMode === "NETWORK_STALL" && ageMs < PENDING_TIMEOUT_MS * 2) {
    return {
      jobId: job.jobId,
      action: "AWAIT",
      rationale:
        "The transaction hash exists but has not yet been confirmed. Stellar finality is 3–5 seconds " +
        "under normal conditions. Wait for the network to stabilise, then re-check before retrying.",
      confirmedFailed,
      safeToRetry: false,
      diagnosedAt,
    };
  }

  if (exceededRetries) {
    return {
      jobId: job.jobId,
      action: "ESCALATE",
      rationale:
        `This job has exceeded the maximum safe retry count (${MAX_SAFE_RETRIES}). ` +
        "Manual operator review is required before any further retry to avoid data inconsistency.",
      confirmedFailed,
      safeToRetry: false,
      diagnosedAt,
    };
  }

  if (confirmedFailed || failureMode === "PENDING_TIMEOUT" || failureMode === "PARTIAL_SUBMISSION") {
    return {
      jobId: job.jobId,
      action: "RETRY_SUBMISSION",
      rationale:
        "No certificate exists on-chain for this manifest hash, and the original transaction " +
        `${confirmedFailed ? "was confirmed failed" : "timed out without confirmation"}. ` +
        "It is safe to build and submit a new transaction envelope for this job. " +
        "Ensure the sequence number is refreshed from the current account state before signing.",
      confirmedFailed,
      safeToRetry: true,
      diagnosedAt,
    };
  }

  return {
    jobId: job.jobId,
    action: "UNKNOWN",
    rationale:
      "Could not determine a safe recovery path. Log this job for manual operator review. " +
      "Do not retry without first confirming that no certificate exists on-chain.",
    confirmedFailed,
    safeToRetry: false,
    diagnosedAt,
  };
}

// ---------------------------------------------------------------------------
// Recovery execution
// ---------------------------------------------------------------------------

/**
 * Executes the approved recovery action for an orphaned transaction.
 *
 * IMPORTANT: this function must only be called after an operator has reviewed
 * the RecoveryDiagnosis and explicitly approved the action. It does not
 * automatically retry or resubmit anything; it returns an outcome record that
 * the caller is responsible for acting on.
 *
 * In production:
 *  - RETRY_SUBMISSION → the caller rebuilds the transaction with a fresh
 *    sequence number and submits it via the existing signing flow.
 *  - ABANDON / ALREADY_MINTED → the job record is marked terminal in the
 *    operator's job store.
 *  - ESCALATE → the job is flagged in the audit log for human review.
 *  - AWAIT → no action; the caller schedules a re-check.
 */
export async function executeRecovery(
  diagnosis: RecoveryDiagnosis,
  operatorApproved: boolean
): Promise<RecoveryOutcome> {
  const completedAt = new Date().toISOString();

  if (!operatorApproved) {
    return {
      jobId: diagnosis.jobId,
      action: diagnosis.action,
      success: false,
      detail:
        "Recovery was not executed: operator approval is required before any recovery action is taken.",
      completedAt,
    };
  }

  switch (diagnosis.action) {
    case "RETRY_SUBMISSION":
      if (!diagnosis.safeToRetry) {
        return {
          jobId: diagnosis.jobId,
          action: diagnosis.action,
          success: false,
          detail:
            "Retry blocked: diagnosis indicates it is not safe to retry this job. " +
            "Re-run diagnosis before proceeding.",
          completedAt,
        };
      }
      // In production: trigger the job submission pipeline with a fresh sequence number.
      return {
        jobId: diagnosis.jobId,
        action: "RETRY_SUBMISSION",
        success: true,
        detail:
          "Retry approved. Caller must rebuild the transaction envelope with a fresh account " +
          "sequence number and resubmit through the standard signing flow. " +
          "Increment retryCount on the job record.",
        completedAt,
      };

    case "ABANDON":
      return {
        jobId: diagnosis.jobId,
        action: "ABANDON",
        success: true,
        detail:
          "Job marked as abandoned. No certificate was minted. " +
          "The job record should be transitioned to a terminal ABANDONED state.",
        completedAt,
      };

    case "ALREADY_MINTED":
      return {
        jobId: diagnosis.jobId,
        action: "ALREADY_MINTED",
        success: true,
        detail:
          `Certificate already exists on-chain (${diagnosis.existingCertificateId ?? "unknown ID"}). ` +
          "Mark the job as COMPLETED and associate the existing certificate ID.",
        completedAt,
      };

    case "ESCALATE":
      return {
        jobId: diagnosis.jobId,
        action: "ESCALATE",
        success: true,
        detail:
          "Job escalated for manual operator review. It has been flagged in the audit log. " +
          "Do not retry until a human operator has reviewed on-chain state.",
        completedAt,
      };

    case "AWAIT":
      return {
        jobId: diagnosis.jobId,
        action: "AWAIT",
        success: true,
        detail:
          "No action taken. Schedule a re-check after the network stabilises. " +
          "Stellar transactions typically confirm within 5–10 seconds; allow up to 2 minutes " +
          "before escalating to RETRY_SUBMISSION.",
        completedAt,
      };

    default:
      return {
        jobId: diagnosis.jobId,
        action: "UNKNOWN",
        success: false,
        detail:
          "Unknown recovery action. Log the job and initiate a manual review without retrying.",
        completedAt,
      };
  }
}

// ---------------------------------------------------------------------------
// Batch recovery scanner
// ---------------------------------------------------------------------------

/**
 * Scans a list of job records and returns a diagnosis for each one.
 *
 * Intended to be run by an operator tool or a scheduled background process
 * (not automatically in response to user requests).
 *
 * Returns diagnoses in order of severity: ESCALATE > RETRY_SUBMISSION >
 * ALREADY_MINTED > AWAIT > ABANDON > UNKNOWN.
 */
export async function scanOrphanedJobs(
  jobs: OrphanedTransaction[]
): Promise<RecoveryDiagnosis[]> {
  const actionPriority: Record<RecoveryAction, number> = {
    ESCALATE: 0,
    RETRY_SUBMISSION: 1,
    ALREADY_MINTED: 2,
    AWAIT: 3,
    ABANDON: 4,
    UNKNOWN: 5,
  };

  const results = await Promise.all(jobs.map((job) => diagnoseOrphanedTransaction(job)));

  return results.sort(
    (a, b) =>
      (actionPriority[a.action] ?? 99) - (actionPriority[b.action] ?? 99)
  );
}
