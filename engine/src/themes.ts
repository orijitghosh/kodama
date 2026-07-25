/**
 * Themes are data (SPEC-ENGINE §4): a palette of 14 named slots per colour
 * scheme, plus whether the theme has a night layer for fireflies and lantern
 * glow.
 *
 * ink and dusk carry the exact hex values specified in TASTE §3 and were judged
 * at Taste Gate #1. The remaining four follow the written directions there and
 * were finalized at Taste Gate #2 (`dev/taste/gate-2.md`, 24/24). All six are
 * approved palettes; changing any hex re-opens the gate that approved it, and
 * `taste-gate.test.ts` / `taste-gate-2.test.ts` say so on failure.
 */

import { shiftHex } from "./color.js";
import type { ColorShift } from "./color.js";
import { fnv1a32 } from "./rng.js";
import type { LangShare, Palette, RenderOptions, Season, Theme, ThemeName } from "./types.js";

const ink: Palette = {
  bg: "#101312",
  card: "#161a18",
  border: "#232927",
  trunk: "#4a4440",
  foliage1: "#3d5245",
  foliage2: "#4d6654",
  foliage3: "#5f7a64",
  blossom1: "#c98a94",
  blossom2: "#b06d79",
  fruit1: "#c96f3a",
  fruit2: "#e08b4e",
  accent: "#d97742",
  // Exact values from TASTE §3's ink specification.
  firefly: "#e8d9a0",
  glow: "#e0a35c",
  snow: "#dfe4e2",
  textPrimary: "#e8e6e1",
  textSecondary: "#9aa39d",
};

const dusk: Palette = {
  bg: "#2b2f45",
  card: "#333852",
  border: "#454b66",
  trunk: "#5c4f45",
  foliage1: "#46685a",
  foliage2: "#5a806c",
  foliage3: "#74997f",
  blossom1: "#e8a0b4",
  blossom2: "#d4738f",
  fruit1: "#d97e42",
  fruit2: "#edaa63",
  accent: "#e8c170",
  firefly: "#f0dfa8",
  glow: "#e8c170",
  snow: "#e4e8f0",
  textPrimary: "#f0eee8",
  textSecondary: "#a8aec4",
};

/** Unbleached washi with ink lines. The light counterpart for ink. */
const paper: Palette = {
  bg: "#f2efe6",
  card: "#e9e5d9",
  border: "#d6d1c2",
  trunk: "#6b5a4a",
  foliage1: "#5c7a63",
  foliage2: "#6a8a70",
  foliage3: "#7f9c84",
  blossom1: "#c98a94",
  blossom2: "#b5707e",
  fruit1: "#c4703c",
  fruit2: "#d98f52",
  accent: "#b5613a",
  // Light themes carry no night layer, but the slots must still hold sane
  // values: a theme is data, and a half-filled palette is a landmine for
  // whichever renderer reads it next.
  firefly: "#c9a14a",
  glow: "#c98a3c",
  snow: "#f7f5ee",
  textPrimary: "#2a2c28",
  textSecondary: "#6a6d64",
};

/** Blossom-forward on a washi base; spring-biased. */
const sakura: Palette = {
  bg: "#f7eef0",
  card: "#f0e2e6",
  border: "#e0cbd2",
  trunk: "#6f5b52",
  foliage1: "#6d8a72",
  foliage2: "#7d9a80",
  foliage3: "#93ac95",
  blossom1: "#f2b8c6",
  blossom2: "#e08fa6",
  fruit1: "#d08050",
  fruit2: "#e5a06a",
  accent: "#d4738f",
  firefly: "#d8a860",
  glow: "#d4903c",
  snow: "#f9f2f4",
  textPrimary: "#3a2c30",
  textSecondary: "#7d6a70",
};

/** Night bloom: deep indigo, petals catching lantern light. The beauty theme. */
const yozakura: Palette = {
  bg: "#1a1c2e",
  card: "#22243a",
  border: "#33365a",
  trunk: "#4a4048",
  foliage1: "#33475a",
  foliage2: "#42596c",
  foliage3: "#526d80",
  blossom1: "#f0b8d0",
  blossom2: "#d98fb4",
  fruit1: "#d4783f",
  fruit2: "#eda062",
  accent: "#e8c170",
  // The beauty theme: petals catch lantern light, so the glow runs warmer and
  // the fireflies paler than anywhere else.
  firefly: "#f0e0b0",
  glow: "#e8c170",
  snow: "#e0e4f4",
  textPrimary: "#f0ecf4",
  textSecondary: "#a09ac0",
};

/** Driftwood and sea glass over sand. */
const shore: Palette = {
  bg: "#eef0ea",
  card: "#e3e7de",
  border: "#cdd3c6",
  trunk: "#7d7266",
  foliage1: "#5f8578",
  foliage2: "#719a8a",
  foliage3: "#8bb0a0",
  blossom1: "#dba9a0",
  blossom2: "#c68d84",
  fruit1: "#c97c4a",
  fruit2: "#dfa06a",
  accent: "#5f8578",
  firefly: "#c9a14a",
  glow: "#c98a3c",
  snow: "#f4f7f2",
  textPrimary: "#2e332e",
  textSecondary: "#6c736a",
};

const shoreNight: Palette = {
  bg: "#1c2a2e",
  card: "#243438",
  border: "#35494e",
  trunk: "#6a6055",
  foliage1: "#3d5f57",
  foliage2: "#4d7568",
  foliage3: "#638d7c",
  blossom1: "#c99a92",
  blossom2: "#b07f78",
  fruit1: "#c97c4a",
  fruit2: "#dfa06a",
  accent: "#7fb0a0",
  firefly: "#e8d9a0",
  glow: "#dfa060",
  snow: "#dce8e4",
  textPrimary: "#e8eee9",
  textSecondary: "#9aa8a2",
};

const THEMES: Record<ThemeName, Theme> = {
  // ink is a night theme; in a light context it becomes washi rather than a
  // washed-out grey, so the default URL looks deliberate in both schemes.
  ink: { name: "ink", dark: ink, light: paper, night: true },
  dusk: { name: "dusk", dark: dusk, light: paper, night: true },
  paper: { name: "paper", dark: ink, light: paper, night: false },
  sakura: { name: "sakura", dark: yozakura, light: sakura, night: false },
  yozakura: { name: "yozakura", dark: yozakura, light: sakura, night: true },
  shore: { name: "shore", dark: shoreNight, light: shore, night: false },
};

export function themeByName(name: ThemeName): Theme {
  return THEMES[name];
}

/** Slot names, in the order they are emitted as CSS custom properties. */
export const PALETTE_SLOTS = [
  "bg",
  "card",
  "border",
  "trunk",
  "foliage1",
  "foliage2",
  "foliage3",
  "blossom1",
  "blossom2",
  "fruit1",
  "fruit2",
  "accent",
  "firefly",
  "glow",
  "snow",
  "textPrimary",
  "textSecondary",
] as const satisfies ReadonlyArray<keyof Palette>;

/**
 * How each season repaints the foliage (SPEC-ENGINE §3.5).
 *
 * Modulation happens here, in the emitted custom properties, rather than in
 * the drawing: the renderer already knows the date, so a season is a different
 * set of hexes on the same shapes. That keeps the seasonal look out of every
 * draw site and means a future biome inherits it for free.
 *
 * Only the foliage moves. Trunk, pot and text hold still so the tree stays
 * recognisably the same tree across a year - the season is weather, not a
 * different plant.
 */
const SEASON_SHIFTS: Record<Season, ColorShift | null> = {
  // The reference palettes are authored at high summer.
  summer: null,
  // New growth: lighter, a shade more yellow.
  spring: { towardHue: 96, towardAmount: 0.3, saturate: 1.08, lighten: 1.12 },
  // Amber. Two things have to be true at once or this lands in khaki: the hue
  // must actually arrive (a partial lerp from green stops in the yellows
  // around 54°, which is olive, not autumn), and the saturation must carry it
  // (the reference foliage sits near 14%, and a hue rotation on a near-grey
  // is still a near-grey). It stays darker and duller than the fruit slots so
  // a leaf is never mistaken for a persimmon.
  autumn: { towardHue: 30, towardAmount: 0.95, saturate: 2.6, lighten: 1.12 },
  // Cold and drained, but never grey: a bonsai in winter is still alive.
  winter: { towardHue: 150, towardAmount: 0.25, saturate: 0.55, lighten: 0.94 },
};

const FOLIAGE_SLOTS = ["foliage1", "foliage2", "foliage3"] as const;

/**
 * The language tint (`tint=lang`): the foliage green is nudged toward a hue
 * that is stable per top language, so a Rust tree and a Go tree read as subtly
 * different plants without either ceasing to be a tree. Capped at ±20° (the
 * IMPLEMENTATION 2.5 bound) and quantised to whole degrees so the emitted
 * bytes are reproducible; the whole thing hangs off a hash of the language
 * name, which is deterministic and needs no table to maintain.
 */
const TINT_LIMIT = 20;

export function tintRotation(languages: LangShare[], tint: RenderOptions["tint"]): number {
  if (tint !== "lang") return 0;
  const top = languages[0];
  if (top === undefined) return 0;
  return (fnv1a32(top.name.toLowerCase()) % (TINT_LIMIT * 2 + 1)) - TINT_LIMIT;
}

/**
 * The palette as the given season paints it, with any language tint folded in.
 *
 * Season and tint are composed into a single shift so the foliage is quantised
 * once rather than twice - a second hex round-trip would only add rounding
 * error. Both touch the foliage alone: trunk, pot and text hold still.
 *
 * Autumn is the one season a species overrides. A ginkgo in October and a pine
 * in October are different pictures, and the single global amber turned every
 * tree the same colour in the same week - which spent the seasonal wave the PRD
 * is counting on rather than multiplying it. Species passes its own shift here;
 * the other three seasons stay global, because new growth is new growth.
 */
export function paletteForSeason(
  palette: Palette,
  season: Season,
  tintDeg = 0,
  autumn: ColorShift | null = null,
): Palette {
  const base = season === "autumn" && autumn !== null ? autumn : SEASON_SHIFTS[season];
  if (base === null && tintDeg === 0) return palette;

  const shift: ColorShift = { ...base, rotate: (base?.rotate ?? 0) + tintDeg };
  const out = { ...palette };
  for (const name of FOLIAGE_SLOTS) {
    out[name] = shiftHex(palette[name], shift);
  }
  return out;
}

/** A palette slot referenced as a CSS variable in emitted markup. */
export function slot(name: keyof Palette): string {
  return `var(--kd-${name})`;
}

/**
 * Emits both colour schemes in one document (D-006): custom properties default
 * to the light palette, and a `prefers-color-scheme: dark` block overrides
 * them. One URL then serves both, which is what keeps the funnel to a single
 * pasted line.
 */
export function paletteStyles(
  theme: Theme,
  season: Season = "summer",
  tintDeg = 0,
  autumn: ColorShift | null = null,
): string {
  const declare = (palette: Palette): string =>
    PALETTE_SLOTS.map((name) => `--kd-${name}:${palette[name]}`).join(";");

  return (
    `svg{${declare(paletteForSeason(theme.light, season, tintDeg, autumn))}}` +
    `@media(prefers-color-scheme:dark){svg{${declare(paletteForSeason(theme.dark, season, tintDeg, autumn))}}}`
  );
}
