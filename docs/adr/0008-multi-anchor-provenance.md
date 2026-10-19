# ADR-0008: Multi-anchor provenance

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Core maintainers

## Context

StellarVeriphy's `ProvenanceCert` currently holds a single `storage_ref` (an IPFS CID or Arweave URI) pointing to where the original media file is stored. All on-chain trust flows through a single Stellar-anchored record. As the platform grows, users and integrators have asked whether the same provenance record can be tied to additional trust networks or archival systems — for example:

- An Arweave permanent archive reference alongside the primary IPFS storage
- A BTCO (Bitcoin Ordinals) inscription that independently preserves the media
- An external notarisation service (e.g. a legal timestamping authority) referenced alongside the TEE attestation
- A future cross-chain bridge that mirrors selected certificates to a public EVM chain

The core tension: adding anchors increases trust surface, but each anchor brings its own trust model, liveness assumptions, and complexity. Treating them all as equivalent would be misleading. Treating them as opaque strings (as the current `storage_ref` does) prevents the UI from communicating their meaning.

### Options considered

**Option A: Replace `storage_ref` with `Vec<String>` (multiple raw URIs)**  
Simple. Breaks existing deserialisation (removing a field's single-value semantics is a struct change). No type information per anchor. UI cannot distinguish an IPFS CID from an Arweave URI from a notarisation receipt without guessing.

**Option B: Keep `storage_ref`, add a parallel `Vec<ProvenanceAnchor>` field**  
`storage_ref` remains the primary single-chain anchor for backward compatibility. New anchors are supplemental, opt-in, and typed. Existing certificates deserialise correctly (`anchors` defaults to empty). Each anchor carries its own `chain`, `reference`, and `verified_at` metadata. This is the approach chosen.

**Option C: New contract only — separate multi-anchor contract**  
Avoids touching the existing provenance contract. Requires consumers to query two contracts. Adds deployment and operational complexity without meaningful benefit. Deferred unless the provenance contract reaches a size or complexity limit.

**Option D: Off-chain anchor registry**  
Anchors stored in a database, not on-chain. Loses the immutability guarantee that makes provenance records trustworthy. Rejected.

## Decision

**Option B.** Extend `ProvenanceCert` with a new `anchors: Vec<ProvenanceAnchor>` field (stored separately under `DataKey::Anchors(u64)` to avoid breaking existing persistent storage entries). Add `add_anchor` and `get_anchors` functions to the provenance contract. The original `storage_ref` field is preserved as-is and remains the canonical primary anchor.

Key design choices:

- **Typed anchors.** Each `ProvenanceAnchor` has an `anchor_type` field (`Stellar`, `Arweave`, `IPFS`, `BitcoinOrdinal`, `Notarisation`, `Other`) so the UI can render each anchor with appropriate context rather than guessing from a URI prefix.
- **Stored separately.** Anchors live under `DataKey::Anchors(certificate_id)` rather than inside the `ProvenanceCert` struct. This keeps the core cert struct stable — adding anchors to existing certificates does not require deserialising and re-serialising the cert.
- **Oracle-gated writes.** `add_anchor` requires oracle auth, the same as `mint`. This prevents arbitrary callers from attaching anchors to certificates they don't control.
- **Explainable in UI.** Each anchor includes a `description` field (free text, set at anchor time) so the UI can surface "Why is this anchor here?" without requiring the user to understand what an Arweave TX ID looks like.
- **Backward compatible.** Existing certificates return an empty `Vec<ProvenanceAnchor>` from `get_anchors`. No migration needed.

## Consequences

**Easier:**
- A certificate can be tied to multiple independent archival or trust sources, each with its own type and description.
- The UI can render a clear "Anchors" section that explains what each anchor is and what it proves, without ambiguity.
- New anchor types can be added by extending the `AnchorType` enum — no struct changes required.
- Existing certificates are unaffected — `get_anchors` returns an empty vec for any cert that has none.

**Harder:**
- Operators must decide which anchors to attach and when — the contract enforces auth but not anchor quality.
- Cross-chain anchor verification (confirming an Arweave TX actually contains the expected content) is an off-chain concern; the contract stores a reference, not a proof.
- Adding anchors is additive-only. There is no `remove_anchor` — once an anchor is recorded, it is permanent. This is intentional (immutable audit trail) but means incorrect anchors cannot be silently removed; a note must be recorded via the dispute workflow instead.

**Follow-up work:**
- The frontend certificate detail page should display anchors in the **Certificate** section with per-type icons and an explanation of what each anchor proves.
- The oracle worker should be extended to optionally attach Arweave or IPFS secondary anchors after minting.
- A future ADR should define a verification protocol for cross-chain anchors (confirming the referenced TX contains the expected content hash).

## Implementation

- `contracts/provenance/src/lib.rs` — `ProvenanceAnchor` struct, `AnchorType` enum, `DataKey::Anchors`, `add_anchor`, `get_anchors`
- `packages/shared/types/index.ts` — `ProvenanceAnchor`, `AnchorType`, `ProvenanceCertWithAnchors`
- `packages/shared/utils/anchors.ts` — helpers: `anchorTypeLabel`, `anchorExplorerUrl`, `isAnchorVerified`
- `frontend/components/ProvenanceAnchors.tsx` — UI component rendering anchors with type icons
- `docs/provenance-anchors.md` — operator guide: when to anchor, supported types, limitations

## Related

- ADR-0002 — why Soroban/Stellar is the primary chain
- ADR-0005 — pluggable storage layer (IPFS/Arweave already in use as storage backends)
- `contracts/provenance/src/lib.rs` — full provenance contract
- `docs/provenance-anchors.md` — operator guide
