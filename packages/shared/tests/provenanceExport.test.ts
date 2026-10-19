import { describe, expect, it } from "vitest";
import {
  PROVENANCE_EXPORT_DEFAULT_LIMIT,
  PROVENANCE_EXPORT_LIMIT_OPTIONS,
  PROVENANCE_EXPORT_MAX_RECORDS,
  validateExportLimit,
} from "../utils/provenanceExport";

describe("validateExportLimit", () => {
  it("allows an export at or below the limit", () => {
    expect(validateExportLimit(0, PROVENANCE_EXPORT_DEFAULT_LIMIT)).toBeNull();
    expect(validateExportLimit(PROVENANCE_EXPORT_DEFAULT_LIMIT, PROVENANCE_EXPORT_DEFAULT_LIMIT)).toBeNull();
  });

  it("refuses an export above the limit with a message that names both counts", () => {
    const message = validateExportLimit(1_500, 1_000);
    expect(message).toContain("1,500 records");
    expect(message).toContain("1,000 record limit");
  });

  it("refuses limits outside the hard ceiling or not whole numbers", () => {
    expect(validateExportLimit(1, 0)).toMatch(/whole number/);
    expect(validateExportLimit(1, 1.5)).toMatch(/whole number/);
    expect(validateExportLimit(1, PROVENANCE_EXPORT_MAX_RECORDS + 1)).toMatch(/50,000/);
    expect(validateExportLimit(1, Number.NaN)).toMatch(/whole number/);
  });

  it("keeps every offered limit within the hard ceiling and the default among them", () => {
    for (const option of PROVENANCE_EXPORT_LIMIT_OPTIONS) {
      expect(option).toBeLessThanOrEqual(PROVENANCE_EXPORT_MAX_RECORDS);
      expect(validateExportLimit(0, option)).toBeNull();
    }
    expect(PROVENANCE_EXPORT_LIMIT_OPTIONS).toContain(PROVENANCE_EXPORT_DEFAULT_LIMIT);
  });
});
