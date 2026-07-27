/**
 * Renders the Taste Gate #4 contact sheet: form (engine v3).
 *
 * Gate #3 judged what the plant was made of. Form changes its *outline*, which is
 * the loudest thing this project has ever changed about an existing tree, so every
 * pinned approval is superseded and has to be re-walked. PROPOSAL-VARIETALS §3 and
 * the C.4 handoff ask two questions of this sheet:
 *
 *   1. Is every form postable at its representative account?
 *   2. Does any form read as another form's mistake?
 *
 * **Judge at 1x, not zoomed** (TASTE, and trap #2: the butterflies were correct and
 * invisible). The compact sheet is here for the same reason - four of the forms are
 * a mark rather than a shape, and a mark that survives at 830x420 and dies at
 * 420x160 has not shipped.
 *
 * The accounts are `test/helpers/form-cases.ts`, not the ten real fixtures. Only
 * four of the fourteen forms are reachable from those, so a sheet built on them
 * would have judged four styles and guessed at ten. Nothing here forces a form:
 * each case carries its own `repoMix` and goes through `selectForm` exactly as a
 * real account does, and this script refuses to write a single file if any case has
 * drifted off its rung. A sheet that illustrates a style the ladder no longer
 * produces is worse than no sheet.
 *
 * Writes to dev/taste/gate-4/, which is *not* the pinned set. gate-1, gate-2 and
 * gate-3 are only re-rendered after a verdict, by their own scripts.
 *
 * `<img>` per file, never inlined - see the header of `gate-3.ts` for the document
 * that painted every crown with one species' leaf.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { treeFacts } from "../src/facts.js";
import { render } from "../src/render.js";
import type { FormName } from "../src/form.js";
import type { RenderOptions, ThemeName } from "../src/types.js";
import { GALLERY_FIXTURES, loadFixture } from "../test/helpers/fixtures.js";
import {
  FORM_CASES,
  FORM_CASE_DATE,
  formCasesCoverEveryForm,
} from "../test/helpers/form-cases.js";

const outDir = resolve(import.meta.dirname, "../../dev/taste/gate-4");
mkdirSync(outDir, { recursive: true });

// --- refuse to draw a lie ---------------------------------------------------

if (!formCasesCoverEveryForm()) {
  throw new Error("form-cases.ts does not cover FORM_NAMES - the sheet would be short a style");
}

for (const one of FORM_CASES) {
  const chosen = treeFacts(one.history, FORM_CASE_DATE).form;
  if (chosen !== one.form) {
    throw new Error(
      `the ${one.form} case now selects ${chosen}. A threshold moved out from under its ` +
        `example; fix the case in test/helpers/form-cases.ts before judging this gate.`,
    );
  }
}

// Cleared only after the check above passes, so a failed run leaves the last good
// sheet intact rather than an empty directory that looks like nothing was drawn.
for (const file of readdirSync(outDir)) {
  if (file.endsWith(".svg") || file === "index.html") rmSync(resolve(outDir, file));
}

// ---------------------------------------------------------------------------

const SUMMER = "2026-07-15";

const base: RenderOptions = {
  biome: "bonsai",
  theme: "ink",
  scale: "full",
  animate: false,
  tint: "none",
  species: "classic",
  locale: "en",
};

/** The four that are a mark on the tree rather than a different skeleton (C.4). */
const MARKED: readonly FormName[] = ["sharimiki", "neagari", "sekijoju", "kokedama"];

interface Card {
  file: string;
  caption: string;
  width: number;
  height: number;
}

const sheets: Array<{ title: string; note: string; cards: Card[] }> = [];
let count = 0;

/**
 * Pins a render to one colour scheme.
 *
 * Every kodama theme is a *pair*: `paletteStyles` emits the light palette in the
 * base `svg{}` rule and the dark one inside `@media(prefers-color-scheme:dark)`,
 * so which of the two a reader sees is decided by their operating system and not
 * by the `theme=` they asked for. That is right for the product and fatal for a
 * contact sheet - an `<img>` resolves the media query against the viewer's OS, so
 * a sheet captioned "paper" renders in ink on a machine set to dark mode, and the
 * one box this sheet exists to answer ("does the deadwood vein survive a pale
 * ground?") silently cannot be answered.
 *
 * This is trap #1 wearing a different hat: the document looked like it was showing
 * fourteen forms on two grounds, and was showing them on whichever single ground
 * the reader's laptop happened to be set to.
 *
 * So the gate pins each sheet to the scheme it claims. Stripping the query leaves
 * the light palette; hoisting it over the base rule leaves the dark one. The
 * shipped SVG is untouched - this is the gate sheet forcing a scheme so that a
 * human can judge one, and it throws rather than guess if `paletteStyles` ever
 * changes shape under it.
 */
const DARK_QUERY = /@media\(prefers-color-scheme:dark\)\{svg\{([^}]*)\}\}/;

function forceScheme(svg: string, scheme: "light" | "dark"): string {
  const match = DARK_QUERY.exec(svg);
  if (match === null) {
    throw new Error(
      "no prefers-color-scheme block found - paletteStyles changed shape, and this sheet " +
        "would go back to showing whichever scheme the reader's OS is set to",
    );
  }
  const stripped = svg.replace(DARK_QUERY, "");
  if (scheme === "light") return stripped;

  const hoisted = stripped.replace(/svg\{[^}]*\}/, `svg{${match[1] ?? ""}}`);
  if (hoisted === stripped) throw new Error("could not find the base svg{} rule to hoist over");
  return hoisted;
}

function write(file: string, svg: string): void {
  writeFileSync(resolve(outDir, file), svg, "utf8");
  count += 1;
}

// --- sheets one and two: the fourteen forms, on ink and on paper ------------

for (const theme of ["ink", "paper"] as ThemeName[]) {
  const scheme = theme === "ink" ? "dark" : "light";
  const cards: Card[] = [];
  for (const one of FORM_CASES) {
    const svg = forceScheme(render(one.history, SUMMER, { ...base, theme }), scheme);
    const file = `form-${one.form}-${theme}.svg`;
    write(file, svg);
    cards.push({
      file,
      caption: `${one.form} - ${one.reads}`,
      width: 830,
      height: 420,
    });
  }
  sheets.push({
    title: `The fourteen forms - ${theme} - summer`,
    note:
      theme === "paper"
        ? "Day theme, <strong>pinned to the light palette</strong> so it stays pale whatever your OS is set to. The deadwood vein is drawn in `snow`, the one slot pale in both schemes - this is the sheet where it has to survive a pale background. Note that ink and paper share both palettes and differ only in the night layer, so for the twelve cases with no fireflies these images are the light half of the same tree, not a second theme."
        : "Pinned to the dark palette. Every case is maturity 5 except the moss ball (3) and the windswept (6), so what differs between these is the form and not the size.",
    cards,
  });
}

// --- sheet three: the marks at half size ------------------------------------

{
  const cards: Card[] = [];
  for (const form of MARKED) {
    const one = FORM_CASES.find((each) => each.form === form);
    if (one === undefined) throw new Error(`no case for ${form}`);
    for (const theme of ["ink", "paper"] as ThemeName[]) {
      const svg = forceScheme(
        render(one.history, SUMMER, { ...base, theme, scale: "compact" }),
        theme === "ink" ? "dark" : "light",
      );
      const file = `mark-${form}-${theme}.svg`;
      write(file, svg);
      cards.push({ file, caption: `${form} - ${theme} - compact`, width: 420, height: 160 });
    }
  }
  sheets.push({
    title: "The four marks at compact scale",
    note:
      "Compact draws at `reduced` detail, which still draws the marks; `strip` and `button` do not. " +
      "The question is only whether the mark still reads at 420x160, not whether it is pretty there.",
    cards,
  });
}

// --- sheet four: what actually changed for the gallery ----------------------

{
  const cards: Card[] = [];
  for (const name of GALLERY_FIXTURES) {
    const history = loadFixture(name);
    const svg = forceScheme(render(history, SUMMER, base), "dark");
    const file = `fixture-${name}.svg`;
    write(file, svg);
    cards.push({
      file,
      caption: `${name} - ${treeFacts(history, SUMMER).form}`,
      width: 830,
      height: 420,
    });
  }
  sheets.push({
    title: "The six gallery fixtures, as they now render - ink - summer",
    note:
      "These are the real accounts, and this is the sheet gates #1 and #2 are being asked to " +
      "re-approve. <strong>All ten fixtures select a form and not one of them is moyogi</strong> " +
      "- three moss balls, three metronomes, three stones and one slant. The fallback has no " +
      "fixture, so the tree that shipped is drawn nowhere in this gate.",
    cards,
  });
}

writeFileSync(
  resolve(outDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>kodama - taste gate #4 (form)</title>
<style>
  body{background:#0c0e0d;color:#e8e6e1;font:14px system-ui;margin:0;padding:24px}
  h1{font:600 18px system-ui;margin:0 0 4px}
  h2{font:600 15px system-ui;color:#e8e6e1;margin:32px 0 2px}
  p.note{color:#9aa39d;font:13px system-ui;margin:0 0 14px;max-width:78ch}
  .grid{display:grid;grid-template-columns:max-content;gap:18px}
  figure{margin:0}
  figcaption{color:#9aa39d;font:12px ui-monospace,monospace;margin-bottom:6px}
</style>
<h1>Taste Gate #4 - form (engine v3)</h1>
<p class="note">Two questions per image: would you post it, and could it be mistaken for a different form? Judge at 1x - do not zoom.</p>
${sheets
  .map(
    (sheet) =>
      `<h2>${sheet.title}</h2><p class="note">${sheet.note}</p><div class="grid">` +
      sheet.cards
        .map(
          (card) =>
            `<figure><figcaption>${card.caption}</figcaption>` +
            `<img src="${card.file}" width="${String(card.width)}" height="${String(card.height)}" alt="${card.caption}"></figure>`,
        )
        .join("\n") +
      `</div>`,
  )
  .join("\n")}`,
  "utf8",
);

console.log(`wrote ${String(count)} renders to dev/taste/gate-4/`);
console.log(`open dev/taste/gate-4/index.html`);
