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
import { el, escapeText, group, rect, svgDocument, text } from "./svg.js";
import { paletteStyles, slot, themeByName, tintRotation } from "./themes.js";
import type { NormalizedHistory, RenderOptions, Scale, Theme, TreeFacts } from "./types.js";
import { assertHistoryV1 } from "./validate.js";

/** Canvas dimensions per scale (TASTE §4). */
export const SCALE_SIZES: Record<Scale, { width: number; height: number }> = {
  full: { width: 830, height: 420 },
  compact: { width: 420, height: 160 },
  strip: { width: 830, height: 90 },
  button: { width: 88, height: 31 },
};

const MARGIN = 24;

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

function drawHeader(facts: TreeFacts, width: number, locale: string): string {
  const labels = labelsFor(locale);
  return group({ class: "kd-header" }, [
    text(MARGIN, 40, `kodama · @${facts.login}`, {
      fill: slot("textPrimary"),
      "font-family": SANS,
      "font-size": 14,
      "font-weight": 600,
    }),
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
  entry(theme.night && o.fireflies > 0, slot("firefly"), labels.legendFireflies);
  entry(o.windChime, slot("textSecondary"), labels.legendChime);

  const bottom = 388;
  legend.forEach(([colour, label], index) => {
    const y = bottom - (legend.length - 1 - index) * 20;
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

function renderFull(facts: TreeFacts, theme: Theme, opts: RenderOptions): string {
  const { width, height } = SCALE_SIZES.full;
  return [
    drawCard(width, height),
    drawHeader(facts, width, opts.locale),
    drawBonsai(facts, theme).svg,
    drawStats(facts, theme, opts.locale),
  ].join("");
}

function renderCompact(facts: TreeFacts, theme: Theme, opts: RenderOptions): string {
  const { width, height } = SCALE_SIZES.compact;
  const labels = labelsFor(opts.locale);
  // The tree is drawn at full-scale coordinates and scaled into place, so one
  // geometry serves every size and the composition cannot drift between them.
  const tree = group(
    { transform: "translate(6 4) scale(0.38)" },
    drawBonsai(facts, theme, "reduced").svg,
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

function renderStrip(facts: TreeFacts, theme: Theme, opts: RenderOptions): string {
  const { width, height } = SCALE_SIZES.strip;
  const labels = labelsFor(opts.locale);
  const tree = group(
    { transform: "translate(4 -6) scale(0.22)" },
    drawBonsai(facts, theme, "silhouette").svg,
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
function renderButton(facts: TreeFacts, theme: Theme): string {
  const { width, height } = SCALE_SIZES.button;
  return [
    drawCard(width, height),
    drawBonsai(facts, theme, "glyph").svg,
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
  const validated = assertHistoryV1(history);
  if (!isSupportedBiome(opts.biome)) {
    throw new Error(`unsupported biome: ${escapeText(String(opts.biome))}`);
  }

  const facts = treeFacts(validated, date);
  const theme = themeByName(opts.theme);
  const { width, height } = SCALE_SIZES[opts.scale];

  const body =
    opts.scale === "full"
      ? renderFull(facts, theme, opts)
      : opts.scale === "compact"
        ? renderCompact(facts, theme, opts)
        : opts.scale === "strip"
          ? renderStrip(facts, theme, opts)
          : renderButton(facts, theme);

  const biography = biographyFor(facts, opts.locale);

  // Motion is the full badge's alone (TASTE §6): at the small scales the tree is
  // under half size and drifting dots read as speckle, not weather. When off,
  // nothing is appended, so a static card is byte-identical to one with no
  // animation layer at all - which is what makes `animate=off` a clean strip.
  const style =
    paletteStyles(theme, facts.season, tintRotation(facts.languages, opts.tint)) +
    (opts.animate && opts.scale === "full" ? animationStyles() : "");

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
