# StellarVeriphy User Guide

> **Where the product is today:** StellarVeriphy is an active scaffold. The smart contracts are deployed and fully functional on testnet. The frontend has a home page, an upload page (static placeholder), a certificate lookup page, and a file verification page. The upload flow and wallet integration are still being built. See [Getting started](#getting-started) for what you can do right now.

## Table of contents

- [Getting started](#getting-started)
- [Submitting content (creators)](#submitting-content-creators)
- [Tracking verification](#tracking-verification)
- [Checking a file against its provenance record](#checking-a-file-against-its-provenance-record)
- [Verification confidence score](#verification-confidence-score)
- [Viewing a certificate](#viewing-a-certificate)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Getting started

```bash
pnpm install
pnpm dev:frontend
# → http://localhost:3000
```

What works today:
- **`/certificate`** — look up any certificate by ID, verification code, or creator address. Shows the result card with its confidence score and history.
- **`/verify`** — hash-comparison tool and guided verification wizard.
- **`/api/health`** — confirms the API layer is running (`{"status":"ok"}`).

The upload flow (`/creator/upload-content`) is a placeholder — no file picker or submission is wired up yet.

---

## Submitting content (creators)

1. Open **Upload** and choose your media file. Your browser computes the file's SHA-256 fingerprint locally — the file itself is not sent anywhere at this step.
2. Enter your Stellar **public** key (starts with `G`). Never enter your secret key (`S…`); the form rejects it.
3. Set when the content was created. Optionally add the device, location and, if AI was involved, the AI model used.
4. Select **Submit for verification**. If anything is missing or invalid, the form lists each problem and highlights the field.

**What gets stored on-chain:** only the content's SHA-256 hash, the manifest hash, the attestation hash, your creator address, and a timestamp. The media file itself lives in the configured storage backend (IPFS or a database) — never directly on Stellar.

---

## Tracking verification

After submitting, your content enters a verification queue. **My jobs** shows every submission made from this browser:

| Status | What it means | What to expect |
|--------|---------------|----------------|
| **Queued** | Waiting for a verifier | Your position in the queue and an estimated wait |
| **Running** | Being verified inside a secure enclave | Usually short; the page updates automatically |
| **Complete** | Verified and certificate minted | The provenance record is on-chain and permanently readable |
| **Failed** | Could not be verified | The reason is shown; fix it and resubmit |

Your job list is stored in this browser only — a different device or a cleared browser won't show it.

---

## Checking a file against its provenance record

Open **Verify a file**:

1. Choose the file. It is fingerprinted in your browser and never uploaded.
2. Paste the recorded hash from the certificate, or select **Search StellarVeriphy records for this file**.

### Reading the result

- **Match** — the file is byte-for-byte identical to the one that was recorded.
- **No match** — the file differs from the recorded version. Common causes:
  - Re-saved, compressed, or resized (social networks and messaging apps do this automatically)
  - Camera or location metadata was added or stripped
  - A different version or export of the same content
  - The hash came from a different certificate

  Ask the creator for the original file and treat the copy as unverified until the fingerprints match.
- **Can't be compared** — the pasted hash is not a valid SHA-256 value (wrong length, unsupported algorithm). Differences in capitalisation or a `0x` prefix are handled automatically.

### For technical users

The fingerprint is SHA-256 over the raw file bytes. You can reproduce it with standard tools:

```sh
sha256sum photo.jpg        # Linux
shasum -a 256 photo.jpg    # macOS
certutil -hashfile photo.jpg SHA256   # Windows
```

---

## Verification confidence score

Every verified item in StellarVeriphy shows a **confidence score from 0 to 100**. It tells you how much verified evidence backs the content. It does not say whether the content shows something true — a score of 100 means the file is exactly what the creator registered, verified by an approved enclave.

### Where to find it

On a certificate or verification result page, the score appears in the **Verification confidence** panel. Click or tap **Why this score?** to expand the per-factor breakdown. Each factor shows the points it contributed in plain language. The **?** icon gives a condensed summary. Both are keyboard-accessible.

### How the score is calculated

The score is the sum of the points for each check that passes:

| Check | Points | What it means |
|---|---|---|
| Secure check completed | 35 | An AWS Nitro Enclave checked the file and signed an attestation proving the check ran correctly inside a hardware-isolated environment. |
| Approved verifier | 25 | The SHA-256 hash of the enclave software that ran the check is on the on-chain registry contract's approved list. |
| File unchanged | 20 | The stored file's fingerprint matches the `contentHash` in the creator's manifest. |
| Creator signed | 10 | The creator authorised the submission with their Stellar account. |
| Origin details provided | 10 | Partial credit for each of the three standard metadata fields provided: `device`, `location`, `aiModel`. Each is worth ~3 points. Custom metadata fields are shown but not scored. |

Checks that have not run yet earn 0 points, so content that is still pending or processing shows a low score until verification completes.

### Score levels

| Level | Range | Meaning |
|---|---|---|
| **High** | 85–100 | All key checks passed. Only reachable when secure check, approved verifier, and file-unchanged all pass. |
| **Medium** | 50–84 | Most checks passed but at least one failed or evidence is missing. Open **Why this score?** to see which. |
| **Low** | 0–49 | Important checks failed or have not run yet. |

**Examples:**
- Every check passed, but the creator provided no device, location, or AI-model details → score 90 (High).
- The file was altered after the manifest was created → loses the 20 "File unchanged" points → maximum 80 (Medium). Verification also fails so no certificate is issued.
- Verification is still running → all attestation checks are 0 → score 10 or less (Low) until complete.

### Maintaining the model

> The scoring model is the single source of truth in `packages/shared/scoring/confidence.ts`. The UI panel and this page are generated from that file. When weights or levels change, update all three together. New signal types require adding a new entry to `CONFIDENCE_FACTORS`, extending `AttestationEvidence` in `packages/shared/types/index.ts`, and updating `computeConfidence` in `confidence.ts`.

---

## Viewing a certificate

Open any item from **Explore** or navigate to `/certificate?id=<ID>`:

- **Verification confidence** — the score panel with its expandable per-factor breakdown (click **Why this score?**).
- **History** — every step from manifest creation to certificate minting, with Stellar transaction hashes for on-chain events.
- **Provenance** — creator address, creation time, and any origin details they supplied. Fields left blank are shown as "Not provided".
- **Certificate** — the on-chain certificate ID, storage reference, and the hashes you can use to verify the record independently.
- **Actions** — view on StellarExpert, generate a shareable verification code, verify authenticity.

### Verifying a certificate yourself (CLI)

You don't need the frontend to read a certificate. With the Stellar CLI:

```bash
stellar contract invoke \
  --id <PROVENANCE_CONTRACT_ID> \
  --source <any-account> \
  --network testnet \
  -- get_certificate --id <certificate-id>
```

This returns the full `ProvenanceCert` struct directly from the contract. See [docs/deployment.md](deployment.md) for deployed contract IDs.

---

## Troubleshooting

**The upload page doesn't do anything when I try to use it.**
Expected — the file input and submission handler are not yet wired up. See [Getting started](#getting-started).

**`pnpm dev:frontend` starts but `/api/health` 404s.**
Confirm you're hitting `http://localhost:3000/api/health` (not `/health`). If still 404, check the terminal — the server may not have finished starting.

**The confidence score shows Low even though the certificate is active.**
The score reflects oracle evidence, not just certificate existence. If the oracle has not yet run or the evidence was not stored with this certificate, all attestation checks score 0. This is expected for certificates minted before evidence tracking was added.

**My Freighter wallet isn't connecting.**
Wallet connection isn't wired into the frontend yet. All contract interaction currently goes through the Stellar CLI. See [docs/deployment.md](deployment.md).

---

## FAQ

**What does a confidence score of 100 actually mean?**
It means all five checks passed: the file was verified inside an approved enclave, the enclave code hash is on the registry, the file hasn't changed since the manifest was created, the creator signed the request, and all three metadata fields were provided. It does not mean the content is factually true or legally valid.

**Can I delete or edit a certificate once it's minted?**
No. Certificates are permanent on-chain records. You can revoke or lock a certificate, but revocation is itself a permanent, auditable action — it does not erase history.

**Why does the score drop when I provide fewer metadata fields?**
The "Origin details" factor awards partial credit — roughly 3 points per field (`device`, `location`, `aiModel`). Providing all three earns the full 10 points; providing none earns 0. This reflects that more context about a file's origin increases confidence in its provenance.

**Can new signal types be added to the score?**
Yes. Add a new entry to `CONFIDENCE_FACTORS` in `packages/shared/scoring/confidence.ts`, extend `AttestationEvidence` in `packages/shared/types/index.ts` with the new boolean flag, and update `computeConfidence` to map it to a ratio. The UI renders automatically from `CONFIDENCE_FACTORS`. Update this page and the in-app tooltip at the same time.

**Where do storage costs come from — is my file stored on Stellar?**
No. Only hashes and a storage reference are on-chain. The media itself lives in the configured storage backend (IPFS or MongoDB — see [ADR-0005](adr/0005-pluggable-storage-layer.md)).

**I found a bug or have a feature request.**
Open a [GitHub issue](https://github.com/Stellar-Veriphy/Stellar-Veriphy/issues).
