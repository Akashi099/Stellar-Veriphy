"use client";

/**
 * useConfidenceScore.ts
 *
 * Derives a {@link ConfidenceResult} from a certificate's attestation evidence
 * and content manifest. Memoises the result so the parent component only
 * recomputes when evidence or manifest change identity.
 *
 * @example
 * ```tsx
 * const confidence = useConfidenceScore(cert.evidence, cert.manifest);
 * // confidence is null when evidence is not yet available (pending / loading)
 * ```
 */

import { useMemo } from "react";

import {
  computeConfidence,
  type ConfidenceResult,
} from "@stellarveriphy/shared/scoring";
import type { AttestationEvidence, ContentManifest } from "@stellarveriphy/shared/types";

/**
 * Computes the verification confidence score from attestation evidence and
 * a content manifest.
 *
 * @param evidence - The {@link AttestationEvidence} produced by the TEE oracle.
 *   Pass `undefined` or `null` when the oracle has not yet run — the returned
 *   result will be `null` in that case.
 * @param manifest - The {@link ContentManifest} associated with the content
 *   being verified. Pass `undefined` or `null` to receive `null`.
 *
 * @returns A memoised {@link ConfidenceResult}, or `null` when either input is
 *   absent.
 */
export function useConfidenceScore(
  evidence: AttestationEvidence | null | undefined,
  manifest: ContentManifest | null | undefined,
): ConfidenceResult | null {
  return useMemo(() => {
    if (!evidence || !manifest) return null;
    return computeConfidence({ evidence, manifest });
  }, [evidence, manifest]);
}
