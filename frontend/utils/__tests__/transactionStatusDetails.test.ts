/**
 * Unit tests for describeTransactionStatus (#808).
 * The copy is what users read while a transaction is in flight, so each status is checked for
 * the guidance it must give, not just a label.
 */

import { describeTransactionStatus, type TransactionStatus } from "../transaction";

describe("describeTransactionStatus", () => {
  it.each<[TransactionStatus, string, boolean]>([
    ["PENDING", "Pending", false],
    ["CONFIRMED", "Confirmed", true],
    ["FAILED", "Failed", true],
    ["TIMEOUT", "Still pending", false],
  ])("gives a label and finality flag for %s", (status, label, isFinal) => {
    const details = describeTransactionStatus(status);
    expect(details.label).toBe(label);
    expect(details.isFinal).toBe(isFinal);
    expect(details.description.length).toBeGreaterThan(0);
    expect(details.nextStep.length).toBeGreaterThan(0);
  });

  it("maps each status to the expected tone", () => {
    expect(describeTransactionStatus("PENDING").tone).toBe("info");
    expect(describeTransactionStatus("CONFIRMED").tone).toBe("success");
    expect(describeTransactionStatus("FAILED").tone).toBe("error");
    expect(describeTransactionStatus("TIMEOUT").tone).toBe("warning");
  });

  it("warns against resubmitting when the status times out", () => {
    const { nextStep } = describeTransactionStatus("TIMEOUT");
    expect(nextStep).toMatch(/do not submit the transaction again/i);
  });

  it("tells the user the status keeps updating while pending", () => {
    expect(describeTransactionStatus("PENDING").nextStep).toMatch(/updates automatically/i);
  });
});
