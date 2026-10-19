import { describe, it, expect } from "vitest";
import type { AttestationEvidence } from "@stellarveriphy/shared";
import { runAttestationPipeline } from "../attestationPipelineService";

const validEvidence: AttestationEvidence = {
  enclave: "AWS Nitro Enclave",
  attestationHash: "a".repeat(64),
  attestationValid: true,
  teeCodeHash: "b".repeat(64),
  teeCodeHashApproved: true,
  contentHashMatches: true,
  creatorSigned: true,
};

describe("runAttestationPipeline", () => {
  it("returns valid when all checks pass", () => {
    const result = runAttestationPipeline(validEvidence);
    expect(result.status).toBe("valid");
    expect(result.riskScore).toBe(0);
    expect(result.checks.signatureValid).toBe(true);
    expect(result.checks.teeHashApproved).toBe(true);
    expect(result.checks.contentHashMatches).toBe(true);
    expect(result.checks.creatorAuthorized).toBe(true);
    expect(result.checks.enclaveIdentified).toBe(true);
    expect(result.checks.noMismatch).toBe(true);
  });

  it("returns integrity_failure when attestation signature is invalid", () => {
    const result = runAttestationPipeline({ ...validEvidence, attestationValid: false });
    expect(result.status).toBe("integrity_failure");
    expect(result.checks.signatureValid).toBe(false);
    expect(result.riskScore).toBeGreaterThan(0);
  });

  it("returns rejected when TEE hash is not approved", () => {
    const result = runAttestationPipeline({ ...validEvidence, teeCodeHashApproved: false });
    expect(result.status).toBe("rejected");
    expect(result.checks.teeHashApproved).toBe(false);
  });

  it("returns integrity_failure when content hash does not match", () => {
    const result = runAttestationPipeline({ ...validEvidence, contentHashMatches: false });
    expect(result.status).toBe("integrity_failure");
    expect(result.checks.contentHashMatches).toBe(false);
  });

  it("returns suspicious when creator did not sign", () => {
    const result = runAttestationPipeline({ ...validEvidence, creatorSigned: false });
    expect(result.status).toBe("suspicious");
    expect(result.checks.creatorAuthorized).toBe(false);
  });

  it("returns mismatch when attestation fields are internally inconsistent", () => {
    // attestationValid is true but attestationHash is empty — a mismatch
    const result = runAttestationPipeline({
      ...validEvidence,
      attestationValid: true,
      attestationHash: "",
    });
    expect(result.status).toBe("mismatch");
    expect(result.checks.noMismatch).toBe(false);
  });

  it("includes evaluatedAt as an ISO 8601 timestamp", () => {
    const result = runAttestationPipeline(validEvidence);
    expect(() => new Date(result.evaluatedAt)).not.toThrow();
    expect(new Date(result.evaluatedAt).toISOString()).toBe(result.evaluatedAt);
  });

  it("always returns a structured result, never throws", () => {
    // Intentionally malformed evidence (cast through unknown to bypass TS)
    const bad = {} as AttestationEvidence;
    expect(() => runAttestationPipeline(bad)).not.toThrow();
  });
});
