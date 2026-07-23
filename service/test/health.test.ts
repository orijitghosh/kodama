/**
 * `/healthz` is public and uncacheable, so the tests that matter most here are
 * the negative ones: no login, no token string, no summed budget.
 */

import { describe, expect, it, vi } from "vitest";

import { buildContainer, resetContainer } from "../src/app.js";
import { handleHealth, healthBody } from "../src/health.js";

const TOKEN_A = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "ghp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const ENV = {
  KODAMA_PATS: `${TOKEN_A},${TOKEN_B}`,
  KV_REST_API_URL: "https://eu1-example.upstash.io",
  KV_REST_API_TOKEN: "AX1sASQgZmFrZS10b2tlbi1mb3ItdGVzdHM=",
};

const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => undefined);

describe("the body", () => {
  it("reports per-token budgets and never their sum", () => {
    const c = buildContainer(ENV);
    c.pool.report(TOKEN_A, { cost: 1, limit: 5000, remaining: 4000, resetAt: "2026-07-21T18:00:00Z" });
    c.pool.report(TOKEN_B, { cost: 1, limit: 5000, remaining: 3999, resetAt: "2026-07-21T18:00:00Z" });

    const body = healthBody(c, "v1", Date.now());
    expect(body.github.pool).toHaveLength(2);
    expect(body.github.pool.map((s) => s.remaining)).toEqual([4000, 3999]);
    // Two tokens on one account share one budget. 7999 is a number that would
    // read as capacity and does not exist (SPIKE-GRAPHQL §3).
    expect(JSON.stringify(body)).not.toContain("7999");
  });

  it("never contains a token string", () => {
    const c = buildContainer(ENV);
    const serialized = JSON.stringify(healthBody(c, "v1", Date.now()));
    expect(serialized).not.toContain(TOKEN_A);
    expect(serialized).not.toContain(TOKEN_B);
    expect(serialized).not.toContain("ghp_");
    expect(serialized).not.toContain(ENV.KV_REST_API_TOKEN);
  });

  it("counts uptime from process start", () => {
    const c = buildContainer(ENV);
    expect(healthBody(c, "v1", c.startedAt + 90_000).uptimeS).toBe(90);
  });
});

describe("alerts", () => {
  it("fires at 70% consumed on any single token", () => {
    const c = buildContainer(ENV);
    c.pool.report(TOKEN_A, { cost: 1, limit: 5000, remaining: 1500, resetAt: "2026-07-21T18:00:00Z" });
    expect(healthBody(c, "v1", Date.now()).alerts).toContain("token 0 at 70% consumed");
  });

  it("stays quiet below the threshold", () => {
    const c = buildContainer(ENV);
    c.pool.report(TOKEN_A, { cost: 1, limit: 5000, remaining: 2000, resetAt: "2026-07-21T18:00:00Z" });
    expect(healthBody(c, "v1", Date.now()).alerts).toHaveLength(0);
  });

  it("names a benched token but stays ok while another can serve", () => {
    const c = buildContainer(ENV);
    c.pool.penalize(TOKEN_A, "auth");
    const body = healthBody(c, "v1", Date.now());
    expect(body.alerts.join(" ")).toContain("token 0 benched");
    expect(body.ok).toBe(true);
  });

  it("goes not-ok only when every token is benched", () => {
    const c = buildContainer(ENV);
    c.pool.penalize(TOKEN_A, "auth");
    c.pool.penalize(TOKEN_B, "auth");
    expect(healthBody(c, "v1", Date.now()).ok).toBe(false);
  });

  it("says so when the config is empty rather than crashing at boot", () => {
    quiet();
    const c = buildContainer({});
    const body = healthBody(c, "v1", Date.now());
    expect(body.ok).toBe(false);
    expect(body.alerts).toContain("no PATs configured");
  });

  it("warns that an in-process cache does not survive a cold start", () => {
    quiet();
    const c = buildContainer({ KODAMA_PATS: TOKEN_A });
    const body = healthBody(c, "v1", Date.now());
    expect(body.kv.kind).toBe("memory");
    expect(body.alerts.join(" ")).toContain("does not survive");
  });

  it("surfaces the KV error counter", () => {
    const c = buildContainer(ENV);
    c.health.errors = 4;
    c.health.lastError = "upstash GET failed: HTTP 503";
    expect(healthBody(c, "v1", Date.now()).kv).toMatchObject({ errors: 4, kind: "upstash" });
  });

  it("fires on a sustained image error rate, but only past the sample floor", () => {
    const c = buildContainer(ENV);
    // Nineteen degraded renders is over threshold by fraction but under the
    // sample floor: too little traffic to page on.
    for (let i = 0; i < 19; i += 1) c.meter.record(true);
    expect(healthBody(c, "v1", Date.now()).alerts.join(" ")).not.toContain("error rate");

    // Twenty degraded of twenty is 100%, well past 25% - now it fires.
    c.meter.record(true);
    const alerts = healthBody(c, "v1", Date.now()).alerts;
    expect(alerts.join(" ")).toContain("image error rate 100% over last 20 renders");
  });

  it("stays quiet when most renders are healthy", () => {
    const c = buildContainer(ENV);
    // A tenth degraded is below the 25% alert line: a real but tolerable trickle.
    for (let i = 0; i < 90; i += 1) c.meter.record(false);
    for (let i = 0; i < 10; i += 1) c.meter.record(true);
    const body = healthBody(c, "v1", Date.now());
    expect(body.errorRate).toMatchObject({ samples: 100, degraded: 10 });
    expect(body.alerts.join(" ")).not.toContain("error rate");
  });
});

describe("the response", () => {
  it("is JSON, 200, and never cached", async () => {
    const c = buildContainer(ENV);
    const response = handleHealth(c, "v1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(await response.text())).toMatchObject({ engine: "v1" });
  });

  it("stays 200 while degraded - a checker pages on unreachable, not on busy", () => {
    quiet();
    expect(handleHealth(buildContainer({}), "v1").status).toBe(200);
  });
});

describe("the process-level container", () => {
  it("is built once and reused, so a bench outlives a request", async () => {
    quiet();
    resetContainer();
    const { container } = await import("../src/app.js");
    expect(container()).toBe(container());
    resetContainer();
  });
});
