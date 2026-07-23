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
import { assertHistoryV1 } from "../src/validate.js";
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
  return assertHistoryV1(
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
  locale: "en",
};

let worstRatio = 0;
let failures = 0;

console.log("fixture         scale      bytes     cap    used");
for (const name of names) {
  const history = load(name);
  for (const scale of Object.keys(CAPS) as Scale[]) {
    const svg = render(history, DATE, { ...baseOpts, scale });
    const bytes = byteLength(svg);
    const cap = CAPS[scale];
    const ratio = bytes / cap;
    worstRatio = Math.max(worstRatio, ratio);
    const flag = ratio > 1 ? "  OVER CAP" : ratio > 0.8 ? "  (>80%)" : "";
    if (ratio > 1) failures += 1;
    console.log(
      `${name.padEnd(15)} ${scale.padEnd(9)} ${String(bytes).padStart(6)} ${String(cap).padStart(7)} ` +
        `${(ratio * 100).toFixed(1).padStart(6)}%${flag}`,
    );
  }
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
console.log(`worst size    ${(worstRatio * 100).toFixed(1)}% of cap`);

if (failures > 0) {
  console.error(`\n${String(failures)} render(s) over the size cap`);
  process.exit(1);
}
if (p95 > 30) {
  console.error(`\nwhale p95 ${p95.toFixed(2)} ms exceeds the 30 ms budget`);
  process.exit(1);
}
