import { describe, expect, it } from 'vitest';
import { BoundedTtlCache } from '../../api/_lib/boundedCache';

describe('BoundedTtlCache', () => {
  it('stores and retrieves valid entries until TTL expiration', () => {
    let now = 1_000;
    const cache = new BoundedTtlCache<string>(3, () => now);
    cache.set('a', 'alpha', 2_000);

    expect(cache.get('a')).toBe('alpha');
    expect(cache.getEntry('a')).toEqual({ value: 'alpha', expiresAt: 2_000 });
    expect(cache.size).toBe(1);

    now = 2_000;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts expired entries before evicting active LRU entries', () => {
    let now = 1_000;
    const cache = new BoundedTtlCache<number>(2, () => now);
    cache.set('short', 1, 1_500);
    cache.set('long', 2, 5_000);

    now = 1_600;
    cache.set('fresh', 3, 5_000);

    expect(cache.get('short')).toBeUndefined();
    expect(cache.get('long')).toBe(2);
    expect(cache.get('fresh')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('enforces maxEntries cap using LRU eviction order', () => {
    const now = 1_000;
    const cache = new BoundedTtlCache<string>(2, () => now);
    cache.set('k1', 'v1', 10_000);
    cache.set('k2', 'v2', 10_000);
    // Access k1 to promote it above k2
    expect(cache.get('k1')).toBe('v1');

    cache.set('k3', 'v3', 10_000);
    expect(cache.get('k2')).toBeUndefined();
    expect(cache.get('k1')).toBe('v1');
    expect(cache.get('k3')).toBe('v3');
    expect(cache.size).toBe(2);
  });

  it('ignores already-expired entries and supports delete and clear', () => {
    const cache = new BoundedTtlCache<string>(5, () => 5_000);
    cache.set('expired', 'nope', 5_000);
    expect(cache.size).toBe(0);

    cache.set('live', 'ok', 9_000);
    expect(cache.delete('live')).toBe(true);
    expect(cache.delete('live')).toBe(false);

    cache.set('a', '1', 9_000);
    cache.set('b', '2', 9_000);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
