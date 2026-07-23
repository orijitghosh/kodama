/**
 * `GET /healthz` - the budget dashboard's data source (SPEC-SERVICE §1, §3).
 *
 * Two rules for what may appear in this body:
 *
 * 1. No user data. Not a login, not a count. This endpoint is public and
 *    uncacheable, so anything personal here is a leak with a URL.
 * 2. No summed budgets. GitHub rate-limits per account, not per token
 *    (SPIKE-GRAPHQL §3). Two tokens on one account share one 5 000-point
 *    budget, so adding their `remaining` values reports 10 000 points that do
 *    not exist and hides exhaustion until it happens.
 *
 * Tokens never appear: `PatPool.stats()` returns positional indices, not the
 * strings.
 */

import type { Container } from "./app.js";
import type { PoolStats } from "./github/pool.js";
import { METER_MIN_SAMPLES } from "./meter.js";
import type { MeterSnapshot } from "./meter.js";

/** Alert threshold from SPEC-SERVICE §3: 70% of a budget consumed. */
export const ALERT_AT_CONSUMED = 0.7;

/**
 * The error-rate alert threshold (IMPLEMENTATION 6.2). A quarter of a full
 * window degraded is far above a healthy baseline of ~zero: image-route
 * failures are `comeBack`/`broken` (route.ts), which in normal operation do not
 * happen. It is set well below 0.7 on purpose - unlike a token budget, where
 * 70% consumed is still 30% of headroom, a 25% error rate is already an
 * incident. Waits for `METER_MIN_SAMPLES` so a cold instance's first few
 * renders cannot trip it.
 */
export const ERROR_RATE_ALERT = 0.25;

export interface HealthBody {
  ok: boolean;
  engine: string;
  uptimeS: number;
  kv: { kind: string; errors: number; lastError: string | null };
  github: { tokens: number; spent: number; pool: PoolStats[] };
  /** Rolling image-route error rate on this warm instance (meter.ts). */
  errorRate: MeterSnapshot;
  /** Populated when any single token is past the alert threshold. */
  alerts: string[];
}

export function healthBody(c: Container, engineVersion: string, nowMs: number): HealthBody {
  const pool = c.pool.stats();
  const errorRate = c.meter.snapshot();
  const alerts: string[] = [];

  for (const slot of pool) {
    if (slot.benched) alerts.push(`token ${String(slot.index)} benched until ${slot.resetAt ?? "?"}`);
    if (slot.remaining !== null && slot.limit !== null && slot.limit > 0) {
      const consumed = 1 - slot.remaining / slot.limit;
      if (consumed >= ALERT_AT_CONSUMED) {
        alerts.push(`token ${String(slot.index)} at ${String(Math.round(consumed * 100))}% consumed`);
      }
    }
  }
  if (pool.length === 0) alerts.push("no PATs configured");
  if (c.kvKind === "memory") alerts.push("KV is in-process; cache does not survive a cold start");
  if (errorRate.samples >= METER_MIN_SAMPLES && errorRate.fraction >= ERROR_RATE_ALERT) {
    alerts.push(
      `image error rate ${String(Math.round(errorRate.fraction * 100))}% ` +
        `over last ${String(errorRate.samples)} renders`,
    );
  }

  return {
    // A benched token or a warm-cache warning is not "down": the service still
    // draws trees. `ok` goes false only when nothing can be served at all.
    ok: pool.length > 0 && !pool.every((slot) => slot.benched),
    engine: engineVersion,
    uptimeS: Math.max(0, Math.round((nowMs - c.startedAt) / 1000)),
    kv: { kind: c.kvKind, errors: c.health.errors, lastError: c.health.lastError },
    github: { tokens: pool.length, spent: c.client.spent, pool },
    errorRate,
    alerts,
  };
}

export function handleHealth(c: Container, engineVersion: string, nowMs = Date.now()): Response {
  const body = healthBody(c, engineVersion, nowMs);
  return new Response(JSON.stringify(body, null, 2), {
    // 200 even when degraded: an uptime checker should page on unreachable,
    // and a human should read `alerts` for everything short of that.
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // The whole point is the current number. A cached one is a lie.
      "cache-control": "no-store",
    },
  });
}
