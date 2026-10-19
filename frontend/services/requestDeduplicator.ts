/**
 * requestDeduplicator.ts
 *
 * Request deduplication service that prevents duplicate in-flight requests
 * by caching and sharing pending promises.
 *
 * When multiple components request the same resource simultaneously,
 * only one network request is made and the promise is shared among all callers.
 *
 * @module services/requestDeduplicator
 *
 * @example
 * ```tsx
 * const deduplicator = new RequestDeduplicator();
 *
 * // First call makes a real request
 * const result1 = await deduplicator.deduplicate(
 *   "cert-123",
 *   () => getCertificateById("cert-123")
 * );
 *
 * // Second call (within pending period) returns the same promise
 * const result2 = await deduplicator.deduplicate(
 *   "cert-123",
 *   () => getCertificateById("cert-123")
 * );
 *
 * // Both get the same result, but only one fetch occurred
 * assert.deepEqual(result1, result2);
 * ```
 */

import { logger } from "@/lib/logger";

/**
 * Represents a pending request that can be shared among multiple callers.
 */
interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

/**
 * RequestDeduplicator prevents duplicate in-flight requests.
 *
 * When a request with the same key is made while a previous one is still
 * pending, the existing promise is returned instead of making a new request.
 *
 * This reduces redundant API calls when multiple components simultaneously
 * fetch the same resource.
 *
 * @template T - The type of data returned by requests.
 */
export class RequestDeduplicator<T = unknown> {
  /**
   * Map of pending requests keyed by request identifier.
   */
  private pendingRequests = new Map<string, PendingRequest<T>>();

  /**
   * Maximum time a pending request can be reused (in milliseconds).
   * After this period, a new request will be made even if one is already pending.
   *
   * @default 5000 (5 seconds)
   */
  private maxPendingTime = 5000;

  /**
   * Whether to log deduplication events for debugging.
   *
   * @default false
   */
  private enableLogging = false;

  /**
   * Creates a new RequestDeduplicator instance.
   *
   * @param options - Configuration options
   * @param options.maxPendingTime - Maximum time (ms) to reuse a pending request
   * @param options.enableLogging - Enable debug logging
   */
  constructor(options?: { maxPendingTime?: number; enableLogging?: boolean }) {
    if (options?.maxPendingTime !== undefined) {
      this.maxPendingTime = options.maxPendingTime;
    }
    if (options?.enableLogging !== undefined) {
      this.enableLogging = options.enableLogging;
    }
  }

  /**
   * Deduplicate a request.
   *
   * If a request with the same key is already pending and within the
   * max pending time, its promise is returned. Otherwise, the fetch function
   * is called and its promise is cached.
   *
   * @param key - Unique identifier for this request (e.g., "cert-123")
   * @param fetchFn - Async function that makes the actual request
   * @returns Promise that resolves to the request result
   *
   * @example
   * ```ts
   * const result = await deduplicator.deduplicate(
   *   "user-" + userId,
   *   () => api.getUser(userId)
   * );
   * ```
   */
  async deduplicate(key: string, fetchFn: () => Promise<T>): Promise<T> {
    const pending = this.pendingRequests.get(key);

    // Check if we have a pending request within the allowed window
    if (pending) {
      const age = Date.now() - pending.timestamp;
      if (age < this.maxPendingTime) {
        this.log(`Deduplicating request: ${key} (age: ${age}ms)`);
        return pending.promise;
      } else {
        this.log(`Pending request expired for ${key} (age: ${age}ms)`);
        this.pendingRequests.delete(key);
      }
    }

    // Make a new request and cache the promise
    this.log(`Making new request for ${key}`);
    const promise = fetchFn()
      .then((result) => {
        this.log(`Request completed for ${key}`);
        // Clean up after success
        setTimeout(() => this.pendingRequests.delete(key), 0);
        return result;
      })
      .catch((error) => {
        this.log(`Request failed for ${key}: ${error.message}`);
        // Clean up after failure
        setTimeout(() => this.pendingRequests.delete(key), 0);
        throw error;
      });

    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now(),
    });

    return promise;
  }

  /**
   * Clear all pending requests, forcing fresh requests on next deduplicate call.
   */
  clear(): void {
    this.log(`Clearing ${this.pendingRequests.size} pending requests`);
    this.pendingRequests.clear();
  }

  /**
   * Clear a specific pending request by key.
   *
   * @param key - The request key to clear
   */
  clearKey(key: string): void {
    if (this.pendingRequests.has(key)) {
      this.log(`Clearing pending request: ${key}`);
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Get the number of currently pending requests.
   */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Get all pending request keys.
   */
  getPendingKeys(): string[] {
    return Array.from(this.pendingRequests.keys());
  }

  /**
   * Set the maximum time a pending request can be reused.
   *
   * @param ms - Time in milliseconds
   */
  setMaxPendingTime(ms: number): void {
    this.maxPendingTime = ms;
  }

  /**
   * Enable or disable debug logging.
   */
  setLogging(enabled: boolean): void {
    this.enableLogging = enabled;
  }

  /**
   * Internal logging helper.
   */
  private log(message: string): void {
    if (this.enableLogging) {
      logger.debug(`[RequestDeduplicator] ${message}`);
    }
  }
}

/**
 * Global singleton deduplicator for general requests.
 *
 * This is used by default when creating a deduplicated service function
 * without providing a custom deduplicator instance.
 */
export const globalDeduplicator = new RequestDeduplicator({
  maxPendingTime: 5000,
  enableLogging: false,
});

/**
 * Create a deduplicator wrapper for an async function.
 *
 * This is a convenience function that automatically deduplicates calls to
 * a service function based on its arguments.
 *
 * @param fn - The async function to deduplicate
 * @param keyGen - Function to generate a cache key from the function arguments
 * @param deduplicator - Optional custom deduplicator instance (uses global by default)
 * @returns A wrapped function that deduplicates calls
 *
 * @example
 * ```ts
 * // Wrap a service function
 * const dedupGetCert = createDedupFunction(
 *   getCertificateById,
 *   (id) => `cert-${id}`
 * );
 *
 * // Multiple calls with same ID reuse the promise
 * const [result1, result2] = await Promise.all([
 *   dedupGetCert("123"),
 *   dedupGetCert("123"),
 * ]);
 * ```
 */
export function createDedupFunction<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>,
  keyGen: (...args: Args) => string,
  deduplicator: RequestDeduplicator<T> = globalDeduplicator as unknown as RequestDeduplicator<T>
): (...args: Args) => Promise<T> {
  return (...args: Args): Promise<T> => {
    const key = keyGen(...args);
    return deduplicator.deduplicate(key, () => fn(...args));
  };
}
