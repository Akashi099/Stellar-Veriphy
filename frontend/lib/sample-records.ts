import type { VerificationRecord } from "@stellarveriphy/shared/types";

/**
 * Demo records used until the records API (GET /api/verify/...) is available.
 * They cover the range of states the UI must handle: rich metadata, minimal
 * metadata, and a verification that failed.
 */
export const SAMPLE_RECORDS: VerificationRecord[] = [
  {
    id: "1048576",
    title: "Harbour at dawn — field photograph",
    mediaType: "image",
    status: "certified",
    manifest: {
      contentHash: "sha256:9f2c4e1ab7d03e58c6f1a2b94d7e0c3a5b8f61d2e4a7c9b0f3d5e8a1c6b2f4d7",
      creator: "GBZX4TQK7ZJ6QH2VJ3NCW5X4ULFYB7Z6D2MRXK3QW5PEVJ7TL4Y2ANHC",
      timestamp: "2026-09-12T05:42:10Z",
      metadata: {
        device: "Fujifilm X-T5",
        location: "53.3438, -6.2546",
        aiModel: "None",
        lens: "XF 16-55mm f/2.8",
        exposure: "1/250s, f/8, ISO 200",
        editingSoftware: "None (straight out of camera)",
        licence: "CC BY 4.0",
      },
    },
    cert: {
      id: "1048576",
      storageRef: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      manifestHash: "3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b",
      attestationHash: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      creator: "GBZX4TQK7ZJ6QH2VJ3NCW5X4ULFYB7Z6D2MRXK3QW5PEVJ7TL4Y2ANHC",
      timestamp: 1789192995,
    },
    evidence: {
      enclave: "AWS Nitro Enclave",
      attestationHash: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      attestationValid: true,
      teeCodeHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      teeCodeHashApproved: true,
      contentHashMatches: true,
      creatorSigned: true,
    },
    timeline: [
      { type: "manifest_created", timestamp: "2026-09-12T05:42:10Z", actor: "Creator", detail: "Manifest generated on capture." },
      { type: "uploaded", timestamp: "2026-09-12T06:01:33Z", actor: "Creator", detail: "Encrypted media stored on IPFS." },
      { type: "verification_requested", timestamp: "2026-09-12T06:01:41Z", actor: "Oracle contract", txHash: "7c1e0a54d2f3b8e96a4c1d7f0e2b5a8c3d6f9e1b4a7c0d3e6f9b2a5c8d1e4f70" },
      { type: "attestation_generated", timestamp: "2026-09-12T06:02:58Z", actor: "AWS Nitro Enclave", detail: "Content hash recomputed and matched the manifest." },
      { type: "certificate_minted", timestamp: "2026-09-12T06:03:15Z", actor: "Provenance contract", txHash: "d4a8f1c7e2b5096a3f8d1c4e7b0a2d5f8c1e4b7a0d3f6c9e2b5a8d1f4c7e0b3a" },
    ],
  },
  {
    id: "1048811",
    title: "Quarterly report (signed PDF)",
    mediaType: "document",
    status: "certified",
    manifest: {
      contentHash: "sha256:1c8e5b2f7a0d4c9e6b3f8a1d5c2e7b0f4a9d6c3e8b1f5a2d7c0e4b9f6a3d8c1e",
      creator: "GDQP2KM4YLRZ7X5TBNWUH3E6JCV4AQ8FSDG2PKZ7LMXR5TYWN3BCHE6J",
      timestamp: "2026-09-18T14:20:00Z",
    },
    cert: {
      id: "1048811",
      storageRef: "mongodb://records/66f0c1a2b3d4e5f601234567",
      manifestHash: "5d41402abc4b2a76b9719d911017c592ae2f5c8d1e3b7a9c0f4d6e8b2a1c3e5f",
      attestationHash: "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
      creator: "GDQP2KM4YLRZ7X5TBNWUH3E6JCV4AQ8FSDG2PKZ7LMXR5TYWN3BCHE6J",
      timestamp: 1789741260,
    },
    evidence: {
      enclave: "AWS Nitro Enclave",
      attestationHash: "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
      attestationValid: true,
      teeCodeHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      teeCodeHashApproved: true,
      contentHashMatches: true,
      creatorSigned: true,
    },
    timeline: [
      { type: "uploaded", timestamp: "2026-09-18T14:20:00Z", actor: "Creator" },
      { type: "certificate_minted", timestamp: "2026-09-18T14:21:00Z", actor: "Provenance contract" },
    ],
  },
  {
    id: "1049002",
    title: "Street interview clip",
    mediaType: "video",
    status: "failed",
    manifest: {
      contentHash: "sha256:8b1a9953c4611296a827abf8c47804d7e6c49c6b8f1a3d5e7c9b2a4f6d8e0c1a",
      creator: "GCLW7RTX3HNB5QZ2MKVJ4PYE6DU8AFSG3KXT5WNRZ7LQ2YBCM4HEV6PJ",
      timestamp: "2026-09-21T09:05:12Z",
      metadata: { device: "Unknown smartphone" },
    },
    evidence: {
      enclave: "AWS Nitro Enclave",
      attestationHash: "0a4d55a8d778e5022fab701977c5d840bbc486d0f7c3b1e5a9d2c6f8b4e0a7d3",
      attestationValid: true,
      teeCodeHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      teeCodeHashApproved: true,
      contentHashMatches: false,
      creatorSigned: true,
    },
    timeline: [
      { type: "manifest_created", timestamp: "2026-09-21T09:05:12Z", actor: "Creator" },
      { type: "uploaded", timestamp: "2026-09-21T09:30:47Z", actor: "Creator" },
      { type: "verification_requested", timestamp: "2026-09-21T09:30:55Z", actor: "Oracle contract" },
      { type: "attestation_generated", timestamp: "2026-09-21T09:32:10Z", actor: "AWS Nitro Enclave" },
      {
        type: "verification_failed",
        timestamp: "2026-09-21T09:32:11Z",
        actor: "AWS Nitro Enclave",
        detail: "The uploaded file's hash does not match the manifest. The file was changed after the manifest was created.",
      },
    ],
  },
];

/** Record featured on the homepage as an example certificate. */
export const FEATURED_SAMPLE_ID = SAMPLE_RECORDS[0].id;

export function getRecord(id: string): VerificationRecord | undefined {
  return SAMPLE_RECORDS.find((r) => r.id === id);
}

export function getVerifiedRecords(): VerificationRecord[] {
  return SAMPLE_RECORDS.filter((r) => r.status === "certified");
}
