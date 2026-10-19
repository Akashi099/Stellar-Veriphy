/**
 * certificateRegenerationService.test.ts
 *
 * Tests for the certificate regeneration flow (#653).
 */

import {
  BLOCKER_MESSAGES,
  evaluateRegenerationEligibility,
  type RegenerationReason,
} from "@/services/certificateRegenerationService";

const BASE_CERT = {
  id: "42",
  storageRef: "ipfs://bafy123",
  manifestHash: "a".repeat(64),
  attestationHash: "b".repeat(64),
  creator: "GCREATORKEY1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
  owner: "GCREATORKEY1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
  timestamp: 1_700_000_000,
  status: "active",
};

describe("evaluateRegenerationEligibility", () => {
  it("returns eligible=true for valid owner, active cert, no pending regen", () => {
    const result = evaluateRegenerationEligibility(
      BASE_CERT,
      BASE_CERT.creator,
      false,
      false,
      "metadata_updated",
    );
    expect(result.eligible).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("blocks when wallet is not connected", () => {
    const result = evaluateRegenerationEligibility(
      BASE_CERT,
      null,
      false,
      false,
      "metadata_updated",
    );
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContain("wallet_not_connected");
  });

  it("blocks when connected key is not the owner or creator", () => {
    const result = evaluateRegenerationEligibility(
      BASE_CERT,
      "GDIFFERENTKEY123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ12345",
      false,
      false,
      "metadata_updated",
    );
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContain("not_certificate_owner");
  });

  it("blocks when certificate is revoked", () => {
    const result = evaluateRegenerationEligibility(
      { ...BASE_CERT, status: "revoked" },
      BASE_CERT.creator,
      false,
      false,
      "metadata_updated",
    );
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContain("certificate_revoked");
  });

  it("blocks when a regeneration is already pending", () => {
    const result = evaluateRegenerationEligibility(
      BASE_CERT,
      BASE_CERT.creator,
      true,
      false,
      "metadata_updated",
    );
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContain("already_pending");
  });

  it("blocks correction reason without maintainer approval", () => {
    const result = evaluateRegenerationEligibility(
      BASE_CERT,
      BASE_CERT.creator,
      false,
      false,
      "correction",
    );
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContain("insufficient_review_approval");
  });

  it("allows correction with maintainer approval", () => {
    const result = evaluateRegenerationEligibility(
      BASE_CERT,
      BASE_CERT.creator,
      false,
      true,
      "correction",
    );
    expect(result.eligible).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("adds warning for creator_key_rotation", () => {
    const result = evaluateRegenerationEligibility(
      BASE_CERT,
      BASE_CERT.creator,
      false,
      false,
      "creator_key_rotation",
    );
    expect(result.eligible).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("adds warning for attestation_refresh", () => {
    const result = evaluateRegenerationEligibility(
      BASE_CERT,
      BASE_CERT.creator,
      false,
      false,
      "attestation_refresh",
    );
    expect(result.eligible).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("can accumulate multiple blockers", () => {
    const result = evaluateRegenerationEligibility(
      { ...BASE_CERT, status: "revoked" },
      null,
      true,
      false,
      "correction",
    );
    expect(result.blockers).toContain("certificate_revoked");
    expect(result.blockers).toContain("wallet_not_connected");
    expect(result.blockers).toContain("already_pending");
    expect(result.blockers).toContain("insufficient_review_approval");
  });

  it("allows owner (not creator) to regenerate", () => {
    const differentOwner = "GOWNERKEY123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567";
    const result = evaluateRegenerationEligibility(
      { ...BASE_CERT, owner: differentOwner },
      differentOwner,
      false,
      false,
      "metadata_updated",
    );
    expect(result.eligible).toBe(true);
  });
});

describe("BLOCKER_MESSAGES", () => {
  it("has a message for every blocker type", () => {
    const blockers = [
      "certificate_revoked",
      "wallet_not_connected",
      "not_certificate_owner",
      "already_pending",
      "insufficient_review_approval",
    ] as const;

    for (const b of blockers) {
      expect(typeof BLOCKER_MESSAGES[b]).toBe("string");
      expect(BLOCKER_MESSAGES[b].length).toBeGreaterThan(0);
    }
  });
});
