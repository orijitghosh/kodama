/**
 * Measures whether space colonization yields monotone pad counts across
 * maturity levels, before any machinery is built to force the issue.
 *
 * D-005 promises pads never decrease as a tree grows. Space colonization gives
 * no such guarantee on its own, so the question is empirical: how often, and by
 * how much, does a larger attractor prefix resolve into fewer tip clusters?
 */

import { buildSkeleton } from "../src/skeleton.js";
import { seedFromLogin } from "../src/rng.js";

const SAMPLE_LOGINS = Array.from({ length: 400 }, (_, i) => `probe-user-${String(i)}`);

let violations = 0;
let worstDrop = 0;
let worstCase = "";
const padCounts: number[] = [];

for (const login of SAMPLE_LOGINS) {
  const seed = seedFromLogin(login);
  let previous = 0;
  for (let maturity = 3; maturity <= 13; maturity += 1) {
    const pads = buildSkeleton(seed, maturity).pads.length;
    padCounts.push(pads);
    if (pads < previous) {
      violations += 1;
      const drop = previous - pads;
      if (drop > worstDrop) {
        worstDrop = drop;
        worstCase = `${login} level ${String(maturity)}: ${String(previous)} -> ${String(pads)}`;
      }
    }
    previous = pads;
  }
}

const transitions = SAMPLE_LOGINS.length * 10;
console.log(`transitions checked : ${String(transitions)}`);
console.log(`monotonicity breaks : ${String(violations)} (${((violations / transitions) * 100).toFixed(1)}%)`);
console.log(`worst drop          : ${String(worstDrop)} pads`);
if (worstCase !== "") console.log(`worst case          : ${worstCase}`);
console.log(`pad count range     : ${String(Math.min(...padCounts))}..${String(Math.max(...padCounts))}`);

// Per-level distribution. If the minimum cluster count at each level stays
// above a monotone target curve, pad counts can be made monotone for free by
// trimming to that target instead of recomputing lower levels.
console.log("\nlevel   min   p05   median   max");
for (let maturity = 3; maturity <= 13; maturity += 1) {
  const counts = SAMPLE_LOGINS.map(
    (login) => buildSkeleton(seedFromLogin(login), maturity).pads.length,
  ).sort((a, b) => a - b);
  const at = (q: number): number => counts[Math.floor(counts.length * q)] ?? 0;
  console.log(
    `${String(maturity).padStart(5)} ${String(counts[0]).padStart(5)} ${String(at(0.05)).padStart(5)} ` +
      `${String(at(0.5)).padStart(8)} ${String(counts[counts.length - 1]).padStart(5)}`,
  );
}

const start = process.hrtime.bigint();
for (let i = 0; i < 50; i += 1) buildSkeleton(seedFromLogin(`bench-${String(i)}`), 13);
const perBuild = Number(process.hrtime.bigint() - start) / 1e6 / 50;
console.log(`level-13 build      : ${perBuild.toFixed(2)} ms`);
