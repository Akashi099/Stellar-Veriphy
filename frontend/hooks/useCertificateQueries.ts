/**
 * useCertificateQueries.ts
 *
 * React Query hooks for all certificate-related data fetching.
 *
 * Each hook wraps a service function with per-domain TTLs from
 * `config/cache.ts`, ensuring blockchain reads are cached appropriately
 * and UI components remain decoupled from fetch mechanics.
 *
 * @module hooks/useCertificateQueries
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useCertificateById("cert-123");
 * ```
 */

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys, STALE_TIMES } from "@/config/cache";
import type { CertificateSearchFilters } from "@/services/certificateVerificationService";
import {
  getCertificateByCode,
  getCertificateById,
  getCertificatesByCreator,
  searchCertificates,
  verifyCertificateAuthenticity,
} from "@/services/certificateVerificationService";

// ---------------------------------------------------------------------------
// Certificate by ID
// ---------------------------------------------------------------------------

/**
 * Fetches a single certificate by its on-chain identifier.
 *
 * @param id - The on-chain certificate ID to look up.  Pass `null` or
 *   `undefined` to disable the query.
 * @returns React Query result containing {@link CertificateVerificationResult}.
 */
export function useCertificateById(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.certificates.detail(id ?? ""),
    queryFn: () => getCertificateById(id!),
    enabled: Boolean(id),
    staleTime: STALE_TIMES.certificate,
  });
}

// ---------------------------------------------------------------------------
// Certificate by verification code
// ---------------------------------------------------------------------------

/**
 * Fetches a certificate by its human-readable verification code.
 *
 * @param code - The alphanumeric verification code (e.g. `"AB12CD34"`).
 *   Pass `null` or `undefined` to disable the query.
 * @returns React Query result containing {@link CertificateVerificationResult}.
 */
export function useCertificateByCode(code: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.certificates.byCode(code ?? ""),
    queryFn: () => getCertificateByCode(code!),
    enabled: Boolean(code),
    staleTime: STALE_TIMES.certificate,
  });
}

// ---------------------------------------------------------------------------
// Certificates by creator address
// ---------------------------------------------------------------------------

/**
 * Fetches paginated certificates belonging to a Stellar creator address.
 *
 * @param creator - The `G...` Stellar public key of the creator.
 * @param offset  - Pagination offset (number of records to skip).
 * @param limit   - Maximum records to return per page.
 * @returns React Query result containing an array of
 *   {@link CertificateVerificationResult}.
 */
export function useCertificatesByCreator(
  creator: string | null | undefined,
  offset = 0,
  limit = 10
) {
  return useQuery({
    queryKey: queryKeys.certificates.byCreator(creator ?? "", offset, limit),
    queryFn: () => getCertificatesByCreator(creator!, offset, limit),
    enabled: Boolean(creator),
    staleTime: STALE_TIMES.certificate,
  });
}

// ---------------------------------------------------------------------------
// Certificate search
// ---------------------------------------------------------------------------

/**
 * Executes a filtered search across all known certificates.
 *
 * Results are cached per unique filter combination.  Use
 * `queryClient.invalidateQueries({ queryKey: queryKeys.certificates.searches() })`
 * to clear all search results at once.
 *
 * @param filters - Search / filter parameters.
 * @param enabled - Set to `false` to prevent the query from firing
 *   (e.g. while the form is empty).
 * @returns React Query result containing an array of matching certificates.
 */
export function useCertificateSearch(filters: CertificateSearchFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.certificates.search(filters),
    queryFn: () => searchCertificates(filters),
    enabled,
    staleTime: STALE_TIMES.search,
  });
}

// ---------------------------------------------------------------------------
// Certificate authenticity check
// ---------------------------------------------------------------------------

/**
 * Verifies the cryptographic authenticity of a certificate on-chain.
 *
 * This is a heavier call (triggers multi-step verification) so it uses
 * a separate `authenticity` key and a slightly longer stale time.
 *
 * @param id - The on-chain certificate ID.
 * @returns React Query result containing an authenticity boolean and details.
 */
export function useCertificateAuthenticity(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.certificates.authenticity(id ?? ""),
    queryFn: () => verifyCertificateAuthenticity(id!),
    enabled: Boolean(id),
    staleTime: STALE_TIMES.certificate,
  });
}

// ---------------------------------------------------------------------------
// Manual invalidation helpers
// ---------------------------------------------------------------------------

/**
 * Returns helpers for manually invalidating certificate cache entries.
 *
 * Call these after mutations (mint, revoke, transfer) to keep the UI
 * in sync with on-chain state.
 *
 * @example
 * ```ts
 * const { invalidateCertificate, invalidateAllSearches } = useCertificateInvalidation();
 * // After a mint, refresh that cert and all search results
 * await invalidateCertificate("cert-123");
 * await invalidateAllSearches();
 * ```
 */
export function useCertificateInvalidation() {
  const queryClient = useQueryClient();

  return {
    /**
     * Invalidates the cache for a single certificate by its on-chain ID.
     *
     * @param id - The on-chain certificate ID.
     */
    invalidateCertificate: (id: string) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.certificates.detail(id) }),

    /**
     * Invalidates all certificate search result caches.
     */
    invalidateAllSearches: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.certificates.searches() }),

    /**
     * Invalidates the entire certificate cache namespace (all keys under
     * `["certificates"]`).
     */
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: queryKeys.certificates.all }),
  };
}
