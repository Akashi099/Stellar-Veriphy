import type { Logger } from "./logger.js";
import { cacheEntries, cacheEvictions, cacheRequests } from "./metrics.js";

export interface TtlCacheOptions {
  /** Metric/log label, e.g. "verification_status". */
  name: string;
  /** Upper bound on entries; least recently used entries are evicted first. 0 disables the cache. */
  maxEntries: number;
  ttlMs: number;
  /** TTL for cached "not found" results, kept short so a new record shows up quickly. */
  negativeTtlMs: number;
}

interface Entry<V> {
  value: V | null;
  expiresAt: number;
}

/** coalesced = a concurrent miss for the same key shared an in-flight load. */
export type CacheOutcome = "hit" | "miss" | "negative_hit" | "coalesced" | "bypass";

/**
 * In-process TTL + LRU cache for public, read-only lookups (#779).
 *
 * Each instance caches independently, so a write on one instance is seen by others at most `ttlMs`
 * later. Callers must only cache data where that staleness is acceptable, and must call
 * `invalidate()` on the local instance after changing a cached record. Concurrent misses for the same
 * key share one loader call, so a burst of identical lookups hits MongoDB once.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly inflight = new Map<string, Promise<V | null>>();

  constructor(
    private readonly opts: TtlCacheOptions,
    private readonly log: Logger,
  ) {}

  get enabled(): boolean {
    return this.opts.maxEntries > 0 && this.opts.ttlMs > 0;
  }

  /**
   * Returns the cached value for `key`, or calls `load` and caches its result.
   * `cacheable` decides whether a loaded value may be stored (e.g. only terminal states).
   */
  async getOrLoad(
    key: string,
    load: () => Promise<V | null>,
    cacheable: (value: V) => boolean = () => true,
  ): Promise<V | null> {
    const { name } = this.opts;
    if (!this.enabled) {
      this.record("bypass", key);
      return load();
    }

    const now = Date.now();
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt > now) {
      // Re-insert to mark as most recently used.
      this.entries.delete(key);
      this.entries.set(key, entry);
      this.record(entry.value === null ? "negative_hit" : "hit", key);
      return entry.value;
    }
    if (entry) this.entries.delete(key);

    const pending = this.inflight.get(key);
    if (pending) {
      this.record("coalesced", key);
      return pending;
    }

    this.record("miss", key);
    const promise = load()
      .then((value) => {
        if (value === null) this.store(key, null, this.opts.negativeTtlMs);
        else if (cacheable(value)) this.store(key, value, this.opts.ttlMs);
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    cacheEntries.set({ cache: name }, this.entries.size);
    return promise;
  }

  /** Drops one key. Call after writing the record it caches. */
  invalidate(key: string): boolean {
    const removed = this.entries.delete(key);
    if (removed) {
      cacheEvictions.inc({ cache: this.opts.name, reason: "invalidated" });
      cacheEntries.set({ cache: this.opts.name }, this.entries.size);
      this.log.debug("cache invalidated", { cache: this.opts.name, key });
    }
    return removed;
  }

  /** Drops every entry. Returns how many were removed. */
  clear(): number {
    const count = this.entries.size;
    this.entries.clear();
    if (count > 0) cacheEvictions.inc({ cache: this.opts.name, reason: "cleared" }, count);
    cacheEntries.set({ cache: this.opts.name }, 0);
    this.log.info("cache cleared", { cache: this.opts.name, entries: count });
    return count;
  }

  get size(): number {
    return this.entries.size;
  }

  private store(key: string, value: V | null, ttlMs: number): void {
    if (ttlMs <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this.entries.size > this.opts.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
      cacheEvictions.inc({ cache: this.opts.name, reason: "capacity" });
    }
    cacheEntries.set({ cache: this.opts.name }, this.entries.size);
  }

  private record(outcome: CacheOutcome, key: string): void {
    cacheRequests.inc({ cache: this.opts.name, outcome });
    this.log.debug(`cache ${outcome.replace("_", " ")}`, { cache: this.opts.name, outcome, key });
  }
}
