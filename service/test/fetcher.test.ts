import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Fetcher, yearWindows } from "../src/fetcher.js";
import { GitHubClient, GitHubError } from "../src/github/client.js";
import { PatPool, PoolExhaustedError } from "../src/github/pool.js";
import { ColdBudgetError, KvColdGuard } from "../src/guard.js";
import { guarded, historyKey, MemoryKV, missKey, newHealth, yearKey } from "../src/kv/index.js";
import { clearSecrets } from "../src/log.js";
import { fakeGitHub } from "./helpers/fake-github.js";
import type { FakeAccount, FakeGitHubOptions } from "./helpers/fake-github.js";
import { runOfDays } from "./helpers/responses.js";

const TODAY = "2026-07-21";

const HANA: FakeAccount = {
  login: "hana",
  createdAt: "2024-03-04",
  days: runOfDays(TODAY, 30, 3),
  reviewsPerYear: 5,
  mergedTotal: 12,
  stars: [40, 2],
  languages: [{ name: "Rust", size: 900 }],
};

function build(options: Partial<FakeGitHubOptions> & { accounts?: FakeAccount[] } = {}) {
  const github = fakeGitHub({ accounts: [HANA], ...options });
  const kv = new MemoryKV();
  const pool = new PatPool(["ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]);
  const client = new GitHubClient({ pool, fetchImpl: github.fetchImpl });
  return { github, kv, pool, client, fetcher: new Fetcher({ kv, client }) };
}

beforeEach(() => {
  clearSecrets();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("yearWindows", () => {
  it("aligns to the account anniversary, not the calendar year", () => {
    const windows = yearWindows("2024-03-04", "2026-07-21");
    expect(windows).toHaveLength(3);
    expect(windows[0]!.from).toBe("2024-03-04T00:00:00Z");
    expect(windows[0]!.to).toBe("2025-03-03T23:59:59Z");
    expect(windows[2]!.to).toBe("2026-07-21T23:59:59Z");
  });

  it("gives an account created today a single window", () => {
    expect(yearWindows(TODAY, TODAY)).toHaveLength(1);
  });

  it("covers every day between creation and today with no gaps", () => {
    const windows = yearWindows("2009-12-20", TODAY);
    expect(windows).toHaveLength(17);
    for (let i = 1; i < windows.length; i += 1) {
      const previousEnd = windows[i - 1]!.to.slice(0, 10);
      const thisStart = windows[i]!.from.slice(0, 10);
      const gapDays = (Date.parse(thisStart) - Date.parse(previousEnd)) / 86_400_000;
      expect(gapDays).toBe(1);
    }
  });
});

describe("cold fetch", () => {
  it("issues identity once and one query per account year", async () => {
    const { fetcher, github } = build();
    const result = await fetcher.fetch("hana", TODAY);

    expect(result.source).toBe("refreshed");
    expect(github.countOf("Identity")).toBe(1);
    expect(github.countOf("Counts")).toBe(1);
    expect(github.countOf("Stars")).toBe(1);
    expect(github.countOf("Languages")).toBe(1);
    expect(github.countOf("Year")).toBe(3);
  });

  it("asks for identity before anything else (the windows depend on it)", async () => {
    const { fetcher, github } = build();
    await fetcher.fetch("hana", TODAY);
    expect(github.calls[0]!.operation).toBe("Identity");
  });

  it("assembles the split responses into one usable history", async () => {
    const { fetcher } = build();
    const { history } = await fetcher.fetch("hana", TODAY);

    expect(history.login).toBe("hana");
    expect(history.createdAt).toBe("2024-03-04");
    expect(history.totals.commits).toBe(90);
    expect(history.totals.starsReceived).toBe(42);
    expect(history.totals.prsMerged).toBe(12);
    expect(history.languages).toEqual([{ name: "Rust", share: 1 }]);
    expect(history.streak.current).toBe(30);
  });

  it("counts stars once, though languages come from a second repo query", async () => {
    const { fetcher } = build({
      accounts: [{ ...HANA, stars: [100, 50], languages: [{ name: "Go", size: 10 }] }],
    });
    const { history } = await fetcher.fetch("hana", TODAY);
    // The language query's nodes are assembled with zero stars precisely so
    // the top repos are not counted twice.
    expect(history.totals.starsReceived).toBe(150);
  });

  it("uses the canonical login from GitHub, not the caller's casing", async () => {
    const { fetcher, kv } = build();
    const { history } = await fetcher.fetch("HaNa", TODAY);
    expect(history.login).toBe("hana");
    expect(await kv.get(historyKey("hana"))).not.toBeNull();
  });
});

describe("caching", () => {
  it("serves a same-day history from KV without touching GitHub", async () => {
    const { fetcher, github, kv } = build();
    await fetcher.fetch("hana", TODAY);
    const cold = github.calls.length;

    const second = await fetcher.fetch("hana", TODAY);
    expect(second.source).toBe("fresh");
    expect(github.calls.length).toBe(cold);
    expect(kv.ops.get).toBeGreaterThan(0);
  });

  it("refreshes once the UTC day rolls over", async () => {
    const { fetcher, github } = build();
    await fetcher.fetch("hana", TODAY);
    const cold = github.countOf("Identity");

    const next = await fetcher.fetch("hana", "2026-07-22");
    expect(next.source).toBe("refreshed");
    expect(github.countOf("Identity")).toBe(cold + 1);
  });

  it("re-reads closed account years from KV instead of GitHub", async () => {
    const { fetcher, github } = build();
    await fetcher.fetch("hana", TODAY);
    const coldYears = github.countOf("Year");

    await fetcher.fetch("hana", "2026-07-22");
    // Only the open year is re-fetched; the two closed ones came from KV.
    expect(github.countOf("Year") - coldYears).toBe(1);
  });

  it("never caches the year still in progress", async () => {
    const { fetcher, kv } = build();
    await fetcher.fetch("hana", TODAY);
    expect(await kv.get(yearKey("hana", 0))).not.toBeNull();
    expect(await kv.get(yearKey("hana", 2))).toBeNull();
  });

  it("treats a corrupt cache entry as a miss and drops it", async () => {
    const { fetcher, kv, github } = build();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await kv.set(historyKey("hana"), "{not json", 60);

    const result = await fetcher.fetch("hana", TODAY);
    expect(result.source).toBe("refreshed");
    expect(github.countOf("Identity")).toBe(1);
  });

  it("treats a future schema version as a miss", async () => {
    const { fetcher, kv } = build();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await kv.set(historyKey("hana"), JSON.stringify({ v: 2, login: "hana" }), 60);
    await expect(fetcher.fetch("hana", TODAY)).resolves.toMatchObject({ source: "refreshed" });
  });

  it("still serves when the store is dead end to end", async () => {
    const github = fakeGitHub({ accounts: [HANA] });
    const pool = new PatPool(["ghp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);
    const client = new GitHubClient({ pool, fetchImpl: github.fetchImpl });
    const health = newHealth();
    const dead = guarded(
      {
        get: () => Promise.reject(new Error("kv down")),
        set: () => Promise.reject(new Error("kv down")),
        del: () => Promise.reject(new Error("kv down")),
        incr: () => Promise.reject(new Error("kv down")),
      },
      health,
    );

    const result = await new Fetcher({ kv: dead, client }).fetch("hana", TODAY);
    expect(result.source).toBe("refreshed");
    expect(health.errors).toBeGreaterThan(0);
  });
});

describe("single-flight", () => {
  it("collapses concurrent cold requests into one fetch", async () => {
    const { fetcher, github } = build();
    const results = await Promise.all([
      fetcher.fetch("hana", TODAY),
      fetcher.fetch("hana", TODAY),
      fetcher.fetch("hana", TODAY),
    ]);
    expect(results.map((r) => r.source)).toEqual(["refreshed", "refreshed", "refreshed"]);
    expect(github.countOf("Identity")).toBe(1);
  });

  it("keys on the login, so two users still fetch independently", async () => {
    const other: FakeAccount = { ...HANA, login: "kaze" };
    const { fetcher, github } = build({ accounts: [HANA, other] });
    await Promise.all([fetcher.fetch("hana", TODAY), fetcher.fetch("kaze", TODAY)]);
    expect(github.countOf("Identity")).toBe(2);
  });
});

describe("failure paths", () => {
  it("serves the stale copy when GitHub fails and KV has one", async () => {
    const { fetcher, kv, client } = build();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await fetcher.fetch("hana", TODAY);

    const broken = fakeGitHub({ accounts: [HANA], failWith: { Identity: 500 } });
    const brokenFetcher = new Fetcher({
      kv,
      client: new GitHubClient({
        pool: new PatPool(["ghp_cccccccccccccccccccccccccccccccccccc"]),
        fetchImpl: broken.fetchImpl,
      }),
    });

    const result = await brokenFetcher.fetch("hana", "2026-07-22");
    expect(result.source).toBe("stale");
    expect(result.history.fetchedAt).toBe(TODAY);
    expect(client).toBeDefined();
  });

  it("throws when GitHub fails and there is nothing cached", async () => {
    const { fetcher } = build({ failWith: { Identity: 500 } });
    await expect(fetcher.fetch("hana", TODAY)).rejects.toThrow(GitHubError);
  });

  it("reports an unknown user as notFound, not as a server error", async () => {
    const { fetcher } = build();
    await expect(fetcher.fetch("nobody", TODAY)).rejects.toMatchObject({ kind: "notFound" });
  });

  it("asks GitHub about a nonexistent login once, then remembers", async () => {
    // The budget-drain vector: invented names are free to generate and each one
    // used to cost a query. The second ask must not reach GitHub at all.
    const { fetcher, github, kv } = build();

    await expect(fetcher.fetch("nobody", TODAY)).rejects.toMatchObject({ kind: "notFound" });
    const spent = github.calls.length;
    expect(spent).toBeGreaterThan(0);
    expect(await kv.get(missKey("nobody"))).toBe(TODAY);

    await expect(fetcher.fetch("NoBody", TODAY)).rejects.toMatchObject({ kind: "notFound" });
    expect(github.calls.length, "the negative entry is case-insensitive").toBe(spent);
  });

  it("does not remember a name it never asked about", async () => {
    const { fetcher, kv } = build({ failWith: { Identity: 500 } });
    await expect(fetcher.fetch("hana", TODAY)).rejects.toThrow(GitHubError);
    expect(await kv.get(missKey("hana"))).toBeNull();
  });

  it("prefers a stale copy over a fresh notFound, and records nothing", async () => {
    // A rename or a deletion should keep drawing the tree we have rather than
    // burning the login into the negative cache.
    const { fetcher, kv } = build();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await fetcher.fetch("hana", TODAY);

    const gone = fakeGitHub({ accounts: [] });
    const goneFetcher = new Fetcher({
      kv,
      client: new GitHubClient({
        pool: new PatPool(["ghp_dddddddddddddddddddddddddddddddddddd"]),
        fetchImpl: gone.fetchImpl,
      }),
    });

    await expect(goneFetcher.fetch("hana", "2026-07-22")).resolves.toMatchObject({
      source: "stale",
    });
    expect(await kv.get(missKey("hana"))).toBeNull();
  });

  it("classifies a 401 as unauthorized and benches the token", async () => {
    const { fetcher, pool } = build({ failWith: { Identity: 401 } });
    await expect(fetcher.fetch("hana", TODAY)).rejects.toMatchObject({ kind: "unauthorized" });
    expect(pool.stats()[0]!.benched).toBe(true);
  });

  it("classifies a 403 as rate limited", async () => {
    const { fetcher } = build({ failWith: { Identity: 403 } });
    await expect(fetcher.fetch("hana", TODAY)).rejects.toMatchObject({ kind: "rateLimited" });
  });

  it("benches a rate-limited token only until the reset it names", async () => {
    const now = Date.parse("2026-07-21T12:00:00Z");
    const github = fakeGitHub({
      accounts: [HANA],
      failWith: { Identity: 403 },
      failHeaders: { "x-ratelimit-reset": String(Math.floor((now + 120_000) / 1000)) },
    });
    let clock = now;
    const pool = new PatPool(["ghp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"], { now: () => clock });
    const fetcher = new Fetcher({
      kv: new MemoryKV(),
      client: new GitHubClient({ pool, fetchImpl: github.fetchImpl }),
    });

    await expect(fetcher.fetch("hana", TODAY)).rejects.toMatchObject({ kind: "rateLimited" });
    expect(pool.stats()[0]!.benched).toBe(true);

    // Two minutes on, the token is back. A 403 that was about speed must not
    // cost the rest of the hour - that is capacity gone during a spike.
    clock = now + 121_000;
    expect(pool.stats()[0]!.benched).toBe(false);
  });

  it("believes a retry-after in seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-21T12:00:00Z"));
    try {
      const github = fakeGitHub({
        accounts: [HANA],
        failWith: { Identity: 429 },
        failHeaders: { "retry-after": "45" },
      });
      const pool = new PatPool(["ghp_cccccccccccccccccccccccccccccccccccc"]);
      const fetcher = new Fetcher({
        kv: new MemoryKV(),
        client: new GitHubClient({ pool, fetchImpl: github.fetchImpl }),
      });

      await expect(fetcher.fetch("hana", TODAY)).rejects.toMatchObject({ kind: "rateLimited" });
      expect(pool.stats()[0]!.benched).toBe(true);

      vi.setSystemTime(Date.parse("2026-07-21T12:00:46Z"));
      expect(pool.stats()[0]!.benched).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops spending on a token GitHub rejected on the primary limit", async () => {
    const now = Date.parse("2026-07-21T12:00:00Z");
    const github = fakeGitHub({
      accounts: [HANA],
      graphqlError: { Identity: { message: "API rate limit exceeded", type: "RATE_LIMITED" } },
      failHeaders: { "x-ratelimit-reset": String(Math.floor((now + 600_000) / 1000)) },
    });
    const pool = new PatPool(["ghp_ffffffffffffffffffffffffffffffffffff"], { now: () => now });
    const fetcher = new Fetcher({
      kv: new MemoryKV(),
      client: new GitHubClient({ pool, fetchImpl: github.fetchImpl }),
    });

    // The rejection arrives as a 200 with no `data`, so there is no quota reading
    // to bench on - only the headers.
    await expect(fetcher.fetch("hana", TODAY)).rejects.toMatchObject({ kind: "rateLimited" });
    expect(pool.stats()[0]!.benched).toBe(true);

    // And the next caller costs GitHub nothing: refused before the round trip.
    const spent = github.calls.length;
    await expect(fetcher.fetch("hana", TODAY)).rejects.toBeInstanceOf(PoolExhaustedError);
    expect(github.calls.length).toBe(spent);
  });

  it("classifies a dropped connection as network", async () => {
    const { fetcher } = build({ networkError: true });
    await expect(fetcher.fetch("hana", TODAY)).rejects.toMatchObject({ kind: "network" });
  });

  it("surfaces pool exhaustion rather than pretending to fetch", async () => {
    const github = fakeGitHub({ accounts: [HANA], remaining: 1 });
    const pool = new PatPool(["ghp_dddddddddddddddddddddddddddddddddddd"], {
      now: () => Date.parse("2026-07-21T12:00:00Z"),
    });
    const client = new GitHubClient({ pool, fetchImpl: github.fetchImpl });
    const fetcher = new Fetcher({ kv: new MemoryKV(), client });

    // The first query succeeds and reports a nearly empty budget; the fan-out
    // behind it finds the token benched.
    await expect(fetcher.fetch("hana", TODAY)).rejects.toBeInstanceOf(PoolExhaustedError);
  });

  it("never lets a token reach a log line", async () => {
    const token = "ghp_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const github = fakeGitHub({ accounts: [HANA] });
    const kv = new MemoryKV();
    const client = new GitHubClient({
      pool: new PatPool([token]),
      fetchImpl: github.fetchImpl,
    });
    await new Fetcher({ kv, client }).fetch("hana", TODAY);

    const broken = fakeGitHub({ accounts: [HANA], failWith: { Identity: 500 } });
    await new Fetcher({
      kv,
      client: new GitHubClient({ pool: new PatPool([token]), fetchImpl: broken.fetchImpl }),
    }).fetch("hana", "2026-07-22");

    expect(spy).toHaveBeenCalled();
    for (const call of spy.mock.calls) {
      expect(String(call[0])).not.toContain(token);
      expect(String(call[0])).not.toContain("ghp_");
    }
  });
});

describe("the cold-fetch cap", () => {
  const guardFor = (kv: MemoryKV, cap: number) =>
    new KvColdGuard({ kv, cap, now: () => Date.parse("2026-07-21T14:00:00Z") });

  it("charges a cold fetch and refuses past the allowance", async () => {
    const github = fakeGitHub({ accounts: [HANA, { ...HANA, login: "kaze" }] });
    const kv = new MemoryKV();
    const client = new GitHubClient({
      pool: new PatPool(["ghp_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"]),
      fetchImpl: github.fetchImpl,
    });
    const fetcher = new Fetcher({ kv, client, guard: guardFor(kv, 1) });

    await expect(fetcher.fetch("hana", TODAY, "abc123")).resolves.toMatchObject({
      source: "refreshed",
    });
    const spent = github.calls.length;

    await expect(fetcher.fetch("kaze", TODAY, "abc123")).rejects.toBeInstanceOf(ColdBudgetError);
    expect(github.calls.length, "the refusal happens before any query").toBe(spent);
  });

  it("does not charge a badge the cache can already answer", async () => {
    const github = fakeGitHub({ accounts: [HANA] });
    const kv = new MemoryKV();
    const client = new GitHubClient({
      pool: new PatPool(["ghp_ffffffffffffffffffffffffffffffffffff"]),
      fetchImpl: github.fetchImpl,
    });
    const fetcher = new Fetcher({ kv, client, guard: guardFor(kv, 1) });

    await fetcher.fetch("hana", TODAY, "abc123");
    // Warm from here on, so a README hit a thousand times over costs nothing
    // against the cap even though the cap is one.
    for (let i = 0; i < 5; i += 1) {
      await expect(fetcher.fetch("hana", TODAY, "abc123")).resolves.toMatchObject({
        source: "fresh",
      });
    }
    expect(kv.ops.incr).toBe(1);
  });

  it("still serves a stale tree to a client over its allowance", async () => {
    const github = fakeGitHub({ accounts: [HANA] });
    const kv = new MemoryKV();
    const client = new GitHubClient({
      pool: new PatPool(["ghp_gggggggggggggggggggggggggggggggggggg"]),
      fetchImpl: github.fetchImpl,
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await new Fetcher({ kv, client }).fetch("hana", TODAY);
    const capped = new Fetcher({ kv, client, guard: guardFor(kv, 0) });

    // A refused refresh is a failed fetch, and the failed-fetch path already
    // knows what to do when KV holds yesterday's copy.
    await expect(capped.fetch("hana", "2026-07-22", "abc123")).resolves.toMatchObject({
      source: "stale",
    });
  });
});
