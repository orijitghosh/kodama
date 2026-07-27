/**
 * `render(history, date, opts) -> string` (SPEC-ENGINE §1).
 *
 * Everything visual is derived from TreeFacts; this file composes, it does not
 * decide. If a rule appears to live here, it is in the wrong place.
 */

import { animationStyles } from "./animate.js";
import { drawBonsai } from "./biomes/bonsai.js";
import { treeFacts } from "./facts.js";
import { biographyFor, labelsFor } from "./locale.js";
import { isClassic, speciesByName } from "./species.js";
import type { Species } from "./species.js";
import { el, escapeText, group, rect, svgDocument, text } from "./svg.js";
import { paletteStyles, slot, themeByName, tintRotation } from "./themes.js";
import type { NormalizedHistory, RenderOptions, Scale, Theme, TreeFacts } from "./types.js";
import { assertHistory } from "./validate.js";

/** Canvas dimensions per scale (TASTE §4). */
export const SCALE_SIZES: Record<Scale, { width: number; height: number }> = {
  full: { width: 830, height: 420 },
  compact: { width: 420, height: 160 },
  strip: { width: 830, height: 90 },
  button: { width: 88, height: 31 },
};

const MARGIN = 24;

// ---------------------------------------------------------------------------
// The legend's ceiling
// ---------------------------------------------------------------------------

/**
 * The legend is laid out bottom-up from `LEGEND_BOTTOM` so the column stays a
 * quiet caption at any length. That makes the *top* row the one that moves, and
 * the thing it moves towards is the last line of stats text - so the number of
 * rows the column can hold is a fact about the geometry, not a number somebody
 * chose. It is written here as the division it actually is, so that moving any
 * of the three constants moves the cap with it.
 *
 * Today it comes out at nine, and a maintainer-shaped account (`whale`) already
 * draws all nine. There is no spare row. A tenth would land at y=208 and print
 * over the "this week" line at y=198.
 */
const STATS_LAST_BASELINE = 198;
const LEGEND_BOTTOM = 388;
const LEGEND_ROW_HEIGHT = 20;

export const LEGEND_MAX_ROWS = Math.floor(
  (LEGEND_BOTTOM - STATS_LAST_BASELINE) / LEGEND_ROW_HEIGHT,
);

/**
 * Baselines for a legend of `count` rows, top to bottom, and the one place the
 * cap is enforced. Exported so the cap can be tested at the count no history can
 * produce - the entry list in `drawStats` is exactly nine long, so the guard is
 * unreachable from data by construction, and an unreachable guard that is never
 * exercised is indistinguishable from a comment.
 */
export function legendRowBaselines(count: number): number[] {
  if (count > LEGEND_MAX_ROWS) {
    throw new Error(
      `legend wants ${String(count)} rows and the stats column holds ` +
        `${String(LEGEND_MAX_ROWS)}: row ${String(LEGEND_MAX_ROWS + 1)} would draw over the ` +
        `stats text at y=${String(STATS_LAST_BASELINE)}. Name it in the header line instead, ` +
        `or take a row away from something else.`,
    );
  }
  return Array.from({ length: count }, (_, i) => LEGEND_BOTTOM - (count - 1 - i) * LEGEND_ROW_HEIGHT);
}

// ---------------------------------------------------------------------------
// Number formatting (no toLocaleString - it varies by host, SPEC-ENGINE §1)
// ---------------------------------------------------------------------------

/** Thin-space grouping, done by hand so every host agrees byte for byte. */
export function groupDigits(value: number): string {
  const digits = String(Math.trunc(Math.abs(value)));
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += " ";
    out += digits[i];
  }
  return value < 0 ? `-${out}` : out;
}

// ---------------------------------------------------------------------------
// Full scale composition
// ---------------------------------------------------------------------------

const MONO = "ui-monospace, 'Cascadia Code', Consolas, 'SF Mono', monospace";
const SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";

function drawCard(width: number, height: number): string {
  return [
    rect(0, 0, width, height, { fill: slot("bg") }),
    rect(0.5, 0.5, width - 1, height - 1, {
      fill: "none",
      stroke: slot("border"),
      "stroke-width": 1,
      rx: 6,
    }),
  ].join("");
}

function drawHeader(
  facts: TreeFacts,
  width: number,
  locale: string,
  species: Species,
): string {
  const labels = labelsFor(locale);
  return group({ class: "kd-header" }, [
    // The species is named here rather than given a legend dot: it is what kind
    // of plant this is, not another symbol hung on it, and the legend already
    // reaches nine rows for a maintainer (D-024).
    //
    // A `tspan` rather than a second `text`, because a second text element would
    // need the width of the login to position itself, and there is no font metric
    // in an engine that ships no fonts (D-011). The tspan simply flows after.
    isClassic(species)
      ? text(MARGIN, 40, `kodama · @${facts.login}`, {
          fill: slot("textPrimary"),
          "font-family": SANS,
          "font-size": 14,
          "font-weight": 600,
        })
      : el(
          "text",
          {
            x: MARGIN,
            y: 40,
            fill: slot("textPrimary"),
            "font-family": SANS,
            "font-size": 14,
            "font-weight": 600,
          },
          escapeText(`kodama · @${facts.login}`) +
            el(
              "tspan",
              { fill: slot("textSecondary"), "font-weight": 400 },
              escapeText(` · ${species.label}`),
            ),
        ),
    text(width - MARGIN, 40, `${labels.seasons[facts.season]} · ${facts.date}`, {
      fill: slot("textSecondary"),
      "font-family": MONO,
      "font-size": 12,
      "text-anchor": "end",
    }),
    el("line", {
      x1: MARGIN,
      y1: 56,
      x2: width - MARGIN,
      y2: 56,
      stroke: slot("border"),
      "stroke-width": 1,
    }),
  ]);
}

/**
 * The stats column. TASTE §4 allows one hero number and two quiet secondary
 * lines - no boxes, no icons beyond the legend dots, because the negative
 * space is the luxury.
 */
function drawStats(facts: TreeFacts, theme: Theme, locale: string): string {
  const labels = labelsFor(locale);
  const x = 500;

  const parts: string[] = [
    text(x, 110, groupDigits(facts.totals.commits), {
      fill: slot("textPrimary"),
      "font-family": MONO,
      "font-size": 34,
      "font-weight": 700,
    }),
    text(x, 129, labels.commits, {
      fill: slot("textSecondary"),
      "font-family": SANS,
      "font-size": 13,
    }),
    text(x, 168, `${groupDigits(facts.streak.current)} ${labels.streakDays}`, {
      fill: slot("textPrimary"),
      "font-family": MONO,
      "font-size": 20,
      "font-weight": 600,
    }),
    text(x, 198, `${groupDigits(facts.commitsLast7d)} ${labels.thisWeek}`, {
      fill: slot("textPrimary"),
      "font-family": MONO,
      "font-size": 20,
      "font-weight": 600,
    }),
  ];

  // Legend: one dot per symbol actually present on this tree, so the key
  // grows with the grammar instead of leaving a maintainer's lanterns, birds
  // and fireflies undocumented (D-024). Each dot carries the same slot the
  // symbol is drawn in, so the caption reads off the picture, not a table.
  // Bottom-aligned above the pot base so the column stays a quiet caption at
  // any length; order is fixed (headline masses first) so a busier account
  // never reshuffles a quieter one.
  const o = facts.ornaments;
  const legend: Array<[string, string]> = [];
  const entry = (present: boolean, colour: string, label: string): void => {
    if (present) legend.push([colour, label]);
  };
  entry(true, slot("foliage2"), labels.legendFoliage);
  entry(o.fruit.length > 0, slot("fruit2"), labels.legendFruit);
  entry(o.lanterns > 0, slot("accent"), labels.legendLanterns);
  entry(o.blossomClusters > 0, slot("blossom1"), labels.legendBlossom);
  entry(o.shoots > 0, slot("foliage3"), labels.legendShoots);
  entry(o.unripeFruit > 0, slot("foliage3"), labels.legendUnripe);
  entry(o.bird !== "none", slot("textSecondary"), labels.legendBird);
  // Stars are on every theme now; only the mark changes with the light, so the
  // legend names whichever one is actually drawn (D-024).
  entry(
    o.fireflies > 0,
    theme.night ? slot("firefly") : slot("blossom1"),
    theme.night ? labels.legendFireflies : labels.legendButterflies,
  );
  entry(o.windChime, slot("textSecondary"), labels.legendChime);

  // Form is deliberately absent from this list, and so is species. A legend row
  // says "this mark on the tree means this fact", and carries the slot the mark
  // is drawn in so the caption reads off the picture (D-024). Form is not a mark
  // hung on the tree - it is the outline of the whole thing, and there is no dot
  // colour it could honestly carry. It is named in the header line instead,
  // which is the route species already took for the same reason.
  //
  // That is a choice, but it is not a free one: the list above is nine entries
  // long and the column holds exactly nine rows, so a tenth row is not a design
  // question, it is a collision. Anything that wants to be in the key from here
  // has to displace something or move out of the column.
  const baselines = legendRowBaselines(legend.length);

  legend.forEach(([colour, label], index) => {
    const y = baselines[index]!;
    parts.push(el("circle", { cx: x + 4, cy: y - 4, r: 4, fill: colour }));
    parts.push(
      text(x + 16, y, label, {
        fill: slot("textSecondary"),
        "font-family": SANS,
        "font-size": 12,
      }),
    );
  });

  return group({ class: "kd-stats" }, parts);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function renderFull(
  facts: TreeFacts,
  theme: Theme,
  species: Species,
  opts: RenderOptions,
): string {
  const { width, height } = SCALE_SIZES.full;
  return [
    drawCard(width, height),
    drawHeader(facts, width, opts.locale, species),
    drawBonsai(facts, theme, species).svg,
    drawStats(facts, theme, opts.locale),
  ].join("");
}

function renderCompact(
  facts: TreeFacts,
  theme: Theme,
  species: Species,
  opts: RenderOptions,
): string {
  const { width, height } = SCALE_SIZES.compact;
  const labels = labelsFor(opts.locale);
  // The tree is drawn at full-scale coordinates and scaled into place, so one
  // geometry serves every size and the composition cannot drift between them.
  const tree = group(
    { transform: "translate(6 4) scale(0.38)" },
    drawBonsai(facts, theme, species, "reduced").svg,
  );
  return [
    drawCard(width, height),
    tree,
    group({ class: "kd-stats" }, [
      text(232, 78, groupDigits(facts.totals.commits), {
        fill: slot("textPrimary"),
        "font-family": MONO,
        "font-size": 26,
        "font-weight": 700,
      }),
      text(232, 96, labels.commits, {
        fill: slot("textSecondary"),
        "font-family": SANS,
        "font-size": 11,
      }),
      text(232, 122, `${groupDigits(facts.streak.current)} ${labels.streakDays}`, {
        fill: slot("textSecondary"),
        "font-family": MONO,
        "font-size": 13,
      }),
    ]),
  ].join("");
}

function renderStrip(
  facts: TreeFacts,
  theme: Theme,
  species: Species,
  opts: RenderOptions,
): string {
  const { width, height } = SCALE_SIZES.strip;
  const labels = labelsFor(opts.locale);
  const tree = group(
    { transform: "translate(4 -6) scale(0.22)" },
    drawBonsai(facts, theme, species, "silhouette").svg,
  );
  return [
    drawCard(width, height),
    tree,
    group({ class: "kd-stats" }, [
      text(150, 40, `@${facts.login}`, {
        fill: slot("textPrimary"),
        "font-family": SANS,
        "font-size": 13,
        "font-weight": 600,
      }),
      text(150, 62,
        `${groupDigits(facts.totals.commits)} ${labels.commits} · ` +
          `${groupDigits(facts.streak.current)} ${labels.streakDays}`,
        {
          fill: slot("textSecondary"),
          "font-family": MONO,
          "font-size": 12,
        },
      ),
    ]),
  ].join("");
}

/** 88×31, static, a deliberate wink at old-web badge culture. */
function renderButton(facts: TreeFacts, theme: Theme, species: Species): string {
  const { width, height } = SCALE_SIZES.button;
  return [
    drawCard(width, height),
    drawBonsai(facts, theme, species, "glyph").svg,
    text(34, 19, buttonLabel(facts.login), {
      fill: slot("textPrimary"),
      "font-family": SANS,
      "font-size": 7,
    }),
  ].join("");
}

/**
 * The login as it fits beside the glyph on the 88px button.
 *
 * The glyph ends at x≈28 and the text starts at x=34, leaving ~51px; at
 * font-size 7 that is about thirteen average characters. A name longer than the
 * cap ends in an ellipsis so it reads as deliberately clipped rather than
 * misspelt - the old cap sliced `orijitghosh` to `orijitghos`, which just looks
 * like a typo. Twelve characters (plus the ellipsis) is the conservative fit for
 * a wide glyph mix; most logins, this one included, show whole.
 */
function buttonLabel(login: string): string {
  return login.length <= 12 ? login : `${login.slice(0, 11)}...`;
}

export function render(
  history: NormalizedHistory,
  date: string,
  opts: RenderOptions,
): string {
  const validated = assertHistory(history);
  if (!isSupportedBiome(opts.biome)) {
    throw new Error(`unsupported biome: ${escapeText(String(opts.biome))}`);
  }

  const facts = treeFacts(validated, date);
  const theme = themeByName(opts.theme);
  const species = speciesByName(opts.species);
  const { width, height } = SCALE_SIZES[opts.scale];

  const body =
    opts.scale === "full"
      ? renderFull(facts, theme, species, opts)
      : opts.scale === "compact"
        ? renderCompact(facts, theme, species, opts)
        : opts.scale === "strip"
          ? renderStrip(facts, theme, species, opts)
          : renderButton(facts, theme, species);

  const biography = biographyFor(facts, opts.locale, species);

  // Motion is the full badge's alone (TASTE §6): at the small scales the tree is
  // under half size and drifting dots read as speckle, not weather. When off,
  // nothing is appended, so a static card is byte-identical to one with no
  // animation layer at all - which is what makes `animate=off` a clean strip.
  const style =
    paletteStyles(
      theme,
      facts.season,
      tintRotation(facts.languages, opts.tint),
      // An alternate species brings its own autumn (species.ts): a ginkgo goes
      // gold, a maple scarlet. `classic` passes null and keeps the global amber.
      species.autumn,
    ) + (opts.animate && opts.scale === "full" ? animationStyles() : "");

  return svgDocument(
    {
      width,
      height,
      title: biography.title,
      desc: biography.desc,
      locale: opts.locale,
      style,
    },
    body,
  );
}

function isSupportedBiome(biome: string): boolean {
  return biome === "bonsai";
}

export { treeFacts };
