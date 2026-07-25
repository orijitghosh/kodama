/**
 * The Upstash store speaks a REST protocol we do not control, so these tests
 * pin the wire format we send and - more importantly - what happens when the
 * store answers badly. A cache that throws is fine; a cache that lies is not.
 */

import { describe, expect, it, vi } from "vitest";

import { guarded, newHealth } from "../src/kv/index.js";
import { UpstashKV, upstashFromEnv } from "../src/kv/upstash.js";

const URL_ = "https://eu1-example.upstash.io";
const TOKEN = "AX1sASQgZmFrZS10b2tlbi1mb3ItdGVzdHM=";

function fakeUpstash(reply: unknown, status = 200) {
  const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "null")),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return new Response(JSON.stringify(reply), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const store = (f: ReturnType<typeof fakeUpstash>) =>
  new UpstashKV({ url: URL_, token: TOKEN, fetchImpl: f.fetchImpl });

describe("the wire format", () => {
  it("sends GET as a command array with a bearer token", async () => {
    const f = fakeUpstash({ result: "{}" });
    await store(f).get("h1:hana");
    expect(f.calls[0]?.body).toEqual(["GET", "h1:hana"]);
    expect(f.calls[0]?.headers["authorization"]).toBe(`Bearer ${TOKEN}`);
  });

  it("sends SET with an EX expiry, because nothing is kept forever", async () => {
    const f = fakeUpstash({ result: "OK" });
    await store(f).set("h1:hana", "{}", 2_592_000);
    expect(f.calls[0]?.body).toEqual(["SET", "h1:hana", "{}", "EX", "2592000"]);
  });

  it("floors a fractional TTL rather than sending Redis a decimal", async () => {
    const f = fakeUpstash({ result: "OK" });
    await store(f).set("k", "v", 90.7);
    expect(f.calls[0]?.body).toEqual(["SET", "k", "v", "EX", "90"]);
  });

  it("sends INCR and EXPIRE as one pipelined round trip", async () => {
    // Two round trips on the cold path would make the cap cost what it protects.
    const f = fakeUpstash([{ result: 3 }, { result: 1 }]);
    expect(await store(f).incr("c1:abc:489", 7_200)).toBe(3);

    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.url).toBe(`${URL_}/pipeline`);
    expect(f.calls[0]?.body).toEqual([
      ["INCR", "c1:abc:489"],
      ["EXPIRE", "c1:abc:489", "7200"],
    ]);
  });

  it("throws when a pipelined command reports an error", async () => {
    const f = fakeUpstash([{ result: 1 }, { error: "ERR unknown command" }]);
    await expect(store(f).incr("c1:abc:489", 60)).rejects.toThrow(/EXPIRE|INCR/);
  });

  it("throws rather than inventing a count when the reply is not a number", async () => {
    const f = fakeUpstash([{ result: "three" }, { result: 1 }]);
    await expect(store(f).incr("c1:abc:489", 60)).rejects.toThrow(/no count/);
  });

  it("refuses a non-positive TTL without a round trip", async () => {
    const f = fakeUpstash({ result: "OK" });
    await expect(store(f).set("k", "v", 0)).rejects.toThrow(RangeError);
    expect(f.calls).toHaveLength(0);
  });

  it("tolerates a trailing slash on the injected URL", async () => {
    const f = fakeUpstash({ result: null });
    const kv = new UpstashKV({ url: `${URL_}/`, token: TOKEN, fetchImpl: f.fetchImpl });
    await kv.get("k");
    expect(f.fetchImpl).toHaveBeenCalledWith(URL_, expect.anything());
  });
});

describe("reading a reply", () => {
  it("reads a missing key as null, not as the string 'null'", async () => {
    expect(await store(fakeUpstash({ result: null })).get("nope")).toBeNull();
  });

  it("reads a non-string result as a miss", async () => {
    // Redis can answer with a number or an array; neither is a history.
    expect(await store(fakeUpstash({ result: 42 })).get("k")).toBeNull();
  });

  it("throws on an error reply so guarded() can count it", async () => {
    await expect(store(fakeUpstash({ error: "WRONGTYPE" })).get("k")).rejects.toThrow("WRONGTYPE");
  });

  it("throws on a non-2xx, without echoing the key", async () => {
    const f = fakeUpstash({}, 500);
    await expect(store(f).get("h1:someone")).rejects.toThrow(/HTTP 500/);
    await expect(store(f).get("h1:someone")).rejects.not.toThrow(/someone/);
  });
});

describe("failure containment (the reason the port exists)", () => {
  it("a dead store reads as a cache miss, and is counted", async () => {
    const health = newHealth();
    const kv = guarded(store(fakeUpstash({}, 503)), health);

    expect(await kv.get("h1:hana")).toBeNull();
    await kv.set("h1:hana", "{}", 60);
    await kv.del("h1:hana");

    expect(health.errors).toBe(3);
    expect(health.lastError).toContain("503");
  });
});

describe("credentials from the environment", () => {
  it("builds a store from the Marketplace-injected pair", () => {
    expect(
      upstashFromEnv({ KV_REST_API_URL: URL_, KV_REST_API_TOKEN: TOKEN }),
    ).toBeInstanceOf(UpstashKV);
  });

  it("returns null when either half is absent - local dev, not an error", () => {
    expect(upstashFromEnv({})).toBeNull();
    expect(upstashFromEnv({ KV_REST_API_URL: URL_ })).toBeNull();
    expect(upstashFromEnv({ KV_REST_API_TOKEN: TOKEN })).toBeNull();
  });

  it("treats an empty string as absent", () => {
    expect(upstashFromEnv({ KV_REST_API_URL: "", KV_REST_API_TOKEN: TOKEN })).toBeNull();
  });
});
