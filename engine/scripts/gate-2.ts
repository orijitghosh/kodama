/**
 * Renders the Taste Gate #2 gallery (IMPLEMENTATION 6.1): the four themes that
 * Gate #1 did not judge - paper, sakura, yozakura, shore - across the six
 * gallery fixtures at a single summer date. 24 images, 6 judged per theme.
 *
 * Half the size of Gate #1: these palettes were written from TASTE §3 and never
 * looked at full scale. Summer is the date the reference palettes were tuned
 * at, so it shows each theme as designed (season modulation is
 * theme-independent and was judged at Gate #1).
 *
 * Each theme is viewed in its intended scheme: paper, sakura and shore show
 * light, yozakura shows dark.
 *
 * Gate SVGs are scheme-frozen. A shipped SVG carries both palettes behind a
 * `prefers-color-scheme` query, and `color-scheme` on a container does not
 * reliably flip that query for an inline SVG's own `<style>` - the first viewer
 * showed all four in light, where the near-white grounds are hard to tell apart
 * and yozakura's indigo never appeared. Each render is collapsed to the scheme
 * it is judged in: the same hexes the shipped SVG uses there, with the other
 * half removed.
 *
 * Writes to dev/taste/gate-2/ (committed, like Gate #1), not engine/debug/
 * (gitignored).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "../src/render.js";
import { PALETTE_SLOTS, paletteForSeason, themeByName } from "../src/themes.js";
import { assertHistoryV1 } from "../src/validate.js";
import type { NormalizedHistory, Palette, RenderOptions, Season, ThemeName } from "../src/types.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures");
const outDir = resolve(import.meta.dirname, "../../dev/taste/gate-2");
mkdirSync(outDir, { recursive: true });

function load(name: string): NormalizedHistory {
  return assertHistoryV1(JSON.parse(readFileSync(resolve(fixturesDir, `${name}.json`), "utf8")));
}

const GALLERY = ["ghost", "newcomer", "grinder", "maintainer", "whale", "veteran"];

/** The four themes Gate #1 left unjudged, and the scheme each is meant to show. */
const THEMES: Array<{ name: ThemeName; scheme: "light" | "dark" }> = [
  { name: "paper", scheme: "light" },
  { name: "sakura", scheme: "light" },
  { name: "yozakura", scheme: "dark" },
  { name: "shore", scheme: "light" },
];

const DATE = "2026-07-15"; // high summer - the reference date the palettes are tuned at.
const SEASON: Season = "summer"; // what the render date lands in; the viewer override must match.

const base: RenderOptions = {
  biome: "bonsai",
  theme: "ink",
  scale: "full",
  animate: false,
  tint: "none",
  locale: "en",
};

/** The decl block for one palette, identical to what `paletteStyles` emits per scheme. */
function declare(palette: Palette): string {
  return PALETTE_SLOTS.map((name) => `--kd-${name}:${palette[name]}`).join(";");
}

/**
 * A viewer rule that pins one theme's figures to its authored scheme, without
 * touching the SVGs.
 *
 * The SVGs on disk are the real shipped artifact: dual-scheme, defaulting to the
 * light palette behind a `prefers-color-scheme: dark` query - exactly the bytes
 * a badge serves, and exactly what gate #1 committed. The trouble is only in
 * *viewing* them side by side: the default is light, so on a light OS all four
 * near-white grounds read as one theme and yozakura's night never shows; on a
 * dark OS the light themes flip to dark. Either way the OS, not the theme,
 * decides the palette.
 *
 * So the viewer pins it. Because an inline SVG's own `<style>` becomes ordinary
 * document CSS, an outer `figure[data-t="x"] svg{...}` rule (specificity 0,2,1)
 * outranks the SVG's `svg{...}` and its media block (both 0,0,1) and wins in either
 * OS scheme. The palette data is duplicated into the HTML, not baked into the
 * SVG - the artifact stays honest.
 */
function pinRule(theme: ThemeName, scheme: "light" | "dark"): string {
  const t = themeByName(theme);
  const palette = paletteForSeason(scheme === "dark" ? t.dark : t.light, SEASON);
  return `figure[data-t="${theme}"] svg{${declare(palette)}}`;
}

const cards: string[] = [];
const pins: string[] = [];
let count = 0;

for (const { name: theme, scheme } of THEMES) {
  pins.push(pinRule(theme, scheme));
  for (const name of GALLERY) {
    const svg = render(load(name), DATE, { ...base, theme });
    writeFileSync(resolve(outDir, `${name}-${theme}-summer.svg`), svg, "utf8");
    cards.push(
      `<figure data-t="${theme}"><figcaption>${name} · ${theme} · ${scheme}</figcaption>${svg}</figure>`,
    );
    count += 1;
  }
}

writeFileSync(
  resolve(outDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>kodama - taste gate #2</title>
<style>
  /* A neutral grey frame - never light or dark - so it does not bias the eye
     toward either kind of theme. Each SVG carries its own ground colour. */
  body{background:#3a3d3c;color:#e8e6e1;font:14px system-ui;margin:0;padding:24px}
  h1{font:600 16px system-ui;color:#d7dad6}
  p{color:#c2c6c1;font:12px system-ui;max-width:66ch}
  .grid{display:grid;grid-template-columns:max-content max-content;gap:20px}
  figure{margin:0}
  figcaption{color:#c2c6c1;font:12px ui-monospace,monospace;margin-bottom:6px}
  svg{display:block}
  /* Pin each theme's figures to its authored scheme regardless of the OS. The
     SVGs themselves are the real dual-scheme artifact and are left untouched. */
  ${pins.join("\n  ")}
</style>
<h1>Taste Gate #2 - 24 images (6 judged per theme)</h1>
<p>paper, sakura and shore shown light; yozakura shown dark - each pinned to the
scheme it was authored for, so the palette is what you see whatever your OS is
set to. The SVGs on disk are the real dual-scheme badge output. Walk TASTE §5
per figure; record verdicts in gate-2.md.</p>
<div class="grid">
${cards.join("\n")}
</div>`,
  "utf8",
);

console.log(`wrote ${String(count)} gate-2 renders to dev/taste/gate-2/`);
console.log(`open dev/taste/gate-2/index.html`);
