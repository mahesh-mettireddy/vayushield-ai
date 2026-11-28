interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Bounded in-memory TTL + LRU cache.
 * Enforces `maxEntries` by purging expired entries first and then evicting the least-recently-used key.
 */
export class BoundedTtlCache<V> {
  private readonly entries = new Map<string, CacheEntry<V>>();
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(maxEntries = 500, now: () => number = () => Date.now()) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
    this.now = now;
  }

  /** Returns the current number of active, non-expired entries. */
  get size(): number {
    this.purgeExpired(this.now());
    return this.entries.size;
  }

  /** Retrieves a non-expired cache entry and refreshes its LRU recency. */
  getEntry(key: string): CacheEntry<V> | undefined {
    const existing = this.entries.get(key);
    if (!existing) return undefined;

    if (this.now() >= existing.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    // Refresh insertion order so active keys stay hot under LRU eviction.
    this.entries.delete(key);
    this.entries.set(key, existing);
    return existing;
  }

  /** Retrieves a non-expired cached value by key, or `undefined` if missing/expired. */
  get(key: string): V | undefined {
    return this.getEntry(key)?.value;
  }

  /** Stores a value until `expiresAt`, evicting expired then oldest-used keys when full. */
  set(key: string, value: V, expiresAt: number): void {
    const currentNow = this.now();
    if (currentNow >= expiresAt) {
      this.entries.delete(key);
      return;
    }

    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxEntries) {
      this.purgeExpired(currentNow);
      while (this.entries.size >= this.maxEntries) {
        const oldest = this.entries.keys().next();
        if (oldest.done) break;
        this.entries.delete(oldest.value);
      }
    }

    this.entries.set(key, { value, expiresAt });
  }

  /** Removes a single entry by key if present. */
  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  /** Removes all cached entries. */
  clear(): void {
    this.entries.clear();
  }

  private purgeExpired(currentNow: number): void {
    for (const [key, entry] of this.entries) {
      if (currentNow >= entry.expiresAt) {
        this.entries.delete(key);
      }
    }
  }
}
