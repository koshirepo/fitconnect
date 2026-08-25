/**
 * Documentation: Short-lived in-isolate cache for hot authorization reads.
 *
 * - Every tenant-scoped request re-reads two rarely-changing things: whether the gym's platform access has lapsed, and the role-permission overrides in force. Both are the same answer for every request in a burst, and neither is worth a database round trip each time.
 * - Deliberately tiny and deliberately stale-tolerant. The TTL is seconds, so a revoked permission or an expired subscription takes effect within one, and nothing here is the only thing standing between a caller and their data — the permission check itself still runs per request against the cached values.
 * - Scoped to a Worker isolate, which means it warms per instance and disappears with it. That is the right lifetime: no invalidation to get wrong, no cross-request state beyond the TTL.
 * - Primary exports: cached, invalidateCached.
 */

/** Long enough to collapse a burst, short enough that nobody notices staleness. */
const DEFAULT_TTL_MS = 5_000;

type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();

/**
 * Return the cached value for `key`, or produce and store it.
 *
 * In-flight duplicates are not deduplicated: two concurrent misses both run the
 * loader, which costs one extra query in a rare race and keeps this free of the
 * promise bookkeeping that would otherwise need to handle rejection.
 */
export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }

  const value = await load();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });

  // The map only ever holds a handful of gyms per isolate, but a long-lived
  // instance serving many tenants should not accumulate expired rows forever.
  if (store.size > 500) {
    const now = Date.now();
    for (const [entryKey, entry] of store) {
      if (entry.expiresAt <= now) store.delete(entryKey);
    }
  }

  return value;
}

/**
 * Drop a cached entry immediately.
 *
 * Used by the writes that change what was cached — editing role permissions —
 * so an admin sees their own change take effect at once rather than after the
 * TTL. Other isolates still wait out the TTL, which is why the TTL is short.
 */
export function invalidateCached(key: string) {
  store.delete(key);
}
