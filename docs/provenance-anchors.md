# Provenance Anchors

Multi-anchor provenance lets you attach additional independent references to a certificate — an Arweave archive, an IPFS CID, a Bitcoin Ordinals inscription, or a notarisation receipt — alongside the primary Stellar on-chain record. This document explains what each anchor type provides, when to use one, and how to add anchors via the contract.

> See [ADR-0008](adr/0008-multi-anchor-provenance.md) for the design decisions behind this feature.

---

## What an anchor is and what it is not

A supplemental anchor is a typed, described reference to where the same content or its provenance record exists in another system. It does **not**:

- Replace the primary Stellar certificate — that remains the canonical record.
- Automatically verify the referenced content. The contract stores a reference string; confirming that the referenced resource contains the expected content is an off-chain concern.
- Give the anchor the same trust level as the Stellar certificate. Each anchor's trust model is different — see the table below.

An anchor adds value by making the provenance record independently discoverable and verifiable in systems outside Stellar, and by providing redundancy for long-term preservation.

---

## Anchor types

| Type | Reference format | What it provides | Independently verifiable? |
|------|-----------------|-----------------|--------------------------|
| `Stellar` | Contract ID (`C…`) | The primary on-chain provenance record | Yes — via Stellar CLI or any Stellar node |
| `Arweave` | Transaction ID (43-char base64url) | Permanent, incentivised storage; designed to last 200+ years | Yes — via `https://arweave.net/<txid>` |
| `Ipfs` | CID (`Qm…` or `bafy…`) | Content-addressed retrieval; cryptographically identifies the exact bytes | Yes — via any IPFS gateway, but requires active pinning |
| `BitcoinOrdinal` | Inscription ID (`<txid>i<index>`) | Anchored to Bitcoin's proof-of-work security model | Yes — via `https://ordinals.com/inscription/<id>` |
| `Notarisation` | TSA receipt hash or serial | Legally recognised timestamp; RFC 3161 compliant | Yes — requires the TSA's certificate chain |
| `Other` | Any string | Flexible; use for systems not covered above | Depends on the reference |

---

## When to add a supplemental anchor

### Situations where anchors add meaningful value

**Long-term archival:** If the content must remain accessible for decades independent of IPFS pinning availability or StellarVeriphy infrastructure, attach an `Arweave` anchor. Upload the media to Arweave first, then attach the resulting transaction ID.

**Legal timestamping:** If a legally recognised timestamp is required (intellectual property disputes, regulatory compliance), attach a `Notarisation` anchor. Obtain an RFC 3161 TSA receipt for the content hash, then record the receipt identifier as the reference.

**High-value content:** For content where the highest possible security guarantees are warranted, attach a `BitcoinOrdinal` anchor after inscribing the content or its hash. This binds the provenance record to Bitcoin's proof-of-work security.

**Cross-ecosystem discovery:** If the content is already distributed via IPFS and has a canonical CID, attach an `Ipfs` anchor so the provenance certificate references it directly.

### Situations where anchors do not add value

- The content is low-risk and short-lived — additional anchoring adds gas cost and operational complexity for no meaningful benefit.
- You haven't verified the referenced resource contains the correct content. An anchor pointing to the wrong Arweave TX is misleading, not protective.
- The anchor duplicates the primary `storage_ref` without any additional trust benefit.

---

## Adding an anchor via the Stellar CLI

Only the oracle (the address registered with `initialize`) may attach anchors. This matches the same auth gate as `mint`.

```bash
stellar contract invoke \
  --id <PROVENANCE_CONTRACT_ID> \
  --source oracle-keypair \
  --network testnet \
  -- add_anchor \
  --certificate_id 42 \
  --anchor_type Arweave \
  --reference "LkRmW9j8xK2nPo5QeT3vYiU7mA6cBzH1dF4gNsXpCwE" \
  --description "Permanent Arweave archive of the original media file"
```

The contract emits an `AnchorAdded` event and records the action in the certificate's amendment history.

### Retrieve anchors

```bash
stellar contract invoke \
  --id <PROVENANCE_CONTRACT_ID> \
  --source any-account \
  --network testnet \
  -- get_anchors \
  --certificate_id 42
```

Returns a `Vec<ProvenanceAnchor>` — an empty array if none have been attached.

---

## Frontend display

When a certificate has supplemental anchors, the **Provenance anchors** section appears in the certificate detail card below the cryptographic hashes. Each anchor shows:

- Type icon and label
- "Independently verifiable" badge where applicable
- The oracle-provided description
- The reference identifier (truncated, with a copy button)
- A "View" link to the appropriate explorer
- A "What does this anchor prove?" disclosure that explains the anchor type in plain language

The section is hidden when there are no anchors. It renders using the `ProvenanceAnchors` component (`frontend/components/ProvenanceAnchors.tsx`).

---

## Storage model

Anchors are stored separately from the `ProvenanceCert` struct under a composite key `("ANCHORS", certificate_id)`. This means:

- **Existing certificates are unaffected.** No struct migration is needed. `get_anchors` returns an empty vec for any certificate that predates this feature.
- **Anchors are append-only.** Once recorded, an anchor cannot be removed. If an incorrect anchor was attached, record a note via the dispute workflow and attach a corrected anchor referencing the right resource.
- **The `ProvenanceCert` struct is unchanged.** The primary `storage_ref` field remains as-is.

---

## Cross-chain trust model

Each anchor type has a different trust model and different liveness requirements:

| Type | Trust model | Liveness dependency |
|------|------------|-------------------|
| `Stellar` | Soroban contract immutability + Stellar network consensus | Stellar network |
| `Arweave` | Content-addressing (CID binds to exact bytes) + economic incentives for storage | Arweave network |
| `Ipfs` | Content-addressing only — no economic storage incentive | Active pinning |
| `BitcoinOrdinal` | Bitcoin proof-of-work | Bitcoin network |
| `Notarisation` | TSA PKI certificate chain | TSA's certificate remains valid |
| `Other` | Defined by the anchor's operator | Defined by the referenced system |

**What this means in practice:** an Arweave anchor is more durable than an IPFS anchor (because Arweave has an economic model for permanent storage), but neither provides a legally recognised timestamp the way a Notarisation anchor does. Use the right anchor type for the right purpose, and document why in the `description` field.

---

## Limitations and future work

- **No cross-chain verification in the contract.** The contract stores a reference string; it does not verify that the referenced resource contains the expected content. That verification is off-chain.
- **No `remove_anchor`.** Anchors are permanent. Incorrect anchors must be addressed through the dispute workflow or by attaching a correcting note via a new `Other` anchor with a description explaining the discrepancy.
- **Oracle-only writes.** Anchors can only be attached by the oracle. Self-anchoring by certificate owners is not supported in this version.
- **Explorer links are best-effort.** `anchorExplorerUrl` in `packages/shared/types/anchors.ts` returns known explorer URLs. If an anchor type's canonical explorer changes, update that function.

A future ADR should define a cross-chain verification protocol — confirming on-chain that a referenced Arweave TX contains the expected content hash — once the tooling matures.

---

## Related

| File | Purpose |
|------|---------|
| `docs/adr/0008-multi-anchor-provenance.md` | Design decision and rationale |
| `contracts/provenance/src/lib.rs` | `AnchorType`, `ProvenanceAnchor`, `add_anchor`, `get_anchors` |
| `packages/shared/types/anchors.ts` | TypeScript types, display helpers, explorer URLs |
| `frontend/components/ProvenanceAnchors.tsx` | UI component for displaying anchors |
| `frontend/components/certificates/CertificateResultCard.tsx` | Where `ProvenanceAnchors` is rendered |
| `frontend/services/certificateVerificationService.ts` | `anchors` field on `CertificateVerificationResult` |
