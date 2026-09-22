import { describe, expect, it } from "vitest";

import { clientOf, ColdBudgetError, KvColdGuard, networkOf } from "../src/guard.js";
import { coldKey, guarded, MemoryKV, newHealth } from "../src/kv/index.js";
import type { KV } from "../src/kv/index.js";

const HOUR_MS = 3_600_000;

/** A fixed moment mid-hour, so bucket arithmetic has something to round off. */
const NOW = Date.UTC(2026, 6, 21, 14, 37, 12);

function build(cap: number, now: () => number = () => NOW) {
  const kv = new MemoryKV({ now });
  return { kv, guard: new KvColdGuard({ kv, cap, now }) };
}

describe("the cold-fetch cap", () => {
  it("lets a client through up to its allowance and no further", async () => {
    const { guard } = build(3);

    for (let i = 0; i < 3; i += 1) {
      await expect(guard.charge("abc123")).resolves.toBeUndefined();
    }
    await expect(guard.charge("abc123")).rejects.toBeInstanceOf(ColdBudgetError);
  });

  it("counts each client separately", async () => {
    const { guard } = build(1);

    await guard.charge("aaaa");
    await expect(guard.charge("bbbb")).resolves.toBeUndefined();
    await expect(guard.charge("aaaa")).rejects.toBeInstanceOf(ColdBudgetError);
  });

  it("charges nothing when the caller has no client to name", async () => {
    const { kv, guard } = build(1);

    for (let i = 0; i < 5; i += 1) await guard.charge(null);
    expect(kv.ops.incr).toBe(0);
  });

  it("names the moment the bucket rolls, so the route can say when to come back", async () => {
    const { guard } = build(0);

    const err = await guard.charge("abc123").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ColdBudgetError);
    // The next whole hour after NOW, not an hour from NOW.
    expect((err as ColdBudgetError).retryAtMs).toBe(Math.floor(NOW / HOUR_MS) * HOUR_MS + HOUR_MS);
  });

  it("forgets a client when the hour rolls over", async () => {
    let now = NOW;
    const { guard } = build(1, () => now);

    await guard.charge("abc123");
    await expect(guard.charge("abc123")).rejects.toBeInstanceOf(ColdBudgetError);

    now += HOUR_MS;
    await expect(guard.charge("abc123")).resolves.toBeUndefined();
  });

  it("keys the counter by hour, so one client's buckets do not collide", async () => {
    const { kv, guard } = build(9);
    await guard.charge("abc123");

    const bucket = Math.floor(NOW / HOUR_MS);
    expect(await kv.get(coldKey("abc123", bucket))).toBe("1");
    expect(await kv.get(coldKey("abc123", bucket + 1))).toBeNull();
  });

  it("fails open when the store cannot count", async () => {
    // The failure mode that matters: Upstash down must not read as "everybody is
    // over their limit". `guarded` answers 0, and 0 means unknown.
    const health = newHealth();
    const dead: KV = {
      get: () => Promise.reject(new Error("kv down")),
      set: () => Promise.reject(new Error("kv down")),
      del: () => Promise.reject(new Error("kv down")),
      incr: () => Promise.reject(new Error("kv down")),
    };
    const guard = new KvColdGuard({ kv: guarded(dead, health), cap: 1, now: () => NOW });

    for (let i = 0; i < 10; i += 1) {
      await expect(guard.charge("abc123")).resolves.toBeUndefined();
    }
    expect(health.errors).toBe(10);
  });
});

describe("clientOf", () => {
  const withHeader = (value: string | null): Request =>
    new Request("https://kodama.example/hana.svg", {
      headers: value === null ? {} : { "x-forwarded-for": value },
    });

  it("charges the first hop, which is the only one the proxy did not append", () => {
    const one = clientOf(withHeader("203.0.113.7"));
    const chained = clientOf(withHeader("203.0.113.7, 70.41.3.18, 150.172.238.178"));
    expect(one).not.toBeNull();
    expect(chained).toBe(one);
  });

  it("keeps a hash, never an address (PRD privacy)", () => {
    const hash = clientOf(withHeader("203.0.113.7"));
    expect(hash).not.toBeNull();
    expect(hash).not.toContain("203");
    expect(hash).toMatch(/^[0-9a-f]{1,8}$/);
  });

  it("returns null with no header, and with an empty one", () => {
    expect(clientOf(withHeader(null))).toBeNull();
    expect(clientOf(withHeader("   "))).toBeNull();
  });

  it("charges an IPv6 /64 as one client, however many addresses it steps through", () => {
    const first = clientOf(withHeader("2001:db8:85a3:1::1"));
    expect(clientOf(withHeader("2001:db8:85a3:1:ffff:ffff:ffff:fffe"))).toBe(first);
    expect(clientOf(withHeader("2001:0DB8:85A3:0001:dead:beef:0:1"))).toBe(first);
    expect(clientOf(withHeader("2001:db8:85a3:2::1"))).not.toBe(first);
  });

  it("still tells two IPv4 addresses apart", () => {
    expect(clientOf(withHeader("203.0.113.7"))).not.toBe(clientOf(withHeader("203.0.113.8")));
  });
});

describe("networkOf", () => {
  it("leaves an IPv4 address as it is", () => {
    expect(networkOf("203.0.113.7")).toBe("203.0.113.7");
  });

  it("reduces an IPv6 address to its /64, in one canonical spelling", () => {
    expect(networkOf("2001:db8:85a3:1:2:3:4:5")).toBe("2001:db8:85a3:1::/64");
    expect(networkOf("2001:0db8:85a3:0001::5")).toBe("2001:db8:85a3:1::/64");
    expect(networkOf("2001:DB8:85A3:1::")).toBe("2001:db8:85a3:1::/64");
  });

  it("expands a compressed run that falls inside the prefix", () => {
    expect(networkOf("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(networkOf("2001:db8::1:2:3:4")).toBe("2001:db8:0:0::/64");
    expect(networkOf("::1")).toBe("0:0:0:0::/64");
  });

  it("drops a zone index", () => {
    expect(networkOf("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("counts an IPv4-mapped address as the IPv4 address it is", () => {
    expect(networkOf("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("gives a dotted tail the two groups it occupies", () => {
    expect(networkOf("64:ff9b::192.0.2.1")).toBe("64:ff9b:0:0::/64");
  });

  it("returns anything unparseable as given, so it is still counted", () => {
    for (const junk of ["1:2:3", "1::2::3", "1:2:3:4:5:6:7:8:9", "zz::1", "1:2:3:4:5:6:7::8"]) {
      expect(networkOf(junk), junk).toBe(junk);
    }
  });
});
