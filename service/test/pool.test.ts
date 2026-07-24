import { beforeEach, describe, expect, it } from "vitest";

import { BENCH_FLOOR, PatPool, PoolExhaustedError } from "../src/github/pool.js";
import { clearSecrets, scrub } from "../src/log.js";

const reading = (remaining: number, resetAt: string) => ({
  cost: 1,
  limit: 5000,
  remaining,
  resetAt,
});

const RESET = "2026-07-21T22:00:00Z";
const RESET_MS = Date.parse(RESET);

beforeEach(() => {
  clearSecrets();
});

describe("PatPool", () => {
  it("exists without a token, and refuses to hand one out", () => {
    // A blank KODAMA_PATS is a misconfigured deploy, not a reason to die during
    // boot: crashing here would take `/healthz` down too, and `/healthz` is the
    // only thing that could say why (D-032).
    for (const empty of [[], ["  ", ""]]) {
      const pool = new PatPool(empty);
      expect(pool.size).toBe(0);
      expect(() => pool.acquire()).toThrow(PoolExhaustedError);
      expect(pool.stats()).toEqual([]);
    }
  });

  it("rotates round-robin", () => {
    const pool = new PatPool(["a", "b", "c"]);
    expect([pool.acquire(), pool.acquire(), pool.acquire(), pool.acquire()]).toEqual([
      "a",
      "b",
      "c",
      "a",
    ]);
  });

  it("benches a token that falls under the floor", () => {
    const pool = new PatPool(["a", "b"], { now: () => RESET_MS - 60_000 });
    pool.report("a", reading(BENCH_FLOOR - 1, RESET));
    expect([pool.acquire(), pool.acquire()]).toEqual(["b", "b"]);
  });

  it("keeps a token that is exactly at the floor", () => {
    const pool = new PatPool(["a", "b"], { now: () => RESET_MS - 60_000 });
    pool.report("a", reading(BENCH_FLOOR, RESET));
    expect(pool.acquire()).toBe("a");
  });

  it("throws once every token is benched, with a time to retry", () => {
    const now = RESET_MS - 60_000;
    const pool = new PatPool(["a", "b"], { now: () => now });
    pool.report("a", reading(0, RESET));
    pool.report("b", reading(0, RESET));

    try {
      pool.acquire();
      expect.unreachable("pool should have been exhausted");
    } catch (err) {
      expect(err).toBeInstanceOf(PoolExhaustedError);
      expect((err as PoolExhaustedError).retryAtMs).toBe(RESET_MS);
    }
  });

  it("returns a benched token to service once its window resets", () => {
    let now = RESET_MS - 60_000;
    const pool = new PatPool(["a"], { now: () => now });
    pool.report("a", reading(1, RESET));
    expect(() => pool.acquire()).toThrow(PoolExhaustedError);

    now = RESET_MS + 1;
    expect(pool.acquire()).toBe("a");
    // The stale reading is dropped with the bench: the window reset, so the
    // token is whole again until a response says otherwise.
    expect(pool.stats()[0]!.remaining).toBeNull();
  });

  it("benches a rejected token for an hour", () => {
    const now = 1_000_000;
    const pool = new PatPool(["a", "b"], { now: () => now });
    pool.penalize("a", "auth");
    expect([pool.acquire(), pool.acquire()]).toEqual(["b", "b"]);
    expect(pool.stats()[0]!.benched).toBe(true);
  });

  it("benches only until the moment GitHub named", () => {
    let now = 1_000_000;
    const pool = new PatPool(["a"], { now: () => now });
    pool.benchUntil("a", now + 30_000);
    expect(() => pool.acquire()).toThrow(PoolExhaustedError);

    // A secondary limit clears in seconds. Sitting out the hour would cost more
    // capacity than the limit itself, at the worst possible moment.
    now += 31_000;
    expect(pool.acquire()).toBe("a");
  });

  it("falls back to the hour with no moment named, and clamps an absurd one", () => {
    let now = 1_000_000;
    const pool = new PatPool(["a", "b"], { now: () => now });
    pool.benchUntil("a", null);
    pool.benchUntil("b", now + 86_400_000);

    now += 3_600_001;
    expect([pool.acquire(), pool.acquire()]).toEqual(["a", "b"]);
  });

  it("tolerates two transport failures before benching", () => {
    const now = 1_000_000;
    const pool = new PatPool(["a"], { now: () => now });
    pool.penalize("a", "transport");
    expect(pool.acquire()).toBe("a");
    pool.penalize("a", "transport");
    expect(pool.acquire()).toBe("a");
    pool.penalize("a", "transport");
    expect(() => pool.acquire()).toThrow(PoolExhaustedError);
  });

  it("clears the failure count when a token answers again", () => {
    const pool = new PatPool(["a"], { now: () => 1_000_000 });
    pool.penalize("a", "transport");
    pool.penalize("a", "transport");
    pool.report("a", reading(4999, RESET));
    expect(pool.stats()[0]!.failures).toBe(0);
  });

  it("reports per-token quota and never a sum (D-029)", () => {
    const pool = new PatPool(["a", "b"], { now: () => RESET_MS - 60_000 });
    pool.report("a", reading(4000, RESET));
    pool.report("b", reading(3000, RESET));
    const stats = pool.stats();
    expect(stats).toHaveLength(2);
    expect(stats.map((s) => s.remaining)).toEqual([4000, 3000]);
    expect(stats.map((s) => s.index)).toEqual([0, 1]);
    // Tokens on one account share a budget, so a sum would claim capacity that
    // does not exist. The shape makes summing something you have to choose.
    expect(stats).not.toHaveProperty("total");
  });

  it("never exposes a token, in stats or in a serialized dump", () => {
    const pool = new PatPool(["ghp_000000000000000000000000000000000001"]);
    const dump = JSON.stringify(pool.stats());
    expect(dump).not.toContain("ghp_");
    for (const stat of pool.stats()) {
      expect(Object.values(stat).join(" ")).not.toContain("ghp_");
    }
  });

  it("registers its tokens for log scrubbing", () => {
    const token = "ghp_000000000000000000000000000000000002";
    new PatPool([token]);
    expect(scrub(`request failed with ${token}`)).toBe("request failed with [redacted]");
  });

  it("ignores reports and penalties for tokens it does not hold", () => {
    const pool = new PatPool(["a"]);
    expect(() => {
      pool.report("nope", reading(10, RESET));
    }).not.toThrow();
    expect(() => {
      pool.penalize("nope", "auth");
    }).not.toThrow();
    expect(() => {
      pool.benchUntil("nope", null);
    }).not.toThrow();
    expect(pool.stats()[0]!.remaining).toBeNull();
  });
});
