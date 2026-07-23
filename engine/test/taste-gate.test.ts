import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { render } from "../src/render.js";
import type { RenderOptions, ThemeName } from "../src/types.js";

import { GALLERY_FIXTURES, loadFixture } from "./helpers/fixtures.js";

/**
 * Gate #1 is binding (TASTE §5): twelve images, reviewed one by one, with
 * "would you post this?" answered yes for every one. The approval attaches to
 * the pictures, not to the code that produced them - so this suite asks
 * whether the engine still draws what was approved.
 *
 * It is not the golden suite. Goldens pin today's output against yesterday's to
 * catch accidents; this pins today's output against a human decision, and it
 * is meant to fail when the drawing changes. A failure here is not a bug report,
 * it is a re-gate request: change the tree deliberately, re-render the
 * artifacts, walk TASTE §5 again, commit both.
 *
 * The one tolerated difference is structural. Since the gate, M3.2's animation
 * layer wraps each firefly in its own `<g class="kd-firefly">` so it can drift
 * independently. That adds nodes without moving a pixel, and the normalizer
 * below removes exactly that wrapper and nothing else - if a second structural
 * change ever needs tolerating, it has to be argued for here in the open rather
 * than absorbed by a looser comparison.
 */

const GATE_DIR = resolve(import.meta.dirname, "../../dev/taste/gate-1");

/** TASTE §5: full scale, both themes, one summer and one winter date. */
const GATE_DATES: Record<string, string> = {
  summer: "2026-07-15",
  winter: "2026-01-20",
};

const GATE_THEMES: ThemeName[] = ["ink", "dusk"];

const GATE_OPTIONS: Omit<RenderOptions, "theme"> = {
  biome: "bonsai",
  scale: "full",
  animate: false,
  tint: "none",
  locale: "en",
};

/** Strips the per-firefly group the animation layer added after the gate. */
function asGated(svg: string): string {
  return svg.replace(/<g class="kd-firefly">(.*?)<\/g>/g, "$1");
}

const cases = GALLERY_FIXTURES.flatMap((fixture) =>
  GATE_THEMES.flatMap((theme) =>
    Object.keys(GATE_DATES).map((season) => ({ fixture, theme, season })),
  ),
);

describe("taste gate #1 artifacts", () => {
  it("covers all twelve judged images, twice over for the two dates", () => {
    expect(cases.length).toBe(24);
  });

  it.each(cases)("$fixture-$theme-$season still draws what was approved", (c) => {
    const approved = readFileSync(
      resolve(GATE_DIR, `${c.fixture}-${c.theme}-${c.season}.svg`),
      "utf8",
    );
    const current = render(loadFixture(c.fixture), GATE_DATES[c.season]!, {
      ...GATE_OPTIONS,
      theme: c.theme,
    });

    expect(
      asGated(current),
      "the drawing has changed since the taste gate approved it - re-render " +
        "dev/taste/gate-1/ and re-run TASTE §5 rather than editing this test",
    ).toBe(approved);
  });
});
