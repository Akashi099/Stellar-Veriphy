/**
 * walletIdentityService.ts
 *
 * Wallet-based identity binding for creators (#652).
 *
 * Securely links a creator's Stellar wallet public key to their provenance
 * records. The binding is cryptographically verifiable: the creator signs a
 * canonical challenge with their Freighter wallet, and the resulting signature
 * is stored alongside their identity record.
 *
 * Security guarantees:
 *  - Duplicate claims for the same key are rejected.
 *  - A wallet can only be bound once per record; re-binding requires explicit
 *    revocation of the previous binding.
 *  - The challenge message includes a nonce and timestamp to prevent replay
 *    attacks.
 *  - Signature verification uses the Stellar SDK's Ed25519 routines.
 */

import type { ApiResponse } from "@stellarveriphy/shared/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IdentityBindingStatus =
  | "unbound"      // No binding exists
  | "pending"      // Challenge issued, awaiting signature
  | "bound"        // Verified and stored
  | "revoked";     // Previously bound, now revoked

export interface IdentityBinding {
  /** The Stellar public key this binding is for. */
  publicKey: string;
  /** Status of the binding. */
  status: IdentityBindingStatus;
  /** ISO 8601 timestamp when the binding was created/last updated. */
  updatedAt: string;
  /** Nonce used in the binding challenge (prevents replay). */
  nonce: string;
  /** The signed challenge message (present when status is 'bound'). */
  signedChallenge?: string;
  /** The Ed25519 signature (hex) of the challenge (present when status is 'bound'). */
  signature?: string;
  /** Auxiliary display name / label the creator provided (optional). */
  displayName?: string;
  /** Optional organisation the creator belongs to. */
  organisation?: string;
}

export interface IdentityBindingChallenge {
  /** The message the wallet must sign. */
  challenge: string;
  /** Nonce embedded in the challenge (for server-side replay prevention). */
  nonce: string;
  /** Expiry as ISO 8601; challenge is void after this time. */
  expiresAt: string;
}

export interface IdentityBindingRequest {
  publicKey: string;
  /** The signed challenge bytes as a base64-encoded string. */
  signedChallenge: string;
  /** Ed25519 signature (hex) produced by the wallet. */
  signature: string;
  /** The original nonce from the challenge. */
  nonce: string;
  /** Optional display name the creator wants to associate. */
  displayName?: string;
  /** Optional organisation. */
  organisation?: string;
}

export interface DuplicateClaimInfo {
  /** Whether the key is already bound to a different record. */
  isDuplicate: boolean;
  /** IDs of existing records that share this public key. */
  conflictingRecordIds: string[];
}

// ---------------------------------------------------------------------------
// Challenge construction
// ---------------------------------------------------------------------------

/**
 * Builds the canonical challenge message a wallet must sign to prove ownership.
 *
 * The message format is intentionally human-readable so users can inspect it
 * in their wallet before signing.
 */
export function buildIdentityChallenge(
  publicKey: string,
  nonce: string,
  issuedAt: string,
): string {
  return [
    "StellarVeriphy Identity Binding",
    `Public key: ${publicKey}`,
    `Nonce: ${nonce}`,
    `Issued at: ${issuedAt}`,
    "By signing this message you confirm that you control this Stellar key",
    "and consent to linking it with your StellarVeriphy creator record.",
  ].join("\n");
}

/**
 * Requests a fresh binding challenge from the server.
 * The nonce is single-use and expires after 10 minutes.
 */
export async function requestIdentityChallenge(
  publicKey: string,
): Promise<ApiResponse<IdentityBindingChallenge>> {
  try {
    const response = await fetch("/api/identity/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        success: false,
        error: (body as { error?: string }).error ?? `HTTP ${response.status}`,
      };
    }

    return { success: true, data: await response.json() as IdentityBindingChallenge };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error requesting challenge",
    };
  }
}

// ---------------------------------------------------------------------------
// Binding submission
// ---------------------------------------------------------------------------

/**
 * Submits a signed identity binding to the backend.
 *
 * The backend:
 *  1. Verifies the nonce has not been replayed.
 *  2. Reconstructs the canonical challenge from the stored nonce.
 *  3. Verifies the Ed25519 signature against the public key.
 *  4. Checks for duplicate claims on the same key.
 *  5. Stores the binding and returns the bound record.
 */
export async function submitIdentityBinding(
  request: IdentityBindingRequest,
): Promise<ApiResponse<IdentityBinding>> {
  try {
    const response = await fetch("/api/identity/bind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        success: false,
        error: (body as { error?: string }).error ?? `HTTP ${response.status}: Binding failed`,
      };
    }

    return { success: true, data: await response.json() as IdentityBinding };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error during binding",
    };
  }
}

// ---------------------------------------------------------------------------
// Lookup & revocation
// ---------------------------------------------------------------------------

/** Fetches the current identity binding for a wallet public key. */
export async function fetchIdentityBinding(
  publicKey: string,
): Promise<ApiResponse<IdentityBinding | null>> {
  try {
    const response = await fetch(
      `/api/identity/binding/${encodeURIComponent(publicKey)}`,
    );

    if (response.status === 404) return { success: true, data: null };
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: Could not fetch binding` };
    }

    return { success: true, data: await response.json() as IdentityBinding };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Revokes an existing identity binding. Requires the connected wallet key. */
export async function revokeIdentityBinding(
  publicKey: string,
): Promise<ApiResponse<void>> {
  try {
    const response = await fetch(
      `/api/identity/binding/${encodeURIComponent(publicKey)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        success: false,
        error: (body as { error?: string }).error ?? `HTTP ${response.status}: Revocation failed`,
      };
    }

    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error during revocation",
    };
  }
}

/** Checks whether a public key has a duplicate binding on any other record. */
export async function checkForDuplicateClaim(
  publicKey: string,
): Promise<ApiResponse<DuplicateClaimInfo>> {
  try {
    const response = await fetch(
      `/api/identity/check-duplicate?key=${encodeURIComponent(publicKey)}`,
    );

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    return { success: true, data: await response.json() as DuplicateClaimInfo };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function isValidStellarPublicKey(key: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(key);
}

/** Returns a short, displayable version of a Stellar public key. */
export function shortPublicKey(key: string): string {
  if (key.length < 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
