/**
 * Renders the Taste Gate #1 gallery (TASTE §5): the six gallery fixtures across
 * ink and dusk, at a summer and a winter date - 24 full-scale images, 12 judged
 * per theme pass.
 *
 * Unlike dump-gallery (engine/debug/, gitignored), this writes to dev/taste/,
 * because the gate artifacts are committed deliberately and the gallery page
 * later reuses them.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "../src/render.js";
import { assertHistoryV1 } from "../src/validate.js";
import type { NormalizedHistory, RenderOptions, ThemeName } from "../src/types.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures");
const outDir = resolve(import.meta.dirname, "../../dev/taste/gate-1");
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
let count = 0;

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
      count += 1;
    }
  }
}

writeFileSync(
  resolve(outDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>kodama - taste gate #1</title>
<style>
  body{background:#0c0e0d;color:#e8e6e1;font:14px system-ui;margin:0;padding:24px}
  h1{font:600 16px system-ui;color:#9aa39d}
  .grid{display:grid;grid-template-columns:max-content;gap:20px}
  figure{margin:0}
  figcaption{color:#9aa39d;font:12px ui-monospace,monospace;margin-bottom:6px}
  svg{display:block}
</style>
<h1>Taste Gate #1 - 24 images (12 judged per theme)</h1>
<div class="grid">
${cards.join("\n")}
</div>`,
  "utf8",
);

console.log(`wrote ${String(count)} gate renders to dev/taste/gate-1/`);
console.log(`open dev/taste/gate-1/index.html`);
