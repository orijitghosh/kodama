/**
 * The PAT pool (SPEC-SERVICE §3, D-029).
 *
 * Round-robin over tokens, each carrying the remaining-quota reading that
 * GitHub piggybacks on every response. A token that falls under the floor is
 * benched until its reset time rather than spent down to zero: the last few
 * hundred points are what a cold whale fetch needs, and being refused
 * mid-fan-out is worse than being refused before starting.
 *
 * One token per account. GitHub's limit is per user, so two tokens from one
 * account share one budget and this class would report double the capacity that
 * exists (SPIKE-GRAPHQL §3). It is enforced nowhere - GitHub does not name the
 * account without spending a point - so it is documented here and in the spec.
 */

import { registerSecret } from "../log.js";

/** Below this many points a token is benched until reset. */
export const BENCH_FLOOR = 500;

export interface RateLimitReading {
  cost: number;
  limit: number;
  remaining: number;
  /** ISO 8601 timestamp. */
  resetAt: string;
}

export class PoolExhaustedError extends Error {
  override readonly name = "PoolExhaustedError";
  /** Epoch ms at which the earliest-resetting token returns. */
  readonly retryAtMs: number;

  constructor(retryAtMs: number) {
    super("every token is benched or exhausted");
    this.retryAtMs = retryAtMs;
  }
}

interface Slot {
  token: string;
  /** Null until the first response comes back with a reading. */
  remaining: number | null;
  limit: number | null;
  resetAtMs: number | null;
  /** Consecutive transport/auth failures; three strikes benches for an hour. */
  failures: number;
  benchedUntilMs: number | null;
}

/** Per-token view for `/healthz`. Never carries the token itself. */
export interface PoolStats {
  index: number;
  remaining: number | null;
  limit: number | null;
  benched: boolean;
  resetAt: string | null;
  failures: number;
}

export interface PatPoolOptions {
  /** Epoch ms. Injected so bench and reset behaviour is testable. */
  now?: () => number;
}

export class PatPool {
  readonly #slots: Slot[];
  readonly #now: () => number;
  #cursor = 0;

  constructor(tokens: readonly string[], options: PatPoolOptions = {}) {
    // An empty pool is legal, and it is the misconfigured-deploy case: a blank
    // `KODAMA_PATS` must draw "come back soon" and light up `/healthz`, not
    // crash the process during boot and take `/healthz` down with it. `acquire`
    // on an empty pool already throws PoolExhaustedError, which the error table
    // maps to exactly that picture (D-032).
    const cleaned = tokens.map((t) => t.trim()).filter((t) => t.length > 0);
    for (const token of cleaned) registerSecret(token);
    this.#slots = cleaned.map((token) => ({
      token,
      remaining: null,
      limit: null,
      resetAtMs: null,
      failures: 0,
      benchedUntilMs: null,
    }));
    this.#now = options.now ?? (() => Date.now());
  }

  get size(): number {
    return this.#slots.length;
  }

  #available(slot: Slot): boolean {
    const now = this.#now();
    if (slot.benchedUntilMs !== null && slot.benchedUntilMs > now) return false;
    // A bench that has expired is lifted, and the stale quota reading with it:
    // the window reset, so the token is whole again until proven otherwise.
    if (slot.benchedUntilMs !== null && slot.benchedUntilMs <= now) {
      slot.benchedUntilMs = null;
      slot.remaining = null;
      slot.failures = 0;
    }
    if (slot.remaining !== null && slot.remaining < BENCH_FLOOR) {
      slot.benchedUntilMs = slot.resetAtMs ?? now + 3_600_000;
      return false;
    }
    return true;
  }

  /**
   * The next usable token, or `PoolExhaustedError` when every slot is benched.
   * The caller passes the token straight to the transport and reports back.
   */
  acquire(): string {
    for (let i = 0; i < this.#slots.length; i += 1) {
      const slot = this.#slots[(this.#cursor + i) % this.#slots.length]!;
      if (this.#available(slot)) {
        this.#cursor = (this.#cursor + i + 1) % this.#slots.length;
        return slot.token;
      }
    }
    const soonest = this.#slots
      .map((s) => s.benchedUntilMs ?? Number.POSITIVE_INFINITY)
      .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
    throw new PoolExhaustedError(Number.isFinite(soonest) ? soonest : this.#now() + 3_600_000);
  }

  /** Record the quota GitHub reported for a token that just answered. */
  report(token: string, reading: RateLimitReading): void {
    const slot = this.#slots.find((s) => s.token === token);
    if (slot === undefined) return;
    slot.remaining = reading.remaining;
    slot.limit = reading.limit;
    const resetAtMs = Date.parse(reading.resetAt);
    slot.resetAtMs = Number.isNaN(resetAtMs) ? null : resetAtMs;
    slot.failures = 0;
  }

  /** Bench a token immediately - GitHub said 401/403, or the transport died. */
  penalize(token: string, kind: "auth" | "transport"): void {
    const slot = this.#slots.find((s) => s.token === token);
    if (slot === undefined) return;
    slot.failures += 1;
    // A rejected token is not coming back this hour; a flaky connection might.
    if (kind === "auth") slot.benchedUntilMs = this.#now() + 3_600_000;
    else if (slot.failures >= 3) slot.benchedUntilMs = this.#now() + 60_000;
  }

  /**
   * Per-token quota for `/healthz`, never summed.
   *
   * Summing is exactly the mistake D-029 documents: two tokens on one account
   * would report 10 000 points that do not exist. The dashboard shows a row
   * per token and the operator reads the minimum.
   */
  stats(): PoolStats[] {
    const now = this.#now();
    return this.#slots.map((slot, index) => ({
      index,
      remaining: slot.remaining,
      limit: slot.limit,
      benched: slot.benchedUntilMs !== null && slot.benchedUntilMs > now,
      resetAt: slot.resetAtMs === null ? null : new Date(slot.resetAtMs).toISOString(),
      failures: slot.failures,
    }));
  }
}
