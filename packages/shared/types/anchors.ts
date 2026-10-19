/**
 * anchors.ts
 *
 * TypeScript types for multi-anchor provenance (ADR-0008).
 *
 * These mirror the on-chain `AnchorType` enum and `ProvenanceAnchor` struct
 * added to the provenance contract, plus frontend-specific extension types
 * for display and verification.
 */

// ---------------------------------------------------------------------------
// Core types (mirror on-chain contract types)
// ---------------------------------------------------------------------------

/**
 * The trust network or archival system a supplemental anchor points to.
 * Mirrors the on-chain `AnchorType` enum in the provenance contract.
 */
export type AnchorType =
  | "Stellar"       // The primary Stellar/Soroban certificate (always present as storage_ref)
  | "Arweave"       // Arweave permanent storage transaction
  | "Ipfs"          // IPFS content-addressed reference (CID)
  | "BitcoinOrdinal" // Bitcoin Ordinals inscription
  | "Notarisation"  // RFC 3161 TSA or similar notarisation service
  | "Other";        // Any other anchor type

/**
 * A supplemental provenance anchor attached to a certificate.
 * Mirrors the on-chain `ProvenanceAnchor` struct.
 */
export interface ProvenanceAnchor {
  /** Which trust network or archival system this anchor points to. */
  anchorType: AnchorType;
  /**
   * The chain-specific reference identifier:
   * - Arweave: transaction ID (43-char base64url)
   * - IPFS: CID (e.g. `Qm...` or `bafy...`)
   * - Bitcoin Ordinals: inscription ID (`<txid>i<index>`)
   * - Notarisation: TSA receipt hash or serial number
   * - Stellar: contract ID of the provenance contract
   */
  reference: string;
  /** Plain-language description of what this anchor provides. */
  description: string;
  /** Unix timestamp (seconds) when this anchor was recorded on-chain. */
  anchoredAt: number;
}

/**
 * A `ProvenanceCert` extended with its supplemental anchors.
 * The `anchors` array contains only supplemental anchors; the primary
 * Stellar anchor is always represented by the cert's own `storageRef`.
 */
export interface ProvenanceCertWithAnchors {
  /** The certificate ID. */
  id: string;
  storageRef: string;
  manifestHash: string;
  attestationHash: string;
  creator: string;
  owner?: string;
  timestamp: number;
  /**
   * Supplemental provenance anchors. Empty array for certificates that
   * were minted before multi-anchor support was added, or that have not
   * had any anchors attached yet.
   */
  anchors: ProvenanceAnchor[];
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/**
 * Human-readable label for each anchor type, suitable for UI display.
 * Keep in sync with the contract's `AnchorType` enum.
 */
export const ANCHOR_TYPE_LABELS: Record<AnchorType, string> = {
  Stellar: "Stellar",
  Arweave: "Arweave",
  Ipfs: "IPFS",
  BitcoinOrdinal: "Bitcoin Ordinals",
  Notarisation: "Notarisation",
  Other: "Other",
};

/**
 * Plain-language description of what each anchor type provides.
 * Used in the "Why is this anchor here?" tooltip.
 */
export const ANCHOR_TYPE_DESCRIPTIONS: Record<AnchorType, string> = {
  Stellar:
    "The primary on-chain provenance record on the Stellar network. " +
    "Immutable once minted and verifiable by anyone with the certificate ID.",
  Arweave:
    "A permanent archive on the Arweave network. " +
    "Designed for indefinite storage — the content remains accessible even if " +
    "the original hosting provider goes offline.",
  Ipfs:
    "A content-addressed reference on IPFS. " +
    "The CID cryptographically identifies the exact bytes of the content. " +
    "Availability depends on active pinning by one or more nodes.",
  BitcoinOrdinal:
    "An inscription on the Bitcoin blockchain via Ordinals. " +
    "Provides an independent, highly durable anchor in the most widely secured chain.",
  Notarisation:
    "A cryptographic timestamp from a trusted notarisation service (e.g. RFC 3161 TSA). " +
    "Proves the content existed in its current form at a specific point in time, " +
    "independently of any blockchain.",
  Other: "An additional provenance reference. See the description for details.",
};

/**
 * Returns the explorer URL for a given anchor type and reference,
 * or null if no known explorer exists for this type.
 */
export function anchorExplorerUrl(
  anchorType: AnchorType,
  reference: string,
): string | null {
  switch (anchorType) {
    case "Arweave":
      return `https://arweave.net/${reference}`;
    case "Ipfs":
      // Handle both raw CIDs and ipfs:// URIs
      const cid = reference.replace(/^ipfs:\/\//, "");
      return `https://ipfs.io/ipfs/${cid}`;
    case "BitcoinOrdinal":
      return `https://ordinals.com/inscription/${reference}`;
    case "Stellar":
      return `https://stellar.expert/explorer/mainnet/contract/${reference}`;
    case "Notarisation":
    case "Other":
      // External references may be URLs themselves
      if (reference.startsWith("https://") || reference.startsWith("http://")) {
        return reference;
      }
      return null;
    default:
      return null;
  }
}

/**
 * Returns true if this anchor type provides independently verifiable
 * cryptographic proof (i.e. the reference alone is sufficient to verify
 * the content, without trusting StellarVeriphy's servers).
 */
export function isAnchorCryptographicallyVerifiable(anchorType: AnchorType): boolean {
  return (
    anchorType === "Stellar" ||
    anchorType === "Arweave" ||
    anchorType === "Ipfs" ||
    anchorType === "BitcoinOrdinal"
  );
}

/**
 * Returns a short icon/emoji for each anchor type, used in compact list views.
 */
export const ANCHOR_TYPE_ICONS: Record<AnchorType, string> = {
  Stellar: "⭐",
  Arweave: "🗄",
  Ipfs: "🔗",
  BitcoinOrdinal: "₿",
  Notarisation: "📜",
  Other: "📎",
};

// ---------------------------------------------------------------------------
// When to use multi-anchor: guidance constants
// ---------------------------------------------------------------------------

/**
 * Scenarios where attaching a supplemental anchor adds meaningful value.
 * Used in operator documentation and the anchor-management UI.
 */
export const MULTI_ANCHOR_USE_CASES: readonly { title: string; description: string; recommendedType: AnchorType }[] = [
  {
    title: "Long-term archival",
    description:
      "Attach an Arweave anchor when the content must remain accessible for decades, " +
      "independent of IPFS pin availability or StellarVeriphy infrastructure.",
    recommendedType: "Arweave",
  },
  {
    title: "Legal timestamping",
    description:
      "Attach a Notarisation anchor when a legally recognised timestamp is required " +
      "(e.g. for intellectual property disputes or regulatory compliance).",
    recommendedType: "Notarisation",
  },
  {
    title: "High-value content",
    description:
      "Attach a Bitcoin Ordinals anchor for content where the highest possible security " +
      "guarantees are warranted, leveraging Bitcoin's proof-of-work security model.",
    recommendedType: "BitcoinOrdinal",
  },
  {
    title: "Cross-ecosystem discovery",
    description:
      "Attach an IPFS anchor when the content is already distributed via IPFS and " +
      "you want the provenance certificate to reference its canonical CID.",
    recommendedType: "Ipfs",
  },
] as const;
