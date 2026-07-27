/**
 * The golden matrix, shared by the comparison test and the update script so the
 * two can never drift into disagreeing about what is supposed to be on disk.
 *
 * Goldens are the regression net under D-002's determinism promise: they catch
 * a changed *drawing* the way the determinism tests catch a changed *number*.
 */

import { resolve } from "node:path";
import type { FormName } from "../../src/form.js";
import type { NormalizedHistory, RenderOptions, ThemeName } from "../../src/types.js";
import { FORM_CASES, FORM_CASE_DATE } from "./form-cases.js";
import { GALLERY_FIXTURES, FIXTURE_ANCHOR_DATE, loadFixture } from "./fixtures.js";

export const GOLDEN_DIR = resolve(import.meta.dirname, "../golden");

/** Both shipped themes, judged at the taste gate (TASTE §5). */
export const GOLDEN_THEMES: ThemeName[] = ["ink", "dusk"];

export const GOLDEN_OPTIONS: RenderOptions = {
  biome: "bonsai",
  theme: "ink",
  scale: "full",
  animate: false,
  tint: "none",
  species: "classic",
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

/**
 * The one axis the form goldens are pinned at. Form changes the *outline*, and an
 * outline is legible at any theme or season, so multiplying the fourteen out over
 * the matrix would buy fourteen times the bytes for the same regression. One theme,
 * one season, one scale - and the fixture goldens above already cover the matrix.
 */
export const FORM_GOLDEN_THEME: ThemeName = "ink";
export const FORM_GOLDEN_SEASON = "summer";

export interface GoldenCase {
  /**
   * Test label and file stem: a gallery fixture's name, or `form-<form>` for one
   * of the crafted accounts. Prefixed so the two families can never collide on a
   * file name, and so the prune step in `update-goldens.ts` reads honestly.
   */
  name: string;
  /** The form this case exists to draw, for the cases that exist to draw one. */
  form?: FormName;
  theme: ThemeName;
  season: string;
  /** File name only; joined against GOLDEN_DIR by the caller. */
  file: string;
  date: string;
  animate: boolean;
  /** Resolved lazily: neither caller needs the histories it is not rendering. */
  history: () => NormalizedHistory;
}

export function goldenCases(): GoldenCase[] {
  const cases: GoldenCase[] = [];
  for (const fixture of GALLERY_FIXTURES) {
    for (const theme of GOLDEN_THEMES) {
      for (const { season, date } of GOLDEN_SEASONS) {
        cases.push({
          name: fixture,
          theme,
          season,
          file: `${fixture}.${theme}.${season}.svg`,
          date,
          animate: false,
          history: () => loadFixture(fixture),
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
          name: fixture,
          theme,
          season: summer.season,
          file: `${fixture}.${theme}.${summer.season}.anim.svg`,
          date: summer.date,
          animate: true,
          history: () => loadFixture(fixture),
        });
      }
    }
  }

  // One golden per form. Only four of the fourteen forms are reachable from the
  // ten fixtures (gate-4.md), so without these the regression net covers four
  // silhouettes and guesses at ten - the same hole the taste gate had to route
  // around. The accounts are the crafted ones, which go through `selectForm`
  // exactly as a real account does; `form.test.ts` is what asserts each still
  // lands on its rung, so a golden here can never be the only thing claiming it.
  for (const { form, history } of FORM_CASES) {
    cases.push({
      name: `form-${form}`,
      form,
      theme: FORM_GOLDEN_THEME,
      season: FORM_GOLDEN_SEASON,
      file: `form-${form}.${FORM_GOLDEN_THEME}.${FORM_GOLDEN_SEASON}.svg`,
      date: FORM_CASE_DATE,
      animate: false,
      history: () => history,
    });
  }

  return cases;
}
