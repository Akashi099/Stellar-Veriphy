import { describe, expect, it } from "vitest";

import {
  assertContract,
  checkContract,
  checkEnvelope,
  UploadRecordContract,
  VerificationJobViewContract,
} from "../contracts/api";

const upload = {
  id: "u1",
  createdAt: "2026-01-01T00:00:00.000Z",
  manifestHash: "a".repeat(64),
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  fileSize: 10,
  contentHash: "b".repeat(64),
  creator: "GCREATOR",
  tags: [],
  manifest: { contentHash: "b".repeat(64), creator: "GCREATOR", timestamp: "2026-01-01T00:00:00.000Z" },
};

const job = {
  id: "j1",
  uploadId: "u1",
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
  queuePosition: 1,
  estimatedWaitMs: null,
  averageDurationMs: null,
};

describe("API contracts", () => {
  it("accepts conforming payloads", () => {
    expect(checkContract(UploadRecordContract, upload)).toEqual([]);
    expect(checkContract(VerificationJobViewContract, job)).toEqual([]);
    expect(checkEnvelope(UploadRecordContract, { data: [upload] }, { list: true })).toEqual([]);
  });

  it("reports missing and mistyped fields", () => {
    const { fileSize: _omit, ...missing } = upload;
    expect(checkContract(UploadRecordContract, missing)).toContain("UploadRecord.fileSize: expected number, got undefined");
    expect(checkContract(UploadRecordContract, { ...upload, tags: "x" })).toHaveLength(1);
  });

  it("rejects unknown enum values and bad envelopes", () => {
    expect(checkContract(VerificationJobViewContract, { ...job, status: "done" })).toHaveLength(1);
    expect(checkEnvelope(UploadRecordContract, [upload])).toEqual(["envelope: missing `data`"]);
    expect(() => assertContract(VerificationJobViewContract, {})).toThrow(/contract violation/);
  });
});
