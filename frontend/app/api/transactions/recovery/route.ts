/**
 * GET /api/transactions/recovery
 *
 * Returns recovery diagnoses for orphaned or failed blockchain transactions (#690).
 *
 * Query parameters:
 *   jobIds (optional) — comma-separated list of job IDs to diagnose.
 *                       When omitted, all known orphaned jobs are scanned.
 *
 * POST /api/transactions/recovery
 *
 * Executes an approved recovery action for a single job.
 *
 * Body: { jobId: string; action: RecoveryAction; operatorApproved: true }
 *
 * SAFETY: Execution always requires `operatorApproved: true` in the request
 * body. The handler rejects the request otherwise.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  diagnoseOrphanedTransaction,
  executeRecovery,
  scanOrphanedJobs,
  type OrphanedTransaction,
  type RecoveryAction,
  type RecoveryDiagnosis,
  type RecoveryOutcome,
} from "@/lib/blockchain/transactionRecovery";

// ---------------------------------------------------------------------------
// Mock orphaned job store — replaced with real persistence in production
// ---------------------------------------------------------------------------

function getMockOrphanedJobs(): OrphanedTransaction[] {
  const now = Date.now();
  return [
    {
      jobId: "job-timeout-001",
      txHash: undefined,
      manifestHash: "abc123def456abc123def456abc123def456abc123def456abc123def456ab01",
      submittedAt: new Date(now - 180_000).toISOString(), // 3 min ago
      retryCount: 0,
      failureMode: "PENDING_TIMEOUT",
    },
    {
      jobId: "job-stall-002",
      txHash: "7f8e9d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e",
      manifestHash: "def456abc123def456abc123def456abc123def456abc123def456abc123de02",
      submittedAt: new Date(now - 45_000).toISOString(), // 45 s ago
      retryCount: 0,
      failureMode: "NETWORK_STALL",
    },
    {
      jobId: "job-partial-003",
      txHash: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
      manifestHash: "789abc012def789abc012def789abc012def789abc012def789abc012def7803",
      submittedAt: new Date(now - 300_000).toISOString(), // 5 min ago
      retryCount: 1,
      failureMode: "PARTIAL_SUBMISSION",
    },
  ];
}

// ---------------------------------------------------------------------------
// GET — diagnose orphaned jobs
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<{ diagnoses: RecoveryDiagnosis[] } | { error: string }>> {
  try {
    const { searchParams } = new URL(request.url);
    const jobIdsParam = searchParams.get("jobIds");

    const allJobs = getMockOrphanedJobs();
    const jobsToScan = jobIdsParam
      ? allJobs.filter((j) => jobIdsParam.split(",").includes(j.jobId))
      : allJobs;

    const diagnoses = await scanOrphanedJobs(jobsToScan);

    return NextResponse.json({ diagnoses });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to diagnose orphaned transactions." },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — execute a recovery action (operator-approved only)
// ---------------------------------------------------------------------------

interface RecoveryExecutionBody {
  jobId: string;
  action: RecoveryAction;
  operatorApproved: boolean;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<RecoveryOutcome | { error: string }>> {
  try {
    const body = (await request.json()) as RecoveryExecutionBody;

    if (!body.jobId || !body.action) {
      return NextResponse.json(
        { error: "Request body must include jobId and action." },
        { status: 400 }
      );
    }

    if (body.operatorApproved !== true) {
      return NextResponse.json(
        {
          error:
            "Recovery execution requires explicit operator approval: set operatorApproved to true.",
        },
        { status: 403 }
      );
    }

    const allJobs = getMockOrphanedJobs();
    const job = allJobs.find((j) => j.jobId === body.jobId);

    if (!job) {
      return NextResponse.json(
        { error: `Job ${body.jobId} not found in orphaned job store.` },
        { status: 404 }
      );
    }

    // Re-diagnose to ensure the recommended action matches what was approved
    const diagnosis = await diagnoseOrphanedTransaction(job);

    if (diagnosis.action !== body.action) {
      return NextResponse.json(
        {
          error:
            `Action mismatch: current diagnosis recommends "${diagnosis.action}" but ` +
            `"${body.action}" was approved. Re-fetch the diagnosis before executing.`,
        },
        { status: 409 }
      );
    }

    const outcome = await executeRecovery(diagnosis, true);
    return NextResponse.json(outcome);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to execute recovery action." },
      { status: 500 }
    );
  }
}
