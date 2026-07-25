import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { render } from "../src/render.js";
import type { RenderOptions, ThemeName } from "../src/types.js";

import { GALLERY_FIXTURES, loadFixture } from "./helpers/fixtures.js";
import { withoutSpokenText } from "./helpers/gate.js";

/**
 * Gate #2 is binding the same way Gate #1 is (TASTE §5): 24 images - the four
 * themes Gate #1 never judged, across the six gallery fixtures - reviewed one by
 * one, with "would you post this?" answered yes for every one
 * (`dev/taste/gate-2.md`, 24/24, 2026-07-23). This suite asks whether the engine
 * still draws what was approved.
 *
 * Like `taste-gate.test.ts`, it is not the golden suite. Goldens pin today's
 * output against yesterday's to catch accidents; this pins today's output against
 * a human decision, and it is meant to fail when the drawing or a palette
 * changes. A failure is a re-gate request: change the tree deliberately, re-render
 * with `pnpm --filter @kodama/engine gate:2`, walk TASTE §5 again, commit both.
 *
 * Two differences from Gate #1's lock, both because this gate was rendered after
 * M3 rather than before it.
 *
 * There is no firefly normalizer. Gate #1's artifacts predate the animation
 * layer, so its lock tolerates the one structural wrapper added since; these
 * renders already contain it, and the comparison is exact.
 *
 * The date is single. Gate #2 judged colour only - the geometry is Gate #1's,
 * unchanged, at the same summer date - so there is no winter frame to pin here.
 * Season modulation is theme-independent and is covered by `seasons.test.ts`.
 */

const GATE_DIR = resolve(import.meta.dirname, "../../dev/taste/gate-2");

/** High summer: the reference date the four palettes were tuned at. */
const GATE_DATE = "2026-07-15";

/** The four themes Gate #1 left unjudged. */
const GATE_THEMES: ThemeName[] = ["paper", "sakura", "yozakura", "shore"];

const GATE_OPTIONS: Omit<RenderOptions, "theme"> = {
  biome: "bonsai",
  scale: "full",
  animate: false,
  tint: "none",
  species: "classic",
  locale: "en",
};

const cases = GALLERY_FIXTURES.flatMap((fixture) =>
  GATE_THEMES.map((theme) => ({ fixture, theme })),
);

describe("taste gate #2 artifacts", () => {
  it("covers all twenty-four judged images, six per theme", () => {
    expect(cases.length).toBe(24);
    expect(GALLERY_FIXTURES.length).toBe(6);
  });

  it.each(cases)("$fixture-$theme still draws what was approved", (c) => {
    const approved = readFileSync(
      resolve(GATE_DIR, `${c.fixture}-${c.theme}-summer.svg`),
      "utf8",
    );
    const current = render(loadFixture(c.fixture), GATE_DATE, {
      ...GATE_OPTIONS,
      theme: c.theme,
    });

    expect(
      withoutSpokenText(current),
      "the drawing has changed since taste gate #2 approved it - re-render " +
        "dev/taste/gate-2/ and re-run TASTE §5 rather than editing this test",
    ).toBe(withoutSpokenText(approved));
  });
});
