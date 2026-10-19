# Cryptographic Manifest Signing

Labels: `security`, `blockchain`, `data`

## Overview

Adds Ed25519 signatures over registry entries (manifests) to ensure that content metadata is not tampered with before submission. A signed manifest proves the creator authorized the exact content being submitted, and tampering is detectable before the certificate is minted.

## How it works

1. The creator clicks **Sign with Freighter wallet** in the `ManifestSigningPanel`.
2. The panel computes a canonical SHA-256 hash of the manifest JSON (deterministic field ordering via `canonicalizeManifest`).
3. Freighter's `signMessage` API signs a human-readable string that includes the hash, creator, and timestamp. The private key never leaves the wallet.
4. The `SignedManifest` object (manifest + hash + base64 signature + signer public key) is returned to the caller.
5. Before submission, `verifySignedManifest` re-checks:
   - Hash integrity: recomputed hash matches stored hash
   - Signer identity: `signerPublicKey` matches `manifest.creator`
   - Signature presence: non-empty signature field

## On-chain storage

The oracle calls `store_manifest_signature` on the provenance contract after off-chain Ed25519 verification against the registry. The `ManifestSignatureRecord` is stored under `DataKey::ManifestSignature(certificate_id)` in persistent storage.

```
provenance_client.store_manifest_signature(
    &env,
    certificate_id,
    signer,             // Address — must match cert.creator (enforced on-chain)
    signer_public_key,  // String  — G... key for off-chain audit trail
    signature,          // String  — base64 Ed25519, pre-verified by oracle
    signed_at,
)
```

Tampering detection: if `signer_public_key != cert.creator`, the call returns `ProvenanceError::Unauthorized`.

```
provenance_client.get_manifest_signature(&env, certificate_id) -> Option<ManifestSignatureRecord>
```

## Acceptance criteria

- ✅ Manifest entries can be signed or verified cryptographically
- ✅ Tampering is detectable before final acceptance (hash mismatch → explicit error message)
- ✅ Signature validation errors are clear and actionable (per-check status rows in UI)
- ✅ The process supports trust and governance review without confusion (explainer section in UI)

## Files

| File | Purpose |
|---|---|
| `packages/shared/utils/manifestSigning.ts` | Canonicalization, hashing, signing, verification |
| `frontend/components/manifest/ManifestSigningPanel.tsx` | Creator-facing signing UI |
| `contracts/provenance/src/lib.rs` | `store_manifest_signature`, `get_manifest_signature`, `ManifestSignatureRecord` |
| `docs/security/` | Key management context |
