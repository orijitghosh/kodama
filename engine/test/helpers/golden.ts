/**
 * The golden matrix, shared by the comparison test and the update script so the
 * two can never drift into disagreeing about what is supposed to be on disk.
 *
 * Goldens are the regression net under D-002's determinism promise: they catch
 * a changed *drawing* the way the determinism tests catch a changed *number*.
 */

import { resolve } from "node:path";
import type { RenderOptions, ThemeName } from "../../src/types.js";
import { GALLERY_FIXTURES, FIXTURE_ANCHOR_DATE } from "./fixtures.js";

export const GOLDEN_DIR = resolve(import.meta.dirname, "../golden");

/** Both shipped themes, judged at the taste gate (TASTE §5). */
export const GOLDEN_THEMES: ThemeName[] = ["ink", "dusk"];

export const GOLDEN_OPTIONS: RenderOptions = {
  biome: "bonsai",
  theme: "ink",
  scale: "full",
  animate: false,
  tint: "none",
  locale: "en",
};

/**
 * One date per season (SPEC-ENGINE §3.5), all at or before the fixture anchor
 * so every render sees a complete history rather than a truncated one.
 *
 * Each deliberately avoids the special windows - hanami (Apr 1-7), harvest
 * (Oct 15-21), first snow (Dec 1-3) - so these goldens pin the *ordinary*
 * seasonal look. The event windows get their own cases once 2.3 draws them;
 * folding both into one date would leave neither pinned.
 */
export const GOLDEN_SEASONS: Array<{ season: string; date: string }> = [
  { season: "winter", date: "2026-01-20" },
  { season: "spring", date: "2026-04-15" },
  { season: "summer", date: FIXTURE_ANCHOR_DATE },
  { season: "autumn", date: "2025-10-08" },
];

export interface GoldenCase {
  fixture: string;
  theme: ThemeName;
  season: string;
  /** File name only; joined against GOLDEN_DIR by the caller. */
  file: string;
  date: string;
  animate: boolean;
}

export function goldenCases(): GoldenCase[] {
  const cases: GoldenCase[] = [];
  for (const fixture of GALLERY_FIXTURES) {
    for (const theme of GOLDEN_THEMES) {
      for (const { season, date } of GOLDEN_SEASONS) {
        cases.push({
          fixture,
          theme,
          season,
          file: `${fixture}.${theme}.${season}.svg`,
          date,
          animate: false,
        });
      }
    }
  }

  // Animate is the full badge's only, and the static block is identical for
  // every tree (animate.ts), so one date pins it - but across all six fixtures
  // and both themes, so the case that a fixture's own layers (a whale's snow, a
  // firefly ring) compose with the block is covered, not just asserted.
  const summer = GOLDEN_SEASONS.find((s) => s.season === "summer");
  if (summer !== undefined) {
    for (const fixture of GALLERY_FIXTURES) {
      for (const theme of GOLDEN_THEMES) {
        cases.push({
          fixture,
          theme,
          season: summer.season,
          file: `${fixture}.${theme}.${summer.season}.anim.svg`,
          date: summer.date,
          animate: true,
        });
      }
    }
  }
  return cases;
}
