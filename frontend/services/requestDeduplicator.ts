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
 * HTTP methods that are safe to deduplicate.
 *
 * Only read-only methods are deduplicated. Mutations (POST, PUT, PATCH,
 * DELETE, etc.) must never be deduplicated because each call has side
 * effects and must reach the server exactly once.
 */
const DEDUPLICABLE_METHODS = new Set(["GET", "HEAD"]);

/**
 * Represents a pending request that can be shared among multiple callers.
 */
interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

/**
 * Options accepted by {@link RequestDeduplicator.deduplicateRequest}.
 */
export interface DeduplicateRequestOptions {
  /** HTTP method for the request. Defaults to "GET". */
  method?: string;
  /** Request URL (or any stable resource identifier). */
  url: string;
  /** Optional request body. Only relevant for non-deduplicable methods. */
  body?: unknown;
}

/**
 * Returns true when a request with the given method may be deduplicated.
 *
 * @param method - HTTP method (case-insensitive)
 */
export function isDeduplicableMethod(method: string | undefined): boolean {
  return DEDUPLICABLE_METHODS.has((method ?? "GET").toUpperCase());
}

/**
 * Builds a stable deduplication key from method, URL and body.
 *
 * The key is only meaningful for deduplicable (read) methods; mutations
 * bypass deduplication entirely.
 *
 * @param method - HTTP method (case-insensitive)
 * @param url - Request URL
 * @param body - Optional request body
 */
export function buildRequestKey(
  method: string | undefined,
  url: string,
  body?: unknown
): string {
  const normalizedMethod = (method ?? "GET").toUpperCase();
  let serializedBody = "";
  if (body !== undefined) {
    try {
      serializedBody = JSON.stringify(body) ?? "";
    } catch {
      // Non-serializable bodies cannot be safely keyed; fall back to a
      // unique marker so they are never incorrectly shared.
      serializedBody = `__unserializable_${Math.random()}`;
    }
  }
  return `${normalizedMethod} ${url} ${serializedBody}`;
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
        this.cleanup(key);
        return result;
      })
      .catch((error) => {
        this.log(`Request failed for ${key}: ${error.message}`);
        // Clean up after failure
        this.cleanup(key);
        throw error;
      });

    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now(),
    });

    return promise;
  }

  /**
   * Deduplicate a request keyed by HTTP method, URL and body.
   *
   * Only read-only methods (GET, HEAD) are deduplicated. Mutations
   * (POST, PUT, PATCH, DELETE, ...) always invoke `fetchFn` directly and
   * are never shared, so side effects are never lost.
   *
   * @param options - Request descriptor (method, url, body)
   * @param fetchFn - Async function that makes the actual request
   * @returns Promise that resolves to the request result
   *
   * @example
   * ```ts
   * const result = await deduplicator.deduplicateRequest(
   *   { method: "GET", url: "/api/certificates/123" },
   *   () => api.getCertificate("123")
   * );
   * ```
   */
  deduplicateRequest(
    options: DeduplicateRequestOptions,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    if (!isDeduplicableMethod(options.method)) {
      this.log(
        `Bypassing deduplication for ${options.method ?? "GET"} ${options.url}`
      );
      return fetchFn();
    }

    const key = buildRequestKey(options.method, options.url, options.body);
    return this.deduplicate(key, fetchFn);
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

  /**
   * Remove a pending request entry once it has settled.
   *
   * Deferred to a microtask so callers that attach to the shared promise
   * in the same tick still observe the cached entry.
   */
  private cleanup(key: string): void {
    setTimeout(() => this.pendingRequests.delete(key), 0);
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

/**
 * Create a deduplicator wrapper for an HTTP-style async function.
 *
 * Unlike {@link createDedupFunction}, this wrapper is method-aware: only
 * GET/HEAD requests are deduplicated, while mutations always execute.
 *
 * @param fn - The async function to deduplicate
 * @param requestGen - Function that derives the request descriptor from args
 * @param deduplicator - Optional custom deduplicator instance
 * @returns A wrapped function that deduplicates read requests only
 *
 * @example
 * ```ts
 * const dedupFetch = createDedupRequestFunction(
 *   (url: string, init?: RequestInit) => fetch(url, init).then((r) => r.json()),
 *   (url: string, init?: RequestInit) => ({
 *     method: init?.method,
 *     url,
 *     body: init?.body,
 *   })
 * );
 * ```
 */
export function createDedupRequestFunction<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>,
  requestGen: (...args: Args) => DeduplicateRequestOptions,
  deduplicator: RequestDeduplicator<T> = globalDeduplicator as unknown as RequestDeduplicator<T>
): (...args: Args) => Promise<T> {
  return (...args: Args): Promise<T> => {
    const request = requestGen(...args);
    return deduplicator.deduplicateRequest(request, () => fn(...args));
  };
}
