/**
 * The composition root (SPEC-SERVICE §1-3).
 *
 * Everything below this file takes its dependencies as arguments; this is the
 * one place that reads `process.env`. That keeps the request path testable
 * without a server and confines a port to another host to this file.
 *
 * The container is built once per process, not once per request. Vercel keeps a
 * warm function alive across invocations, and this state needs that lifetime:
 *
 *   - the PAT pool's bench marks (a token benched on request 1 must stay
 *     benched on request 2),
 *   - the single-flight map (a fresh map per request guards no stampede),
 *   - the KV error counter behind `/healthz`,
 *   - the error-rate meter, which needs a window wider than one render.
 *
 * None of it is correctness-critical if the process dies: a cold start re-learns
 * the bench from the next `rateLimit` reading, and the meter starts a fresh
 * window (meter.ts).
 */

import { Fetcher } from "./fetcher.js";
import { GitHubClient } from "./github/client.js";
import { PatPool } from "./github/pool.js";
import { guarded, newHealth, MemoryKV } from "./kv/index.js";
import type { KV, KvHealth } from "./kv/index.js";
import { upstashFromEnv } from "./kv/upstash.js";
import { warn } from "./log.js";
import { Meter } from "./meter.js";

export type KvKind = "upstash" | "memory";

export interface Container {
  fetcher: Fetcher;
  pool: PatPool;
  client: GitHubClient;
  health: KvHealth;
  kvKind: KvKind;
  /** Rolling image-route error rate; the only place a 200'd failure is counted. */
  meter: Meter;
  /** Process start, epoch ms - `/healthz` reports uptime, not wall clock. */
  startedAt: number;
  today: () => string;
}

/**
 * The request's UTC date, and the only clock the render path ever sees.
 *
 * Date-granularity is what makes the CDN cache correct by construction
 * (SPEC-SERVICE §2): within a cache window every requester renders the same
 * bytes, because the only time-varying input has day resolution.
 */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildContainer(env: Record<string, string | undefined> = process.env): Container {
  const tokens = (env["KODAMA_PATS"] ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  // A pool with no tokens is not a startup crash: it is a service that draws
  // "come back soon" until the env var is fixed. A crash-on-boot would take
  // out `/healthz`, the one endpoint that could tell you why.
  if (tokens.length === 0) warn("KODAMA_PATS is empty; every fetch will fail");

  const pool = new PatPool(tokens);
  const client = new GitHubClient({ pool });

  const health = newHealth();
  const upstash = upstashFromEnv(env);
  if (upstash === null) {
    warn("KV_REST_API_URL/TOKEN absent; falling back to in-process cache");
  }
  const kv: KV = guarded(upstash ?? new MemoryKV(), health);

  return {
    fetcher: new Fetcher({ kv, client }),
    pool,
    client,
    health,
    kvKind: upstash === null ? "memory" : "upstash",
    meter: new Meter(),
    startedAt: Date.now(),
    today: todayUtc,
  };
}

let shared: Container | null = null;

/** The per-process container. Built on first use, reused while warm. */
export function container(): Container {
  shared ??= buildContainer();
  return shared;
}

/** Tests and local scripts that want a clean process-level state. */
export function resetContainer(): void {
  shared = null;
}
