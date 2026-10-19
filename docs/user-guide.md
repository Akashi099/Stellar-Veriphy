# StellarVeriphy User Guide

> **Current behavior:** The repository includes upload/metadata forms, local job processing, certificate lookup, file comparison, and wallet adapters. Availability depends on your deployment and configuration. Local jobs validate metadata and manifest hashes; they do not automatically mint on-chain certificates. See [ADR-0020](adr/0020-verification-pipeline.md) for that boundary.

## Table of contents

- [Getting started](#getting-started)
- [Practical workflow examples](#practical-workflow-examples)
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

The upload route (`/creator/upload-content`) contains upload workflow components. The separate `/verify` wizard currently has a simulated submission handler; use its comparison view for file integrity checks, and do not treat wizard completion as chain confirmation.

## Practical workflow examples

### Creator: register an original photograph

**Prepare:** keep the original `harbour-original.jpg`, your Stellar public address (`G…`), and the capture time. Never enter a secret key.

1. Open `/creator/upload-content` and select the upload mode/file controls available in your deployment. Choose the original image; allow hashing to finish.
2. Enter the creator public key and capture time. Add a descriptive title and optional device, location, or AI-model details where offered. Review the metadata preview and correct highlighted fields.
3. Submit once and retain the returned job ID. If the connection drops, use the resumable upload prompt when offered and reselect the same original file.
4. Follow the job status. Local completion confirms the worker's metadata/manifest checks; it does not provide a blockchain transaction or certificate. Share a certificate only after independently confirming issuance in the configured network.

**Expected outcome:** a tracked submission and its status, or actionable field/upload errors. If your deployment exposes only mode selection, continue through the available workflow; do not assume the separate `/verify` wizard submits a real job.

### Verifier: compare a received copy with the original record

**Prepare:** obtain the file and recorded content SHA-256 hash from its provenance record.

1. Open `/verify` and select its file-comparison view.
2. Choose the received file and paste the recorded content hash, or use the record search control. The comparison hashes the file locally.
3. Read **Match**, **No match**, or the invalid-hash message. A resized messaging-app copy can fail even if it looks identical; request the original bytes and compare again.

**Expected outcome:** a match establishes byte equality with the recorded fingerprint. It does not establish factual truth, ownership, or that an on-chain certificate was issued.

### Reviewer: inspect a shared certificate

1. Open `/certificate` and search by the supplied certificate ID or verification code.
2. Compare creator identity, storage reference, hashes, history, and confidence evidence with what the sender claims.
3. If a chain transaction is provided, check it on the configured network using the explorer action or the CLI example below. Do not interpret a missing result as proof of fraud: first confirm the ID and network.

**Expected outcome:** a readable record and its evidence, or a lookup error to investigate. A confidence score supports provenance review; it does not prove the content's claims are true.

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
| **Complete** | Local metadata and manifest validation finished | On-chain issuance requires separate integration and confirmation |
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
Check which workflow your deployment exposes, correct highlighted fields, and wait for hashing. The separate `/verify` wizard uses simulated submission; its completion is not a real upload or chain receipt. See [practical examples](#practical-workflow-examples).

**`pnpm dev:frontend` starts but `/api/health` 404s.**
Confirm you're hitting `http://localhost:3000/api/health` (not `/health`). If still 404, check the terminal — the server may not have finished starting.

**The confidence score shows Low even though the certificate is active.**
The score reflects oracle evidence, not just certificate existence. If the oracle has not yet run or the evidence was not stored with this certificate, all attestation checks score 0. This is expected for certificates minted before evidence tracking was added.

**My Freighter wallet isn't connecting.**
Confirm the extension is available, the wallet and app use the same network, and mock wallet mode is disabled for real transactions. Check contract IDs and initialization using [docs/deployment.md](deployment.md).

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
