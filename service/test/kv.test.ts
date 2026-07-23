import { describe, expect, it } from "vitest";

import {
  guarded,
  historyKey,
  HISTORY_TTL_S,
  isFresh,
  MemoryKV,
  newHealth,
  yearKey,
  YEAR_TTL_S,
} from "../src/kv/index.js";
import type { KV } from "../src/kv/index.js";

describe("keys", () => {
  it("lowercases the login so casing variants share a cache entry", () => {
    expect(historyKey("Arijit")).toBe("h1:arijit");
    expect(yearKey("Arijit", 2019)).toBe("y:arijit:2019");
  });

  it("outlives the CDN window by a wide margin, so stale is servable (D-030)", () => {
    const cdnSMaxAgeS = 21_600;
    expect(HISTORY_TTL_S).toBeGreaterThan(cdnSMaxAgeS * 30);
    expect(YEAR_TTL_S).toBeGreaterThanOrEqual(HISTORY_TTL_S);
  });
});

describe("isFresh", () => {
  it("counts a history fetched today as fresh", () => {
    expect(isFresh("2026-07-21", "2026-07-21")).toBe(true);
  });

  it("counts yesterday's history as needing a refresh", () => {
    expect(isFresh("2026-07-20", "2026-07-21")).toBe(false);
  });

  it("does not send a clock-skewed future entry back to GitHub", () => {
    expect(isFresh("2026-07-22", "2026-07-21")).toBe(true);
  });
});

describe("MemoryKV", () => {
  it("round-trips a value", async () => {
    const kv = new MemoryKV();
    await kv.set("k", "v", 60);
    expect(await kv.get("k")).toBe("v");
  });

  it("returns null for an absent key", async () => {
    expect(await new MemoryKV().get("nope")).toBeNull();
  });

  it("expires a key once its TTL has passed", async () => {
    let ms = 1_000_000;
    const kv = new MemoryKV({ now: () => ms });
    await kv.set("k", "v", 10);

    ms += 9_999;
    expect(await kv.get("k")).toBe("v");

    ms += 1;
    expect(await kv.get("k")).toBeNull();
    expect(kv.size).toBe(0);
  });

  it("overwrites the value and restarts the TTL on set", async () => {
    let ms = 0;
    const kv = new MemoryKV({ now: () => ms });
    await kv.set("k", "old", 10);
    ms += 8_000;
    await kv.set("k", "new", 10);
    ms += 8_000;
    expect(await kv.get("k")).toBe("new");
  });

  it("deletes without complaining about absent keys", async () => {
    const kv = new MemoryKV();
    await kv.set("k", "v", 60);
    await kv.del("k");
    await kv.del("k");
    expect(await kv.get("k")).toBeNull();
  });

  it("rejects a non-positive TTL - nothing is stored forever", () => {
    const kv = new MemoryKV();
    expect(() => kv.set("k", "v", 0)).toThrow(RangeError);
    expect(() => kv.set("k", "v", -1)).toThrow(RangeError);
  });

  it("counts operations so cost models can be asserted", async () => {
    const kv = new MemoryKV();
    await kv.set("k", "v", 60);
    await kv.get("k");
    await kv.get("missing");
    await kv.del("k");
    expect(kv.ops).toEqual({ get: 2, set: 1, del: 1 });
  });
});

describe("guarded", () => {
  const exploding: KV = {
    get: () => Promise.reject(new Error("upstash down")),
    set: () => Promise.reject(new Error("upstash down")),
    del: () => Promise.reject(new Error("upstash down")),
  };

  it("turns a failing store into a cold cache, not an error", async () => {
    const health = newHealth();
    const kv = guarded(exploding, health);

    expect(await kv.get("k")).toBeNull();
    await expect(kv.set("k", "v", 60)).resolves.toBeUndefined();
    await expect(kv.del("k")).resolves.toBeUndefined();

    expect(health.errors).toBe(3);
    expect(health.lastError).toBe("upstash down");
  });

  it("passes a healthy store straight through", async () => {
    const health = newHealth();
    const kv = guarded(new MemoryKV(), health);
    await kv.set("k", "v", 60);
    expect(await kv.get("k")).toBe("v");
    expect(health.errors).toBe(0);
  });
});
