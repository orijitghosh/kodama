/**
 * Renders fixtures to files for eyeballing. This is the taste-gate workhorse
 * (TASTE §5) and the day-to-day "does it look kept or random" check.
 *
 * Writes to engine/debug/, which is gitignored - gate artifacts are committed
 * deliberately, not accumulated by accident.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "../src/render.js";
import { assertHistoryV1 } from "../src/validate.js";
import type { NormalizedHistory, RenderOptions, Scale, ThemeName } from "../src/types.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures");
const outDir = resolve(import.meta.dirname, "../debug");
mkdirSync(outDir, { recursive: true });

function load(name: string): NormalizedHistory {
  return assertHistoryV1(
    JSON.parse(readFileSync(resolve(fixturesDir, `${name}.json`), "utf8")),
  );
}

const GALLERY = ["ghost", "newcomer", "grinder", "maintainer", "whale", "veteran"];
const THEMES: ThemeName[] = ["ink", "dusk"];
const DATES: Array<[string, string]> = [
  ["summer", "2026-07-15"],
  ["winter", "2026-01-20"],
];

const base: RenderOptions = {
  biome: "bonsai",
  theme: "ink",
  scale: "full",
  animate: false,
  tint: "none",
  species: "classic",
  locale: "en",
};

const cards: string[] = [];

for (const name of GALLERY) {
  const history = load(name);
  for (const theme of THEMES) {
    for (const [label, date] of DATES) {
      const svg = render(history, date, { ...base, theme });
      const file = `${name}-${theme}-${label}.svg`;
      writeFileSync(resolve(outDir, file), svg, "utf8");
      cards.push(
        `<figure><figcaption>${name} · ${theme} · ${label}</figcaption>${svg}</figure>`,
      );
    }
  }
}

// The small scales, across the whole gallery: ghost stresses sparseness, whale
// stresses width, so a single fixture cannot vouch for the layout.
for (const scale of ["compact", "strip", "button"] as Scale[]) {
  for (const name of GALLERY) {
    const svg = render(load(name), "2026-07-15", { ...base, scale });
    writeFileSync(resolve(outDir, `${name}-${scale}.svg`), svg, "utf8");
    cards.push(`<figure><figcaption>${name} · ${scale}</figcaption>${svg}</figure>`);
  }
}

writeFileSync(
  resolve(outDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>kodama gallery</title>
<style>
  body{background:#0c0e0d;color:#e8e6e1;font:14px system-ui;margin:0;padding:24px}
  figure{margin:0 0 28px}
  figcaption{color:#9aa39d;font:12px ui-monospace,monospace;margin-bottom:6px}
  svg{display:block}
</style>
${cards.join("\n")}`,
  "utf8",
);

console.log(`wrote ${String(cards.length)} renders to engine/debug/`);
console.log(`open engine/debug/index.html`);
