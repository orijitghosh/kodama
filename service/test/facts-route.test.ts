/**
 * `GET /api/<user>.json` (SPEC-SERVICE §1, D-034).
 *
 * The image route's rule is "200 with a picture, always". This route's rule is
 * the opposite and the tests exist to hold the line: a `fetch()` caller can
 * only branch on a status code, so a missing user has to be a 404 and an
 * outage has to be a 503.
 */

import { describe, expect, it } from "vitest";

import { Fetcher } from "../src/fetcher.js";
import { ENGINE_VERSION } from "../src/route.js";
import { handleFacts } from "../src/facts-route.js";
import type { FactsBody, FactsError } from "../src/facts-route.js";
import { GitHubClient } from "../src/github/client.js";
import { PatPool } from "../src/github/pool.js";
import { MemoryKV } from "../src/kv/index.js";
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
  return { github, kv, deps: { fetcher: new Fetcher({ kv, client }), today: () => TODAY } };
}

const get = (path: string, deps: FactsDepsLike, init?: RequestInit) =>
  handleFacts(new Request(`https://kodama.dev${path}`, init), deps);

interface FactsDepsLike {
  fetcher: Fetcher;
  today: () => string;
}

describe("handleFacts", () => {
  it("answers with facts, receipts and the history they came from", async () => {
    const { deps } = build();
    const response = await get("/api/hana.json", deps);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");

    const body = (await response.json()) as FactsBody;
    expect(body.v).toBe(1);
    expect(body.engine).toBe(ENGINE_VERSION);
    expect(body.login).toBe("hana");
    expect(body.date).toBe(TODAY);
    expect(body.stale).toBe(false);
    expect(body.facts.login).toBe("hana");
    expect(body.history.v).toBe(1);
    expect(body.receipts.length).toBeGreaterThan(0);
  });

  it("every receipt names an element, a value and a reason", async () => {
    const { deps } = build();
    const body = (await (await get("/api/hana.json", deps)).json()) as FactsBody;

    for (const receipt of body.receipts) {
      expect(receipt.target.startsWith("kd-")).toBe(true);
      expect(receipt.label).not.toBe("");
      expect(receipt.value).not.toBe("");
      expect(receipt.provenance).not.toBe("");
    }
  });

  it("is readable from any origin, because everything in it is already public", async () => {
    const { deps } = build();
    const response = await get("/api/hana.json", deps);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("answers a preflight without spending anything", async () => {
    const { github, deps } = build();
    const response = await get("/api/hana.json", deps, { method: "OPTIONS" });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
    expect(github.calls.length).toBe(0);
  });

  it("caches a good answer for the same window as the image", async () => {
    const { deps } = build();
    const response = await get("/api/hana.json", deps);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=21600, stale-while-revalidate=86400, max-age=3600",
    );
  });

  // --- the part that differs from the image route -------------------------

  it("404s an account that does not exist", async () => {
    const { deps } = build({ accounts: [] });
    const response = await get("/api/nobody.json", deps);

    expect(response.status).toBe(404);
    const body = (await response.json()) as FactsError;
    expect(body.error).toBe("notFound");
  });

  it("400s a name GitHub could never issue, before spending a request", async () => {
    const { github, deps } = build();
    const response = await get("/api/-nope.json", deps);

    expect(response.status).toBe(400);
    expect(((await response.json()) as FactsError).error).toBe("invalidLogin");
    expect(github.calls.length).toBe(0);
  });

  it("503s when GitHub is down and nothing is cached", async () => {
    const { deps } = build({ failWith: { Identity: 500 } });
    const response = await get("/api/hana.json", deps);

    expect(response.status).toBe(503);
    expect(((await response.json()) as FactsError).error).toBe("unavailable");
  });

  it("caches a failure softly, so a fixed typo is not frozen at the edge", async () => {
    const { deps } = build({ accounts: [] });
    const response = await get("/api/nobody.json", deps);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=3600, max-age=60",
    );
  });

  it("serves the copy in hand and says so when GitHub fails", async () => {
    const kv = new MemoryKV();
    const warm = build({}, kv);
    await get("/api/hana.json", warm.deps);

    // Same store, a day later, with GitHub refusing.
    const cold = build({ failWith: { Identity: 500 } }, kv);
    const response = await handleFacts(new Request("https://kodama.dev/api/hana.json"), {
      fetcher: cold.deps.fetcher,
      today: () => "2026-07-22",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as FactsBody;
    expect(body.stale).toBe(true);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
  });

  // --- the rewrite, which cost an outage once already (D-032 addendum) -----

  it("accepts the shape Vercel actually delivers", async () => {
    const { deps } = build();
    const rewritten = await get("/api/facts?user=hana", deps);

    expect(rewritten.status).toBe(200);
    expect(((await rewritten.json()) as FactsBody).login).toBe("hana");
  });

  it("refuses a login smuggled through the query as a path", async () => {
    const { github, deps } = build();
    const response = await get("/api/facts?user=hana%2F..%2Fadmin", deps);

    expect(response.status).toBe(400);
    expect(github.calls.length).toBe(0);
  });

  it("honours the locale the image would have used", async () => {
    const { deps } = build();
    const body = (await (await get("/api/hana.json?locale=ja", deps)).json()) as FactsBody;
    const foliage = body.receipts.find((r) => r.target === "kd-foliage");
    expect(foliage?.label).toBe("葉: これまでのコミット");
  });

  it("never puts token material in the body", async () => {
    const { deps } = build();
    const text = await (await get("/api/hana.json", deps)).text();
    expect(text).not.toContain("ghp_");
    expect(text).not.toContain("github_pat_");
  });
});
