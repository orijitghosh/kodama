/**
 * The cache port (D-008, D-027).
 *
 * Three methods and a TTL, because that is the whole of what the request flow
 * needs (SPEC-SERVICE §2) and because a small port keeps the provider choice
 * reversible: Upstash today, anything with GET/SETEX/DEL tomorrow.
 *
 * KV is a cache and never a database (D-009). Losing every key costs one cold
 * fetch per user, so a store that is down must degrade to "miss", never to an
 * error page - see `guarded()`.
 */

export interface KV {
  /** The stored string, or null for absent/expired. */
  get(key: string): Promise<string | null>;
  /** Write with a required expiry - nothing in this system is kept forever. */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Drop a key; absent keys are not an error. */
  del(key: string): Promise<void>;
  /**
   * Increment a counter, refresh its expiry, and return the new value.
   *
   * The fourth method exists because a rate cap cannot be built out of the other
   * three: get-then-set loses every concurrent increment, and concurrency is the
   * only condition a cap is for. `0` is returned when the store could not
   * answer - never a real count, since the first increment yields 1 - and the
   * caller must read it as "unknown" and let the request through (guard.ts).
   */
  incr(key: string, ttlSeconds: number): Promise<number>;
}

// ---------------------------------------------------------------------------
// Keys and TTLs (SPEC-SERVICE §2)
// ---------------------------------------------------------------------------

/** NormalizedHistory JSON for a login. */
export const historyKey = (login: string): string => `h1:${login.toLowerCase()}`;

/** One immutable past year of the contribution calendar. */
export const yearKey = (login: string, year: number): string =>
  `y:${login.toLowerCase()}:${String(year)}`;

/**
 * 30 d - long, because expiry is no longer what decides freshness (D-030).
 *
 * The entry carries its own `fetchedAt`, so a reader can tell a fresh history
 * from a stale one without the store forgetting it. That is what makes
 * serve-stale-on-API-failure possible at all: a key that expired on schedule
 * has nothing left to serve at the moment it is needed most.
 */
export const HISTORY_TTL_S = 2_592_000;

/** Past years never change; only the eviction budget argues for an expiry. */
export const YEAR_TTL_S = 2_592_000;

/**
 * A login GitHub has no account for.
 *
 * Without this key every request for a nonexistent name is a fresh GraphQL
 * query, and a name that does not exist is free to invent: a few thousand of
 * them drains an account's hourly budget and every uncached badge degrades to
 * the "come back soon" seedling. Six hours is long enough to make the attack
 * uneconomical and short enough that someone who registers the name today sees
 * their tree the same afternoon.
 */
export const missKey = (login: string): string => `n1:${login.toLowerCase()}`;

export const NOT_FOUND_TTL_S = 21_600;

/**
 * Cold fetches charged to one client in one hour (guard.ts).
 *
 * The client is a hash, never an address: PRD §Privacy allows an abuse counter
 * and nothing more, and a counter does not need to know who it counts.
 */
export const coldKey = (clientHash: string, hourBucket: number): string =>
  `c1:${clientHash}:${String(hourBucket)}`;

/** One bucket's worth, plus slack so a counter never dies inside its own hour. */
export const COLD_TTL_S = 7_200;

/**
 * A history is fresh for the UTC day it was fetched.
 *
 * The engine's finest resolution is a day, so re-fetching within one buys
 * nothing; and one refresh per login per day is what the cost sheet is built
 * on (`dev/OPS.md` §2).
 */
export const isFresh = (fetchedAt: string, today: string): boolean => fetchedAt >= today;

// ---------------------------------------------------------------------------
// Failure containment
// ---------------------------------------------------------------------------

export interface KvHealth {
  /** Failed operations since process start; surfaced by `/healthz`. */
  errors: number;
  lastError: string | null;
}

/**
 * Wraps a store so that its failures read as cache misses.
 *
 * The counter is the only trace kept: a dead Upstash should show up on the
 * budget dashboard, not in the served image.
 */
export function guarded(kv: KV, health: KvHealth): KV {
  const note = (err: unknown): void => {
    health.errors += 1;
    health.lastError = err instanceof Error ? err.message : String(err);
  };
  return {
    async get(key) {
      try {
        return await kv.get(key);
      } catch (err) {
        note(err);
        return null;
      }
    },
    async set(key, value, ttlSeconds) {
      try {
        await kv.set(key, value, ttlSeconds);
      } catch (err) {
        note(err);
      }
    },
    async del(key) {
      try {
        await kv.del(key);
      } catch (err) {
        note(err);
      }
    },
    async incr(key, ttlSeconds) {
      try {
        return await kv.incr(key, ttlSeconds);
      } catch (err) {
        note(err);
        // A store that cannot count must not become a store that refuses
        // service: 0 tells the guard it does not know, and it lets the request
        // through (kv port, `incr`).
        return 0;
      }
    },
  };
}

export function newHealth(): KvHealth {
  return { errors: 0, lastError: null };
}

export { MemoryKV } from "./memory.js";
