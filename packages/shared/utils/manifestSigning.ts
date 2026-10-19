/**
 * manifestSigning.ts
 *
 * Cryptographic signing and verification of content manifests.
 *
 * Signing a manifest before submission ensures that tampering is detectable
 * and that the manifest is provably tied to the creator's Stellar key. The
 * signature covers the canonical SHA-256 hash of the manifest JSON so that
 * any field-level change invalidates it.
 *
 * Browser-safe: relies on SubtleCrypto (available in all modern browsers and
 * Node.js ≥ 15). Actual Ed25519 signing delegates to the Freighter wallet so
 * the private key never leaves the secure enclave.
 */

import type { ContentManifest } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignedManifest {
  manifest: ContentManifest;
  /** Hex-encoded SHA-256 digest of the canonical manifest JSON */
  manifestHash: string;
  /** Base64-encoded Ed25519 signature over the manifestHash bytes */
  signature: string;
  /** Stellar public key (G...) of the signer */
  signerPublicKey: string;
  /** ISO 8601 timestamp when the signature was produced */
  signedAt: string;
  /** Schema version for forward-compatibility */
  schemaVersion: "1.0";
}

export interface SignatureVerificationResult {
  valid: boolean;
  /** Reason for invalidity, if any */
  reason?: string;
  /** Whether the manifest hash matches the computed hash */
  hashIntegrity: boolean;
  /** Whether the signer matches the manifest creator field */
  signerIsCreator: boolean;
}

// ---------------------------------------------------------------------------
// Canonical JSON serialization
// ---------------------------------------------------------------------------

/**
 * Produce a deterministic JSON string from a manifest so the hash is stable
 * regardless of property insertion order.
 */
export function canonicalizeManifest(manifest: ContentManifest): string {
  function sortKeys(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map(sortKeys);
    if (obj !== null && typeof obj === "object") {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
        sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
      }
      return sorted;
    }
    return obj;
  }
  return JSON.stringify(sortKeys(manifest));
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Compute the SHA-256 hex digest of a manifest's canonical JSON representation.
 * Works in both browser and Node.js environments.
 */
export async function hashManifest(manifest: ContentManifest): Promise<string> {
  const canonical = canonicalizeManifest(manifest);
  const encoded = new TextEncoder().encode(canonical);

  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Signing  (delegates to Freighter wallet)
// ---------------------------------------------------------------------------

/**
 * Sign a manifest using the Freighter browser wallet.
 *
 * The caller must have Freighter installed and connected. The function
 * computes the manifest hash, requests a signature via Freighter's
 * `signMessage` API, and returns a `SignedManifest`.
 *
 * @throws If Freighter is unavailable or the user rejects the signing request.
 */
export async function signManifestWithFreighter(
  manifest: ContentManifest,
): Promise<SignedManifest> {
  if (typeof window === "undefined") {
    throw new Error("signManifestWithFreighter must be called in a browser context.");
  }

  // Freighter exposes window.freighter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const freighter = (window as any).freighter;
  if (!freighter) {
    throw new Error("Freighter wallet extension is not installed.");
  }

  const manifestHash = await hashManifest(manifest);
  const message = `StellarVeriphy manifest signature\n\nHash: ${manifestHash}\nCreator: ${manifest.creator}\nTimestamp: ${manifest.timestamp}`;

  let signatureResult: { signedMessage: string; signerPublicKey: string };
  try {
    signatureResult = await freighter.signMessage(message, { network: "MAINNET" });
  } catch {
    // Try without network param for older Freighter versions
    try {
      signatureResult = await freighter.signMessage(message);
    } catch (err: unknown) {
      throw new Error(
        `Freighter signing failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    manifest,
    manifestHash,
    signature: signatureResult.signedMessage,
    signerPublicKey: signatureResult.signerPublicKey,
    signedAt: new Date().toISOString(),
    schemaVersion: "1.0",
  };
}

// ---------------------------------------------------------------------------
// Verification  (pure, no wallet dependency)
// ---------------------------------------------------------------------------

/**
 * Verify the integrity of a `SignedManifest`.
 *
 * Checks:
 * 1. The stored `manifestHash` matches the recomputed hash.
 * 2. The `signerPublicKey` matches the `manifest.creator` field.
 *
 * Full cryptographic Ed25519 signature verification requires a Stellar SDK
 * and is performed by the on-chain registry contract. This function catches
 * client-side tampering and identity mismatches before submission.
 */
export async function verifySignedManifest(
  signed: SignedManifest,
): Promise<SignatureVerificationResult> {
  // 1. Recompute hash and compare
  let recomputedHash: string;
  try {
    recomputedHash = await hashManifest(signed.manifest);
  } catch {
    return {
      valid: false,
      reason: "Failed to recompute manifest hash during verification.",
      hashIntegrity: false,
      signerIsCreator: false,
    };
  }

  const hashIntegrity = recomputedHash === signed.manifestHash;
  const signerIsCreator = signed.signerPublicKey === signed.manifest.creator;

  if (!hashIntegrity) {
    return {
      valid: false,
      reason: "Manifest hash mismatch — the manifest may have been tampered with after signing.",
      hashIntegrity,
      signerIsCreator,
    };
  }

  if (!signerIsCreator) {
    return {
      valid: false,
      reason: `Signer (${signed.signerPublicKey}) does not match the manifest creator (${signed.manifest.creator}).`,
      hashIntegrity,
      signerIsCreator,
    };
  }

  if (!signed.signature || signed.signature.length === 0) {
    return {
      valid: false,
      reason: "Signature field is empty.",
      hashIntegrity,
      signerIsCreator,
    };
  }

  return { valid: true, hashIntegrity, signerIsCreator };
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/** Serialize a `SignedManifest` to a JSON string for storage or transmission. */
export function serializeSignedManifest(signed: SignedManifest): string {
  return JSON.stringify(signed, null, 2);
}

/** Deserialize and lightly validate a `SignedManifest` from a JSON string. */
export function deserializeSignedManifest(json: string): SignedManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON for SignedManifest.");
  }

  const p = parsed as Record<string, unknown>;
  if (
    typeof p.manifestHash !== "string" ||
    typeof p.signature !== "string" ||
    typeof p.signerPublicKey !== "string" ||
    typeof p.signedAt !== "string" ||
    typeof p.manifest !== "object" ||
    p.manifest === null
  ) {
    throw new Error("Malformed SignedManifest: required fields are missing or have wrong types.");
  }

  return parsed as SignedManifest;
}
