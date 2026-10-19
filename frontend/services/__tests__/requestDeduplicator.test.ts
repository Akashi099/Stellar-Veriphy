/**
 * Unit tests for services/requestDeduplicator.ts
 *
 * Tests concurrent request deduplication, in-flight promise sharing,
 * cache expiration, and error handling.
 */

import {
  createDedupFunction,
  globalDeduplicator,
  RequestDeduplicator,
} from "../requestDeduplicator";

describe("RequestDeduplicator", () => {
  let deduplicator: RequestDeduplicator<string>;

  beforeEach(() => {
    deduplicator = new RequestDeduplicator({ maxPendingTime: 100 });
    jest.clearAllTimers();
  });

  // ---------------------------------------------------------------------------
  // Basic Deduplication
  // ---------------------------------------------------------------------------

  describe("basic deduplication", () => {
    it("makes a request when none is pending", async () => {
      const fetchFn = jest.fn().mockResolvedValue("data");

      const result = await deduplicator.deduplicate("key-1", fetchFn);

      expect(result).toBe("data");
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("shares promise for concurrent requests with same key", async () => {
      const fetchFn = jest.fn();

      // Simulate a slow request
      fetchFn.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("shared-data"), 50))
      );

      // Start two requests simultaneously
      const promise1 = deduplicator.deduplicate("key-1", fetchFn);
      const promise2 = deduplicator.deduplicate("key-1", fetchFn);

      expect(promise1).toBe(promise2);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      const result = await promise1;
      expect(result).toBe("shared-data");
    });

    it("does not deduplicate requests with different keys", async () => {
      const fetchFn = jest.fn().mockResolvedValue("data");

      await deduplicator.deduplicate("key-1", fetchFn);
      await deduplicator.deduplicate("key-2", fetchFn);

      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Pending Time Expiration
  // ---------------------------------------------------------------------------

  describe("pending time expiration", () => {
    it("makes a new request after pending time expires", async () => {
      const fetchFn = jest.fn().mockResolvedValueOnce("data-1").mockResolvedValueOnce("data-2");

      // First request
      const result1 = await deduplicator.deduplicate("key-1", fetchFn);
      expect(result1).toBe("data-1");
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Wait for pending time to expire
      jest.advanceTimersByTime(150);
      await Promise.resolve(); // Let cleanup complete

      // Second request should make a new call
      const result2 = await deduplicator.deduplicate("key-1", fetchFn);
      expect(result2).toBe("data-2");
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("respects custom maxPendingTime", async () => {
      const quickDedup = new RequestDeduplicator({ maxPendingTime: 10 });
      const fetchFn = jest.fn().mockResolvedValue("data");

      await quickDedup.deduplicate("key-1", fetchFn);
      jest.advanceTimersByTime(5);
      await Promise.resolve();

      // Still within 10ms window, should deduplicate
      const result = await quickDedup.deduplicate("key-1", fetchFn);
      expect(result).toBe("data");
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Advance past the window
      jest.advanceTimersByTime(10);
      await Promise.resolve();

      // Should make a new request
      const result2 = await quickDedup.deduplicate("key-1", fetchFn);
      expect(result2).toBe("data");
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  describe("error handling", () => {
    it("shares rejected promise among concurrent requests", async () => {
      const error = new Error("network error");
      const fetchFn = jest.fn().mockRejectedValue(error);

      const promise1 = deduplicator.deduplicate("key-1", fetchFn);
      const promise2 = deduplicator.deduplicate("key-1", fetchFn);

      expect(promise1).toBe(promise2);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      await expect(promise1).rejects.toThrow("network error");
      await expect(promise2).rejects.toThrow("network error");
    });

    it("clears pending request after error", async () => {
      const fetchFn = jest.fn().mockRejectedValue(new Error("failed"));

      await expect(deduplicator.deduplicate("key-1", fetchFn)).rejects.toThrow();

      // Wait for cleanup
      jest.runAllTimers();
      await Promise.resolve();

      // Next request should make a new call
      fetchFn.mockResolvedValueOnce("success");
      const result = await deduplicator.deduplicate("key-1", fetchFn);
      expect(result).toBe("success");
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("clears pending request after success", async () => {
      const fetchFn = jest.fn().mockResolvedValueOnce("data");

      await deduplicator.deduplicate("key-1", fetchFn);

      // Wait for cleanup
      jest.runAllTimers();
      await Promise.resolve();

      expect(deduplicator.getPendingCount()).toBe(0);

      // Next request should make a new call
      fetchFn.mockResolvedValueOnce("data2");
      await deduplicator.deduplicate("key-1", fetchFn);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Management Operations
  // ---------------------------------------------------------------------------

  describe("management operations", () => {
    it("reports pending request count", async () => {
      const fetchFn = jest.fn(
        () => new Promise((resolve) => setTimeout(() => resolve("data"), 100))
      );

      expect(deduplicator.getPendingCount()).toBe(0);

      deduplicator.deduplicate("key-1", fetchFn);
      expect(deduplicator.getPendingCount()).toBe(1);

      deduplicator.deduplicate("key-2", fetchFn);
      expect(deduplicator.getPendingCount()).toBe(2);

      deduplicator.deduplicate("key-1", fetchFn); // Same key, still 2
      expect(deduplicator.getPendingCount()).toBe(2);

      // Wait for both to complete
      jest.advanceTimersByTime(150);
      await Promise.resolve();
      expect(deduplicator.getPendingCount()).toBe(0);
    });

    it("returns pending keys", async () => {
      const fetchFn = jest.fn(
        () => new Promise((resolve) => setTimeout(() => resolve("data"), 100))
      );

      deduplicator.deduplicate("cert-123", fetchFn);
      deduplicator.deduplicate("user-456", fetchFn);

      const keys = deduplicator.getPendingKeys();
      expect(keys).toContain("cert-123");
      expect(keys).toContain("user-456");
      expect(keys).toHaveLength(2);
    });

    it("clear() removes all pending requests", async () => {
      const fetchFn = jest.fn(
        () => new Promise((resolve) => setTimeout(() => resolve("data"), 100))
      );

      deduplicator.deduplicate("key-1", fetchFn);
      deduplicator.deduplicate("key-2", fetchFn);

      expect(deduplicator.getPendingCount()).toBe(2);
      deduplicator.clear();
      expect(deduplicator.getPendingCount()).toBe(0);
    });

    it("clearKey() removes specific pending request", async () => {
      const fetchFn = jest.fn(
        () => new Promise((resolve) => setTimeout(() => resolve("data"), 100))
      );

      deduplicator.deduplicate("key-1", fetchFn);
      deduplicator.deduplicate("key-2", fetchFn);

      deduplicator.clearKey("key-1");
      expect(deduplicator.getPendingCount()).toBe(1);
      expect(deduplicator.getPendingKeys()).toEqual(["key-2"]);
    });

    it("clearKey() does nothing for non-existent keys", async () => {
      deduplicator.clearKey("non-existent");
      expect(deduplicator.getPendingCount()).toBe(0);
    });

    it("setMaxPendingTime() changes expiration window", async () => {
      deduplicator.setMaxPendingTime(1000);

      const fetchFn = jest.fn().mockResolvedValue("data");

      await deduplicator.deduplicate("key-1", fetchFn);
      jest.advanceTimersByTime(150);
      await Promise.resolve();

      // Should still deduplicate with 1000ms window
      const result = await deduplicator.deduplicate("key-1", fetchFn);
      expect(result).toBe("data");
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("setLogging() enables/disables debug output", async () => {
      // Just test that it doesn't throw
      deduplicator.setLogging(true);
      deduplicator.setLogging(false);

      const fetchFn = jest.fn().mockResolvedValue("data");
      await deduplicator.deduplicate("key-1", fetchFn);
    });
  });

  // ---------------------------------------------------------------------------
  // Real-World Scenarios
  // ---------------------------------------------------------------------------

  describe("real-world scenarios", () => {
    it("handles many concurrent requests for same key", async () => {
      const fetchFn = jest.fn(
        () => new Promise((resolve) => setTimeout(() => resolve("shared"), 50))
      );

      const promises = Array.from({ length: 10 }, () =>
        deduplicator.deduplicate("same-key", fetchFn)
      );

      expect(fetchFn).toHaveBeenCalledTimes(1);

      const results = await Promise.all(promises);
      results.forEach((r) => expect(r).toBe("shared"));
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("handles interleaved requests", async () => {
      const fetchFn = jest.fn(
        () => new Promise((resolve) => setTimeout(() => resolve("data"), 50))
      );

      const p1 = deduplicator.deduplicate("key-1", fetchFn);
      const p2 = deduplicator.deduplicate("key-1", fetchFn);
      const p3 = deduplicator.deduplicate("key-2", fetchFn);

      expect(p1).toBe(p2);
      expect(p1).not.toBe(p3);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// createDedupFunction
// ---------------------------------------------------------------------------

describe("createDedupFunction", () => {
  it("creates a wrapper that deduplicates by key", async () => {
    const originalFn = jest.fn(
      (id: string) => new Promise((resolve) => setTimeout(() => resolve(`data-${id}`), 50))
    );

    const keyGen = (id: string) => `cert-${id}`;
    const dedupFn = createDedupFunction(originalFn, keyGen);

    const p1 = dedupFn("123");
    const p2 = dedupFn("123");
    const p3 = dedupFn("456");

    expect(p1).toBe(p2);
    expect(p1).not.toBe(p3);
    expect(originalFn).toHaveBeenCalledTimes(2);

    const r1 = await p1;
    const r3 = await p3;

    expect(r1).toBe("data-123");
    expect(r3).toBe("data-456");
  });

  it("uses global deduplicator by default", async () => {
    const originalFn = jest.fn().mockResolvedValue("data");

    const dedupFn = createDedupFunction(originalFn, () => "unique-key");

    await dedupFn();
    const result = await dedupFn();

    expect(result).toBe("data");
    // Pending request should have been made
    expect(originalFn).toBeCalled();
  });

  it("uses custom deduplicator when provided", async () => {
    const customDedup = new RequestDeduplicator({ maxPendingTime: 50 });
    const originalFn = jest.fn().mockResolvedValue("data");

    const dedupFn = createDedupFunction(originalFn, () => "key", customDedup);

    await dedupFn();
    expect(originalFn).toHaveBeenCalledTimes(1);
  });

  it("passes function arguments correctly", async () => {
    const originalFn = jest.fn((a: number, b: string) => Promise.resolve(`${a}-${b}`));

    const keyGen = (a: number, b: string) => `${a}:${b}`;
    const dedupFn = createDedupFunction(originalFn, keyGen);

    const result = await dedupFn(42, "hello");

    expect(result).toBe("42-hello");
    expect(originalFn).toHaveBeenCalledWith(42, "hello");
  });
});

// ---------------------------------------------------------------------------
// globalDeduplicator
// ---------------------------------------------------------------------------

describe("globalDeduplicator", () => {
  beforeEach(() => {
    globalDeduplicator.clear();
  });

  it("is a singleton instance", async () => {
    const fetchFn = jest.fn().mockResolvedValue("data");

    const p1 = globalDeduplicator.deduplicate("test", fetchFn);
    const p2 = globalDeduplicator.deduplicate("test", fetchFn);

    expect(p1).toBe(p2);
  });

  it("can be used across multiple modules", async () => {
    const fetchFn = jest.fn().mockResolvedValue("shared");

    const result1 = await globalDeduplicator.deduplicate("global-key", fetchFn);
    const result2 = await globalDeduplicator.deduplicate("global-key", fetchFn);

    expect(result1).toBe("shared");
    expect(result2).toBe("shared");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
