/**
 * Renders the Taste Gate #3 contact sheet: species (engine v2).
 *
 * Gates #1 and #2 judged one plant in six palettes. Species changes what the
 * plant *is* - leaf mass, autumn colour, fruit form, flower form - so every
 * existing approval is superseded and the drawing has to be re-judged before the
 * pinned artifacts move. PROPOSAL-VARIETALS §7.8 asks two questions of this
 * sheet, and they are what the checklist should be walked against:
 *
 *   1. Is every species postable at its representative fixture?
 *   2. Does any species read as another species' mistake?
 *
 * Three sheets, because three different things can be wrong:
 *
 *   - **species** - all eleven on one fixture, at ink and at paper, so the leaf
 *     masses are compared side by side and the day themes show butterflies.
 *   - **autumn** - all eleven in October. This is the payoff for taking autumn
 *     off the one global amber, so it is also where a bad palette will show.
 *   - **fixtures** - the six gallery fixtures as they now render, each with its
 *     own language. This is the direct answer to "grinder and maintainer are the
 *     same plant": they are now a maple and a ginkgo.
 *
 * Writes to dev/taste/gate-3/, which is *not* the pinned set. gate-1 and gate-2
 * are only re-rendered after a verdict, by their own scripts.
 *
 * The sheet references each file with `<img>` rather than inlining it, and that
 * is not a detail. Inlining put 39 SVGs in one document, where every `svg{--kd-*}`
 * rule applies to all of them and the first `<symbol>` id wins every reference -
 * so the first version of this sheet painted every crown with one species' leaf
 * and one species' palette. An `<img>` is its own document, which is also how a
 * README embeds a badge.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "../src/render.js";
import { SPECIES_NAMES, speciesByName } from "../src/species.js";
import { assertHistory } from "../src/validate.js";
import type { NormalizedHistory, RenderOptions, ThemeName } from "../src/types.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures");
const outDir = resolve(import.meta.dirname, "../../dev/taste/gate-3");
mkdirSync(outDir, { recursive: true });

// Cleared first, because a gate sheet is only meaningful if it holds exactly what
// this run drew. Shrinking the species list once left seven images of plants that
// no longer exist sitting in here, ready to be committed as approved artifacts.
for (const file of readdirSync(outDir)) {
  if (file.endsWith(".svg") || file === "index.html") rmSync(resolve(outDir, file));
}

function load(name: string): NormalizedHistory {
  return assertHistory(
    JSON.parse(readFileSync(resolve(fixturesDir, `${name}.json`), "utf8")),
  );
}

const SUMMER = "2026-07-15";
const AUTUMN = "2025-10-08";

const base: RenderOptions = {
  biome: "bonsai",
  theme: "ink",
  scale: "full",
  animate: false,
  tint: "none",
  species: "classic",
  locale: "en",
};

/** The fixture with the fullest crown: fruit, lanterns, blossom and shoots. */
const CARRIER = "maintainer";
const GALLERY = ["ghost", "newcomer", "grinder", "maintainer", "whale", "veteran"];

interface Card {
  file: string;
  caption: string;
  svg: string;
}

const sheets: Array<{ title: string; note: string; cards: Card[] }> = [];
let count = 0;

function write(file: string, svg: string): void {
  writeFileSync(resolve(outDir, file), svg, "utf8");
  count += 1;
}

// --- sheet one: the eleven species, twice over -----------------------------

for (const theme of ["ink", "paper"] as ThemeName[]) {
  const cards: Card[] = [];
  for (const name of SPECIES_NAMES) {
    const svg = render(load(CARRIER), SUMMER, { ...base, theme, species: name });
    const file = `species-${name}-${theme}.svg`;
    write(file, svg);
    cards.push({ file, caption: `${name} · ${speciesByName(name).label} · ${theme}`, svg });
  }
  sheets.push({
    title: `Species on ${CARRIER} · ${theme} · summer`,
    note:
      theme === "paper"
        ? "Day theme: stars are butterflies here, not fireflies."
        : "Night theme: the reference sheet for leaf mass.",
    cards,
  });
}

// --- sheet two: autumn ------------------------------------------------------

{
  const cards: Card[] = [];
  for (const name of SPECIES_NAMES) {
    const svg = render(load(CARRIER), AUTUMN, { ...base, theme: "ink", species: name });
    const file = `autumn-${name}.svg`;
    write(file, svg);
    cards.push({
      file,
      caption: `${name} · ${speciesByName(name).label} · October`,
      svg,
    });
  }
  sheets.push({
    title: "Autumn, per species · ink",
    note: "classic keeps the global amber. Ginkgo gold, maple scarlet, cherry and wisteria yellow.",
    cards,
  });
}

// --- sheet three: the gallery fixtures as they now are ----------------------

{
  const cards: Card[] = [];
  for (const name of GALLERY) {
    const svg = render(load(name), SUMMER, base);
    const file = `fixture-${name}.svg`;
    write(file, svg);
    cards.push({ file, caption: `${name} · classic (the default, unchanged)`, svg });
  }
  sheets.push({
    title: "The six gallery fixtures, with their own languages · ink · summer",
    note: "These must be byte-identical to what gate #1 approved - the default did not change.",
    cards,
  });
}

writeFileSync(
  resolve(outDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>kodama - taste gate #3 (species)</title>
<style>
  body{background:#0c0e0d;color:#e8e6e1;font:14px system-ui;margin:0;padding:24px}
  h1{font:600 18px system-ui;margin:0 0 4px}
  h2{font:600 15px system-ui;color:#e8e6e1;margin:32px 0 2px}
  p.note{color:#9aa39d;font:13px system-ui;margin:0 0 14px}
  .grid{display:grid;grid-template-columns:max-content;gap:18px}
  figure{margin:0}
  figcaption{color:#9aa39d;font:12px ui-monospace,monospace;margin-bottom:6px}
  svg{display:block}
</style>
<h1>Taste Gate #3 - species (engine v2)</h1>
<p class="note">Two questions per image: would you post it, and could it be mistaken for a different species?</p>
${sheets
  .map(
    (sheet) =>
      `<h2>${sheet.title}</h2><p class="note">${sheet.note}</p><div class="grid">` +
      sheet.cards
        .map(
          (card) =>
            `<figure><figcaption>${card.caption}</figcaption>` +
            `<img src="${card.file}" width="830" height="420" alt="${card.caption}"></figure>`,
        )
        .join("\n") +
      `</div>`,
  )
  .join("\n")}`,
  "utf8",
);

console.log(`wrote ${String(count)} renders to dev/taste/gate-3/`);
console.log(`open dev/taste/gate-3/index.html`);
