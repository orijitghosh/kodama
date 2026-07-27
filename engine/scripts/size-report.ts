/**
 * Size and speed report against the SPEC-ENGINE §1 budgets.
 *
 * Runs in CI so budget drift shows up as a number in the log rather than being
 * discovered at a milestone gate.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "../src/render.js";
import { byteLength } from "../src/svg.js";
import { assertHistory } from "../src/validate.js";
import { SPECIES_NAMES } from "../src/species.js";
import type { NormalizedHistory, RenderOptions, Scale } from "../src/types.js";

const CAPS: Record<Scale, number> = {
  full: 60 * 1024,
  compact: 24 * 1024,
  strip: 16 * 1024,
  button: 4 * 1024,
};

const fixturesDir = resolve(import.meta.dirname, "../fixtures");
const names = readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => f.replace(/\.json$/, ""));

function load(name: string): NormalizedHistory {
  return assertHistory(
    JSON.parse(readFileSync(resolve(fixturesDir, `${name}.json`), "utf8")),
  );
}

const DATE = "2026-07-15";
const baseOpts: RenderOptions = {
  biome: "bonsai",
  theme: "ink",
  scale: "full",
  animate: false,
  tint: "none",
  species: "classic",
  locale: "en",
};

/**
 * The cap is per SVG (SPEC-ENGINE §1), and every one of these is an SVG we serve,
 * so all of them are measured.
 *
 * Until C.4 this script rendered one combination per fixture - static, `classic` -
 * and reported 72% of cap. The real worst case is animated `sakura`, which was
 * already at 94.9%: animation adds markup and `sakura` is the heaviest species.
 * A 28% margin that is really 5% is worse than no margin at all, because it gets
 * spent. The gap surfaced when C.4's forms were measured by hand and two of them
 * turned out to be over a cap CI called green.
 */
let worstRatio = 0;
let worstLabel = "";
let failures = 0;

console.log("fixture         worst combination            bytes     cap    used");
for (const name of names) {
  const history = load(name);

  // Only the worst combination per fixture is printed: 40 rows per fixture would
  // bury the number this script exists to report.
  let fixtureWorst = 0;
  let fixtureLabel = "";
  let fixtureBytes = 0;
  let fixtureCap = 0;

  for (const scale of Object.keys(CAPS) as Scale[]) {
    for (const animate of [false, true]) {
      for (const species of SPECIES_NAMES) {
        const svg = render(history, DATE, { ...baseOpts, scale, animate, species });
        const bytes = byteLength(svg);
        const cap = CAPS[scale];
        const ratio = bytes / cap;
        if (ratio > 1) failures += 1;
        if (ratio > fixtureWorst) {
          fixtureWorst = ratio;
          fixtureLabel = `${scale}${animate ? "+anim" : ""}/${species}`;
          fixtureBytes = bytes;
          fixtureCap = cap;
        }
      }
    }
  }

  if (fixtureWorst > worstRatio) {
    worstRatio = fixtureWorst;
    worstLabel = `${name} ${fixtureLabel}`;
  }
  const flag = fixtureWorst > 1 ? "  OVER CAP" : fixtureWorst > 0.8 ? "  (>80%)" : "";
  console.log(
    `${name.padEnd(15)} ${fixtureLabel.padEnd(28)} ${String(fixtureBytes).padStart(6)} ` +
      `${String(fixtureCap).padStart(7)} ${(fixtureWorst * 100).toFixed(1).padStart(6)}%${flag}`,
  );
}

// The render budget is p95 <= 30 ms on the whale (SPEC-SERVICE §6).
const whale = load("whale");
const samples: number[] = [];
for (let i = 0; i < 200; i += 1) {
  const start = process.hrtime.bigint();
  render(whale, DATE, baseOpts);
  samples.push(Number(process.hrtime.bigint() - start) / 1e6);
}
samples.sort((a, b) => a - b);
const p50 = samples[Math.floor(samples.length * 0.5)]!;
const p95 = samples[Math.floor(samples.length * 0.95)]!;

console.log(`\nwhale render  p50 ${p50.toFixed(2)} ms   p95 ${p95.toFixed(2)} ms   (budget 30 ms)`);
console.log(`worst size    ${(worstRatio * 100).toFixed(1)}% of cap   (${worstLabel})`);

if (failures > 0) {
  console.error(`\n${String(failures)} render(s) over the size cap`);
  process.exit(1);
}
if (p95 > 30) {
  console.error(`\nwhale p95 ${p95.toFixed(2)} ms exceeds the 30 ms budget`);
  process.exit(1);
}
