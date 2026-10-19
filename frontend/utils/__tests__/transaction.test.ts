/**
 * Unit tests for utils/transaction.ts
 * Covers: fetchTransactionStatus
 */

import { fetchTransactionStatus, pollTransactionStatus } from "../transaction";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(response: Partial<Response> | null, throws = false) {
  const impl = throws
    ? jest.fn().mockRejectedValue(new Error("Network failure"))
    : jest.fn().mockResolvedValue(response as Response);
  jest.spyOn(globalThis, "fetch").mockImplementation(impl);
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// fetchTransactionStatus
// ---------------------------------------------------------------------------

describe("fetchTransactionStatus", () => {
  it("returns CONFIRMED when Horizon responds 200 with successful: true", async () => {
    mockFetch({ ok: true, status: 200, json: async () => ({ successful: true }) });
    expect(await fetchTransactionStatus("abc123")).toBe("CONFIRMED");
  });

  it("returns CONFIRMED when successful field is absent (treated as truthy)", async () => {
    mockFetch({ ok: true, status: 200, json: async () => ({ id: "abc123" }) });
    expect(await fetchTransactionStatus("abc123")).toBe("CONFIRMED");
  });

  it("returns FAILED when Horizon responds 200 with successful: false", async () => {
    mockFetch({ ok: true, status: 200, json: async () => ({ successful: false }) });
    expect(await fetchTransactionStatus("abc123")).toBe("FAILED");
  });

  it("returns PENDING when Horizon responds 404", async () => {
    mockFetch({ ok: false, status: 404, json: async () => ({}) });
    expect(await fetchTransactionStatus("abc123")).toBe("PENDING");
  });

  it("returns PENDING when fetch throws a network error", async () => {
    mockFetch(null, true);
    expect(await fetchTransactionStatus("abc123")).toBe("PENDING");
  });

  it("returns PENDING for other non-OK status codes (500)", async () => {
    mockFetch({ ok: false, status: 500, json: async () => ({}) });
    expect(await fetchTransactionStatus("abc123")).toBe("PENDING");
  });

  it("uses the correct Horizon URL", async () => {
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ successful: true }),
    });
    jest.spyOn(globalThis, "fetch").mockImplementation(spy);

    await fetchTransactionStatus("txhash999");

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("txhash999"));
  });
});

describe("pollTransactionStatus", () => {
  it("polls until a delayed transaction is confirmed", async () => {
    jest.useFakeTimers();
    const onStatus = jest.fn();
    const spy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ successful: true }) } as Response);

    const result = pollTransactionStatus("delayed", { intervalMs: 1000, timeoutMs: 5000, onStatus });
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toBe("CONFIRMED");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenCalledWith("PENDING");
    expect(onStatus).toHaveBeenCalledWith("CONFIRMED");
    jest.useRealTimers();
  });

  it("returns TIMEOUT for a stuck pending transaction", async () => {
    jest.useFakeTimers();
    const onStatus = jest.fn();
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    const result = pollTransactionStatus("stuck", { intervalMs: 1000, timeoutMs: 2500, onStatus });
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(2500);

    await expect(result).resolves.toBe("TIMEOUT");
    expect(onStatus).toHaveBeenLastCalledWith("TIMEOUT");
    jest.useRealTimers();
  });
});
