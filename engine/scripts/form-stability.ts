/**
 * How close do real accounts sit to the edge of their style?
 *
 * `selectForm` runs on every render, and the histories it reads refresh once a
 * UTC day (`isFresh` in the service is `fetchedAt >= today`). So an account whose
 * form sits a hair from a threshold can be drawn as one style today and another
 * tomorrow, with nothing visible having happened. That is the failure D-042's
 * restyle beats were meant to prevent, and the beats cannot be implemented
 * statelessly - five of the twelve rungs read `repoMix`, which is a current
 * snapshot with no time dimension, so it cannot be recomputed as of a past beat.
 * Storing the last form instead is what D-002 explicitly rejected.
 *
 * Rather than pick between a broken promise and a broken invariant, measure how
 * big the problem actually is. This perturbs every continuous input by a relative
 * epsilon and counts how many accounts change style - an account that flips under
 * a 1% wobble will flip in production the first time a day's commits move a ratio
 * by 1%.
 *
 * Reads the calibration cache, which is gitignored and stays that way (D-043).
 * Prints aggregates only: no login is ever written out.
 *
 *   pnpm --filter @kodama/engine form:stability -- <cache-dir> [date]
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { selectForm } from "../src/form.js";
import { treeFacts } from "../src/facts.js";
import type { NormalizedHistory } from "../src/types.js";

const cacheDir = process.argv[2];
const DATE = process.argv[3] ?? "2026-07-15";

if (cacheDir === undefined) {
  console.error("usage: form:stability -- <cache-dir> [date]");
  console.error("  <cache-dir> holds one NormalizedHistory JSON per account.");
  process.exit(1);
}

const histories: NormalizedHistory[] = readdirSync(cacheDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(cacheDir, f), "utf8")) as NormalizedHistory);

function formOf(h: NormalizedHistory): string {
  return selectForm({ facts: treeFacts(h, DATE), repoMix: h.repoMix });
}

/**
 * Scale every continuous input by `(1 + e)`.
 *
 * Counts are re-rounded so an integer stays an integer - `breadth` moving from
 * 14 to 14.14 is not a thing that can happen to an account, and letting it
 * happen here would report flips that reality cannot produce.
 */
function nudge(h: NormalizedHistory, e: number): NormalizedHistory {
  const m = h.repoMix;
  const clamp = (x: number): number => Math.min(1, Math.max(0, x));
  return {
    ...h,
    totals: {
      ...h.totals,
      commits: Math.max(0, Math.round(h.totals.commits * (1 + e))),
      starsReceived: Math.max(0, Math.round(h.totals.starsReceived * (1 + e))),
    },
    repoMix: {
      ...m,
      hhi: clamp(m.hhi * (1 + e)),
      ownShare: clamp(m.ownShare * (1 + e)),
      breadth: Math.max(0, Math.round(m.breadth * (1 + e))),
      orgs: Math.max(0, Math.round(m.orgs * (1 + e))),
      anchor: m.anchor === null ? null : { ...m.anchor, share: clamp(m.anchor.share * (1 + e)) },
    },
  };
}

const EPSILONS = [0.005, 0.01, 0.02, 0.05, 0.1];

console.log(`${String(histories.length)} accounts, read at ${DATE}\n`);

const baseline = new Map<NormalizedHistory, string>();
const tally = new Map<string, number>();
for (const h of histories) {
  const form = formOf(h);
  baseline.set(h, form);
  tally.set(form, (tally.get(form) ?? 0) + 1);
}

console.log("baseline distribution");
for (const [form, n] of [...tally].sort((a, b) => b[1] - a[1])) {
  const pct = ((n / histories.length) * 100).toFixed(1);
  console.log(`  ${form.padEnd(13)} ${String(n).padStart(3)}  ${pct}%`);
}

console.log("\nflips under a relative nudge (either direction)");
for (const e of EPSILONS) {
  let flipped = 0;
  const pairs = new Map<string, number>();
  for (const h of histories) {
    const before = baseline.get(h) ?? "";
    const up = formOf(nudge(h, e));
    const down = formOf(nudge(h, -e));
    if (up !== before || down !== before) {
      flipped += 1;
      const key = `${before} -> ${up !== before ? up : down}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
  }
  const pct = ((flipped / histories.length) * 100).toFixed(1);
  console.log(
    `  +/-${(e * 100).toFixed(1).padStart(4)}%   ${String(flipped).padStart(3)} of ${String(histories.length)}  (${pct}%)`,
  );
  for (const [pair, n] of [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`             ${String(n).padStart(3)}  ${pair}`);
  }
}
