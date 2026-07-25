/**
 * The failure-injection suite (SPEC-SERVICE §4).
 *
 * Every row of the error table gets a test, and every test asserts the same
 * four things: 200, an SVG body, the right content type, under the size cap.
 * A README `<img>` renders a broken glyph for anything else, so "it failed
 * correctly" means "it still returned a picture".
 */

import { XMLParser } from "fast-xml-parser";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Fetcher } from "../src/fetcher.js";
import { KvColdGuard } from "../src/guard.js";
import { GitHubClient } from "../src/github/client.js";
import { PatPool } from "../src/github/pool.js";
import { MemoryKV } from "../src/kv/index.js";
import { Meter } from "../src/meter.js";
import { handleTree, SIZE_CAPS } from "../src/route.js";
import type { RouteDeps } from "../src/route.js";
import { byteLength } from "@kodama/engine";
import { fakeGitHub } from "./helpers/fake-github.js";
import type { FakeAccount, FakeGitHubOptions } from "./helpers/fake-github.js";
import { runOfDays } from "./helpers/responses.js";

const TODAY = "2026-07-21";

const HANA: FakeAccount = {
  login: "hana",
  createdAt: "2024-03-04",
  days: runOfDays(TODAY, 200, 4),
  mergedTotal: 12,
  stars: [40, 2],
  languages: [{ name: "Rust", size: 900 }],
};

function build(options: Partial<FakeGitHubOptions> = {}, kv = new MemoryKV()) {
  const github = fakeGitHub({ accounts: [HANA], ...options });
  const client = new GitHubClient({
    pool: new PatPool(["ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]),
    fetchImpl: github.fetchImpl,
  });
  return {
    github,
    kv,
    deps: { fetcher: new Fetcher({ kv, client }), today: () => TODAY },
  };
}

const get = (path: string, deps: RouteDeps) =>
  handleTree(new Request(`https://kodama.dev${path}`), deps);

const parser = new XMLParser({ ignoreAttributes: false });

/** The contract every response in this file must satisfy. */
async function expectValidSvg(response: Response, scale: keyof typeof SIZE_CAPS = "full") {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
  expect(response.headers.get("x-kodama-engine")).toBe("v1");

  const body = await response.text();
  expect(body.startsWith("<svg")).toBe(true);
  expect(body.endsWith("</svg>")).toBe(true);
  expect(body).not.toContain("NaN");
  expect(body).not.toContain("undefined");
  expect(() => parser.parse(body)).not.toThrow();
  expect(byteLength(body)).toBeLessThanOrEqual(SIZE_CAPS[scale]);
  return body;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the happy path", () => {
  it("serves a tree", async () => {
    const { deps } = build();
    const response = await get("/hana.svg", deps);
    const body = await expectValidSvg(response);
    expect(body).toContain("<title>");
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=21600, stale-while-revalidate=86400, max-age=3600",
    );
    expect(response.headers.get("x-kodama-state")).toBeNull();
    expect(response.headers.get("x-kodama-warn")).toBeNull();
  });

  it("honours theme, scale and locale", async () => {
    const { deps } = build();
    const response = await get("/hana.svg?theme=dusk&scale=compact&locale=ja", deps);
    await expectValidSvg(response, "compact");
    expect(response.headers.get("x-kodama-warn")).toBeNull();
  });

  it("stays under the cap at every scale", async () => {
    const { deps } = build();
    for (const scale of ["full", "compact", "strip", "button"] as const) {
      const response = await get(`/hana.svg?scale=${scale}`, deps);
      await expectValidSvg(response, scale);
    }
  });
});

describe("the error table (SPEC-SERVICE §4)", () => {
  it("invalid username → empty pot, no API spend", async () => {
    const { deps, github } = build();
    const body = await expectValidSvg(await get("/not_a_user!.svg", deps));
    expect(body).toContain("no seed here");
    expect(github.calls).toHaveLength(0);
  });

  it("refuses a name too long for GitHub without asking GitHub", async () => {
    const { deps, github } = build();
    await expectValidSvg(await get(`/${"a".repeat(40)}.svg`, deps));
    expect(github.calls).toHaveLength(0);
  });

  it("refuses a leading hyphen", async () => {
    const { deps, github } = build();
    await expectValidSvg(await get("/-nope.svg", deps));
    expect(github.calls).toHaveLength(0);
  });

  it("GitHub 404 → empty pot, user not found", async () => {
    const { deps } = build();
    const response = await get("/ghostuser.svg", deps);
    const body = await expectValidSvg(response);
    expect(body).toContain("user not found");
    expect(response.headers.get("x-kodama-state")).toBe("notFound");
  });

  it("API failure with a stale copy → the real tree, marked cached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const kv = new MemoryKV();
    await get("/hana.svg", build({}, kv).deps);

    const broken = build({ failWith: { Identity: 500 } }, kv);
    const response = await handleTree(new Request("https://kodama.dev/hana.svg"), {
      ...broken.deps,
      today: () => "2026-07-22",
    });
    const body = await expectValidSvg(response);
    expect(body).toContain("kd-stale");
    expect(body).toContain("cached from 2026-07-21");
    expect(response.headers.get("x-kodama-state")).toBe("stale");
  });

  it("API failure with nothing cached → seedling, come back soon", async () => {
    const { deps } = build({ failWith: { Identity: 500 } });
    const response = await get("/hana.svg", deps);
    const body = await expectValidSvg(response);
    expect(body).toContain("come back soon");
    expect(response.headers.get("x-kodama-state")).toBe("comeBack");
  });

  it("a dropped connection is a seedling, not a stack trace", async () => {
    const { deps } = build({ networkError: true });
    expect(await expectValidSvg(await get("/hana.svg", deps))).toContain("come back soon");
  });

  it("rate limiting is a seedling", async () => {
    const { deps } = build({ failWith: { Identity: 403 } });
    await expectValidSvg(await get("/hana.svg", deps));
  });

  it("an exhausted pool says when to come back", async () => {
    // No tokens is the same shape as every token benched, and the one failure
    // that knows a time: the pool benches until GitHub's reset.
    const github = fakeGitHub({ accounts: [HANA] });
    const benchedAt = Date.parse("2026-07-21T12:00:00Z");
    const client = new GitHubClient({
      pool: new PatPool([], { now: () => benchedAt }),
      fetchImpl: github.fetchImpl,
    });
    const deps: RouteDeps = {
      fetcher: new Fetcher({ kv: new MemoryKV(), client }),
      today: () => TODAY,
      nowMs: () => benchedAt + 60_000,
    };

    const response = await get("/hana.svg", deps);
    await expectValidSvg(response);
    expect(response.headers.get("x-kodama-state")).toBe("comeBack");
    // Benched an hour from `benchedAt`, asked a minute in.
    expect(response.headers.get("retry-after")).toBe("3540");
  });

  it("holds a client over its cold-fetch allowance until the hour rolls", async () => {
    const github = fakeGitHub({ accounts: [HANA] });
    const nowMs = Date.parse("2026-07-21T12:40:00Z");
    const kv = new MemoryKV({ now: () => nowMs });
    const client = new GitHubClient({
      pool: new PatPool(["ghp_hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh"]),
      fetchImpl: github.fetchImpl,
    });
    const deps: RouteDeps = {
      fetcher: new Fetcher({
        kv,
        client,
        guard: new KvColdGuard({ kv, cap: 0, now: () => nowMs }),
      }),
      today: () => TODAY,
      nowMs: () => nowMs,
    };

    const request = new Request("https://kodama.dev/hana.svg", {
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    const response = await handleTree(request, deps);

    await expectValidSvg(response);
    expect(response.headers.get("x-kodama-state")).toBe("comeBack");
    // 12:40 to 13:00 is twenty minutes.
    expect(response.headers.get("retry-after")).toBe("1200");
    expect(github.calls, "refused before any query").toHaveLength(0);
  });

  it("carries no retry-after when the failure knows no time", async () => {
    const { deps } = build({ failWith: { Identity: 500 } });
    const response = await get("/hana.svg", deps);
    await expectValidSvg(response);
    expect(response.headers.get("retry-after")).toBeNull();
  });

  it("a revoked token is a seedling", async () => {
    const { deps } = build({ failWith: { Identity: 401 } });
    await expectValidSvg(await get("/hana.svg", deps));
  });

  it("engine throw → seedling, and the history hash is logged for repro", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { deps } = build();

    const response = await handleTree(new Request("https://kodama.dev/hana.svg"), {
      ...deps,
      render: () => {
        throw new Error("cannot read properties of undefined (reading 'x')");
      },
    });
    const body = await expectValidSvg(response);
    expect(body).toContain("come back soon");
    expect(response.headers.get("x-kodama-state")).toBe("broken");

    const logged = spy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).toContain("historyHash=");
    // The history itself must never be in the log line - only its fingerprint.
    expect(logged).not.toContain("2026-W");
  });

  it("every failure caches softly, so a fix is visible within minutes", async () => {
    const cases = [
      await get("/not_a_user!.svg", build().deps),
      await get("/ghostuser.svg", build().deps),
      await get("/hana.svg", build({ failWith: { Identity: 500 } }).deps),
    ];
    for (const response of cases) {
      expect(response.headers.get("cache-control")).toBe(
        "public, s-maxage=300, stale-while-revalidate=3600, max-age=60",
      );
    }
  });

  it("draws the failure states in the requested theme and scale", async () => {
    const { deps } = build();
    const response = await get("/ghostuser.svg?theme=sakura&scale=button", deps);
    const body = await expectValidSvg(response, "button");
    // The small scales carry no text, but still carry the spoken title.
    expect(body).not.toContain("user not found</text>");
    expect(body).toContain("<title>");
  });
});

describe("option validation (SPEC-SERVICE §1)", () => {
  it("falls back and warns on an unknown value, still serving a tree", async () => {
    const { deps } = build();
    const response = await get("/hana.svg?theme=inkk&scale=huge", deps);
    await expectValidSvg(response);
    const warnHeader = response.headers.get("x-kodama-warn") ?? "";
    expect(warnHeader).toContain("theme=inkk");
    expect(warnHeader).toContain("scale=huge");
  });

  it("draws a pinned date instead of today", async () => {
    const { deps } = build();
    const body = await expectValidSvg(await get("/hana.svg?date=2026-05-01", deps));
    expect(body).toContain("2026-05-01");
    expect(body).not.toContain(TODAY);
    expect((await get("/hana.svg?date=2026-05-01", deps)).headers.get("x-kodama-warn")).toBeNull();
  });

  it("refuses a future date, because the history stops today", async () => {
    const { deps } = build();
    const response = await get("/hana.svg?date=2099-01-01", deps);
    const body = await expectValidSvg(response);
    expect(body).toContain(TODAY);
    expect(response.headers.get("x-kodama-warn") ?? "").toContain("2099-01-01");
  });

  it("falls back to today when the date is not a date", async () => {
    const { deps } = build();
    const response = await get("/hana.svg?date=lastTuesday", deps);
    const body = await expectValidSvg(response);
    expect(body).toContain(TODAY);
    expect(response.headers.get("x-kodama-warn") ?? "").toContain("lastTuesday");
  });

  it("ignores parameters it does not know", async () => {
    const { deps } = build();
    const response = await get("/hana.svg?utm_source=twitter&v=3", deps);
    await expectValidSvg(response);
    expect(response.headers.get("x-kodama-warn")).toBeNull();
  });

  it("does not reflect an unknown value into the image", async () => {
    const { deps } = build();
    const body = await expectValidSvg(await get("/hana.svg?theme=%3Cscript%3E", deps));
    expect(body).not.toContain("<script>");
  });

  it("rejects a path that is not a tree request", async () => {
    const { deps } = build();
    await expectValidSvg(await get("/hana.png", deps));
  });
});

describe("surviving the host's rewrite (D-032)", () => {
  // Vercel's rewrite does not hand the function `/hana.svg`; it hands it the
  // function path with the login moved into the query string. Every one of
  // these returned "no seed here" in the first staging deploy.
  it("reads the login out of the query when the path was rewritten", async () => {
    const { deps } = build();
    const response = await handleTree(
      new Request("https://kodama.dev/api/tree?user=hana"),
      deps,
    );
    const body = await expectValidSvg(response);
    expect(body).not.toContain("no seed here");
    expect(response.headers.get("x-kodama-state")).toBeNull();
  });

  it("keeps the options that rode along with the rewrite", async () => {
    const { deps } = build();
    const response = await handleTree(
      new Request("https://kodama.dev/api/tree?user=hana&scale=button&theme=dusk"),
      deps,
    );
    await expectValidSvg(response, "button");
    // `user` is consumed by the rewrite, not a render option - warning about
    // it would put a permanent X-Kodama-Warn on every deployed request.
    expect(response.headers.get("x-kodama-warn")).toBeNull();
  });

  it("renders the same bytes whether or not the host rewrote the path", async () => {
    const { deps } = build();
    const direct = await (await get("/hana.svg", deps)).text();
    const rewritten = await (
      await handleTree(new Request("https://kodama.dev/api/tree?user=hana"), deps)
    ).text();
    expect(rewritten).toBe(direct);
  });

  it("still validates a login that arrived by query string", async () => {
    const { deps, github } = build();
    const body = await expectValidSvg(
      await handleTree(new Request("https://kodama.dev/api/tree?user=not_a_user!"), deps),
    );
    expect(body).toContain("no seed here");
    expect(github.calls).toHaveLength(0);
  });

  it("cannot be tricked into a path separator by the query string", async () => {
    const { deps, github } = build();
    await expectValidSvg(
      await handleTree(new Request("https://kodama.dev/api/tree?user=a/../hana"), deps),
    );
    expect(github.calls).toHaveLength(0);
  });
});

describe("the error-rate meter (IMPLEMENTATION 6.2)", () => {
  // The route 200s every failure, so the meter is the only place a failure is
  // counted. These assert the classification: only *our* failures degrade.

  it("does not count a served tree as degraded", async () => {
    const meter = new Meter();
    await handleTree(new Request("https://kodama.dev/hana.svg"), { ...build().deps, meter });
    expect(meter.snapshot()).toMatchObject({ samples: 1, degraded: 0 });
  });

  it("does not count an invalid name - the user's error, not ours", async () => {
    const meter = new Meter();
    await handleTree(new Request("https://kodama.dev/not_a_user!.svg"), { ...build().deps, meter });
    expect(meter.snapshot()).toMatchObject({ samples: 1, degraded: 0 });
  });

  it("does not count a genuine 404 - the account simply does not exist", async () => {
    const meter = new Meter();
    await handleTree(new Request("https://kodama.dev/ghostuser.svg"), { ...build().deps, meter });
    expect(meter.snapshot()).toMatchObject({ samples: 1, degraded: 0 });
  });

  it("counts a fetch we could not complete as degraded", async () => {
    const meter = new Meter();
    const { deps } = build({ failWith: { Identity: 500 } });
    await handleTree(new Request("https://kodama.dev/hana.svg"), { ...deps, meter });
    expect(meter.snapshot()).toMatchObject({ samples: 1, degraded: 1 });
  });

  it("does not count a served-stale image - that is success by design", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const kv = new MemoryKV();
    await get("/hana.svg", build({}, kv).deps);
    const meter = new Meter();
    const broken = build({ failWith: { Identity: 500 } }, kv);
    await handleTree(new Request("https://kodama.dev/hana.svg"), {
      ...broken.deps,
      today: () => "2026-07-22",
      meter,
    });
    expect(meter.snapshot()).toMatchObject({ samples: 1, degraded: 0 });
  });

  it("counts an engine throw as degraded", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const meter = new Meter();
    await handleTree(new Request("https://kodama.dev/hana.svg"), {
      ...build().deps,
      render: () => {
        throw new Error("boom");
      },
      meter,
    });
    expect(meter.snapshot()).toMatchObject({ samples: 1, degraded: 1 });
  });
});

describe("cache behaviour", () => {
  it("serves the second request without touching GitHub", async () => {
    const { deps, github } = build();
    await get("/hana.svg", deps);
    const cold = github.calls.length;
    await get("/hana.svg?theme=dusk", deps);
    expect(github.calls.length).toBe(cold);
  });

  it("is byte-identical for the same request on the same day", async () => {
    const { deps } = build();
    const a = await (await get("/hana.svg", deps)).text();
    const b = await (await get("/hana.svg", deps)).text();
    expect(a).toBe(b);
  });
});
