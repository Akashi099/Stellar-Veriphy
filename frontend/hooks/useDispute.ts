"use client";

/**
 * useDispute.ts
 *
 * React hooks for the content dispute workflow.
 *
 * @example — raising a dispute
 * ```tsx
 * const { raise, isPending, error, dispute } = useRaiseDispute();
 * await raise({ certificateId: "42", contentHash: "a1b2...", trigger: "fraudulent_content", summary: "..." });
 * ```
 *
 * @example — fetching disputes for a certificate
 * ```tsx
 * const { disputes, isLoading } = useDisputesForCertificate(certificateId);
 * ```
 *
 * @example — fetching the audit trail
 * ```tsx
 * const { entries, isLoading } = useDisputeAuditTrail(disputeId);
 * ```
 */

import { useCallback, useEffect, useState } from "react";

import {
  attachEvidence,
  getDisputeAuditTrail,
  getDisputesForCertificate,
  raiseContentDispute,
  resolveContentDispute,
} from "@/services/disputeService";
import type {
  DisputeAuditEntry,
  DisputeEvidence,
  DisputeRecord,
  DisputeResolutionRequest,
  RaiseDisputeRequest,
} from "@/types/dispute";

// ---------------------------------------------------------------------------
// useRaiseDispute
// ---------------------------------------------------------------------------

interface UseRaiseDispute {
  /** Call this to submit the dispute. Returns the created record on success. */
  raise: (req: RaiseDisputeRequest) => Promise<DisputeRecord | null>;
  isPending: boolean;
  error: string | null;
  /** Populated after a successful raise. */
  dispute: DisputeRecord | null;
  reset: () => void;
}

export function useRaiseDispute(): UseRaiseDispute {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispute, setDispute] = useState<DisputeRecord | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setDispute(null);
  }, []);

  const raise = useCallback(async (req: RaiseDisputeRequest) => {
    setIsPending(true);
    setError(null);
    try {
      const res = await raiseContentDispute(req);
      if (res.success && res.data) {
        setDispute(res.data);
        return res.data;
      }
      setError(res.error ?? "Failed to raise dispute.");
      return null;
    } finally {
      setIsPending(false);
    }
  }, []);

  return { raise, isPending, error, dispute, reset };
}

// ---------------------------------------------------------------------------
// useDisputesForCertificate
// ---------------------------------------------------------------------------

interface UseDisputesForCertificate {
  disputes: DisputeRecord[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDisputesForCertificate(
  certificateId: string | null | undefined,
): UseDisputesForCertificate {
  const [disputes, setDisputes] = useState<DisputeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!certificateId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getDisputesForCertificate(certificateId);
      if (res.success && res.data) {
        setDisputes(res.data);
      } else {
        setError(res.error ?? "Failed to load disputes.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [certificateId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { disputes, isLoading, error, refetch: fetch };
}

// ---------------------------------------------------------------------------
// useDisputeAuditTrail
// ---------------------------------------------------------------------------

interface UseDisputeAuditTrail {
  entries: DisputeAuditEntry[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDisputeAuditTrail(
  disputeId: string | null | undefined,
): UseDisputeAuditTrail {
  const [entries, setEntries] = useState<DisputeAuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!disputeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getDisputeAuditTrail(disputeId);
      if (res.success && res.data) {
        setEntries(res.data);
      } else {
        setError(res.error ?? "Failed to load audit trail.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [disputeId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { entries, isLoading, error, refetch: fetch };
}

// ---------------------------------------------------------------------------
// useAttachEvidence
// ---------------------------------------------------------------------------

interface UseAttachEvidence {
  attach: (
    disputeId: string,
    evidence: DisputeEvidence,
  ) => Promise<DisputeRecord | null>;
  isPending: boolean;
  error: string | null;
}

export function useAttachEvidence(): UseAttachEvidence {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attach = useCallback(
    async (disputeId: string, evidence: DisputeEvidence) => {
      setIsPending(true);
      setError(null);
      try {
        const res = await attachEvidence(disputeId, evidence);
        if (res.success && res.data) return res.data;
        setError(res.error ?? "Failed to attach evidence.");
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { attach, isPending, error };
}

// ---------------------------------------------------------------------------
// useResolveDispute  (admin-only)
// ---------------------------------------------------------------------------

interface UseResolveDispute {
  resolve: (
    disputeId: string,
    resolution: DisputeResolutionRequest,
  ) => Promise<DisputeRecord | null>;
  isPending: boolean;
  error: string | null;
}

export function useResolveDispute(): UseResolveDispute {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback(
    async (disputeId: string, resolution: DisputeResolutionRequest) => {
      setIsPending(true);
      setError(null);
      try {
        const res = await resolveContentDispute(disputeId, resolution);
        if (res.success && res.data) return res.data;
        setError(res.error ?? "Failed to resolve dispute.");
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { resolve, isPending, error };
}
