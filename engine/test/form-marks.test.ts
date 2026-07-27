/**
 * The four forms whose style is drawn rather than grown (C.4).
 *
 * `form-geometry.test.ts` proves the shaped skeletons. This file proves the other
 * half of the ladder: deadwood, exposed root, root over rock and moss ball share
 * the default skeleton, so everything that makes them a style is markup, and the
 * questions are different ones - does the mark land inside the frame, does it
 * appear for exactly the form that owns it, and can it say where it came from.
 *
 * Only four of the fourteen forms are reachable from the ten fixtures, so these
 * tests force `facts.form` directly. That is the point: `pnpm size` and the
 * goldens can only see the forms a fixture selects, and two of these four are not
 * among them.
 */

import { describe, expect, it } from "vitest";

import { drawBonsai } from "../src/biomes/bonsai.js";
import { treeFacts } from "../src/facts.js";
import { FORM_NAMES } from "../src/form.js";
import type { FormName } from "../src/form.js";
import { receiptsFor } from "../src/receipts.js";
import { speciesByName } from "../src/species.js";
import { themeByName } from "../src/themes.js";
import type { Detail } from "../src/biomes/bonsai.js";
import type { TreeFacts } from "../src/types.js";

import { allFixtures, FIXTURE_ANCHOR_DATE, loadFixture } from "./helpers/fixtures.js";

/** The three additive marks, and the class each one is drawn under. */
const MARK_CLASS: Partial<Record<FormName, string>> = {
  sharimiki: "kd-deadwood",
  neagari: "kd-roots",
  sekijoju: "kd-stone",
};

const FIXTURES = ["ghost", "newcomer", "grinder", "maintainer", "veteran", "whale"];

function factsAs(fixture: string, form: FormName): TreeFacts {
  return { ...treeFacts(loadFixture(fixture), FIXTURE_ANCHOR_DATE), form };
}

function draw(facts: TreeFacts, detail: Detail = "full"): string {
  return drawBonsai(facts, themeByName("ink"), speciesByName("classic"), detail).svg;
}

function has(svg: string, cls: string): boolean {
  return new RegExp(`class="[^"]*\\b${cls}\\b`).test(svg);
}

// ---------------------------------------------------------------------------
// Geometry, read back out of the markup
// ---------------------------------------------------------------------------

interface Box {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

/**
 * The extent of one drawn group, stroke width included.
 *
 * Every path in these marks is absolute M/L/Q/Z, so every number inside a `d`
 * is a coordinate and they pair up as x,y - which is what makes reading the
 * markup back a fair test rather than a re-derivation of the drawing code. Half
 * the stroke width is added on every side, because TASTE §4's tree region is
 * about ink on the canvas and a 6px stroke centred at x=468 puts ink at 471.
 */
function extentOf(svg: string, cls: string): Box {
  const groupMatch = new RegExp(`<g class="${cls}"([^>]*)>([\\s\\S]*?)</g>`).exec(svg);
  expect(groupMatch, `${cls} is not in the document`).not.toBeNull();
  const [, groupAttrs = "", body = ""] = groupMatch!;

  const inherited = /stroke-width="(-?[\d.]+)"/.exec(groupAttrs);
  const groupWidth = inherited === null ? 0 : Number(inherited[1]);

  const box: Box = { xmin: Infinity, xmax: -Infinity, ymin: Infinity, ymax: -Infinity };
  const grow = (x: number, y: number, pad: number): void => {
    box.xmin = Math.min(box.xmin, x - pad);
    box.xmax = Math.max(box.xmax, x + pad);
    box.ymin = Math.min(box.ymin, y - pad);
    box.ymax = Math.max(box.ymax, y + pad);
  };

  for (const element of body.match(/<(?:path|circle|ellipse)[^>]*\/>/g) ?? []) {
    const own = /stroke-width="(-?[\d.]+)"/.exec(element);
    const stroked = /stroke="(?!none)/.test(element) || groupWidth > 0 || own !== null;
    const width = own === null ? groupWidth : Number(own[1]);
    const pad = stroked ? width / 2 : 0;

    const d = /\sd="([^"]+)"/.exec(element);
    if (d !== null) {
      const nums = (d[1]!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      for (let i = 0; i + 1 < nums.length; i += 2) grow(nums[i]!, nums[i + 1]!, pad);
      continue;
    }

    const cx = Number(/\scx="(-?[\d.]+)"/.exec(element)?.[1] ?? NaN);
    const cy = Number(/\scy="(-?[\d.]+)"/.exec(element)?.[1] ?? NaN);
    if (Number.isNaN(cx)) continue;
    const r = Number(/\sr="(-?[\d.]+)"/.exec(element)?.[1] ?? NaN);
    if (!Number.isNaN(r)) {
      grow(cx, cy, r + pad);
      continue;
    }
    const rx = Number(/\srx="(-?[\d.]+)"/.exec(element)?.[1] ?? 0);
    const ry = Number(/\sry="(-?[\d.]+)"/.exec(element)?.[1] ?? 0);
    grow(cx - rx, cy - ry, pad);
    grow(cx + rx, cy + ry, pad);
  }
  return box;
}

describe("a mark is drawn for exactly the form that owns it", () => {
  it.each(Object.entries(MARK_CLASS))("draws %s as %s and nobody else does", (form, cls) => {
    for (const fixture of FIXTURES) {
      const drawnFor = FORM_NAMES.filter((name) => has(draw(factsAs(fixture, name)), cls!));
      // `sekijoju` is conditional on the repo anchor, so the expected set is
      // "its own form, or nothing at all" rather than always exactly one.
      expect(drawnFor, `${cls} on ${fixture}`).toEqual(
        drawnFor.length === 0 ? [] : [form as FormName],
      );
    }
  });

  it("replaces the pot for kokedama and for no other form", () => {
    for (const fixture of FIXTURES) {
      for (const form of FORM_NAMES) {
        const svg = draw(factsAs(fixture, form));
        // The pot is the only trapezoid in the substrate: a closed path of four
        // corners. The moss ball has no `Z`-closed path at all.
        const substrate = /<g class="kd-substrate">([\s\S]*?)<\/g>/.exec(svg)?.[1] ?? "";
        expect(/Z"/.test(substrate), `${form} on ${fixture}`).toBe(form !== "kokedama");
        expect(substrate.includes("--kd-foliage1"), `${form} on ${fixture}`).toBe(
          form === "kokedama",
        );
      }
    }
  });

  it("leaves the ten unmarked forms with no mark markup at all", () => {
    // The other half of D-042's promise: a form that adds nothing pays nothing.
    // Byte-identity of the default tree is held by the goldens; this holds that
    // no *other* form is quietly carrying a layer either.
    const marked = new Set([...Object.keys(MARK_CLASS), "kokedama"]);
    for (const fixture of FIXTURES) {
      for (const form of FORM_NAMES) {
        if (marked.has(form)) continue;
        const svg = draw(factsAs(fixture, form));
        for (const cls of Object.values(MARK_CLASS)) {
          expect(has(svg, cls!), `${form} on ${fixture} drew ${cls!}`).toBe(false);
        }
      }
    }
  });
});

describe("every mark stays inside the composition", () => {
  it("keeps mark ink inside the tree region (TASTE §4: x in [24, 470])", () => {
    for (const fixture of FIXTURES) {
      for (const [form, cls] of Object.entries(MARK_CLASS)) {
        const svg = draw(factsAs(fixture, form as FormName));
        if (!has(svg, cls!)) continue;
        const box = extentOf(svg, cls!);
        expect(box.xmin, `${form} left on ${fixture}`).toBeGreaterThanOrEqual(24);
        expect(box.xmax, `${form} right on ${fixture}`).toBeLessThanOrEqual(470);
      }
    }
  });

  it("keeps the moss ball inside the tree region at every pot tier", () => {
    // The ball is sized off pot width, so the stone tier is the wide case - and
    // it is the one a kokedama account is least likely to have, which is exactly
    // why it needs a test rather than an eyeball.
    for (const fixture of FIXTURES) {
      const box = extentOf(draw(factsAs(fixture, "kokedama")), "kd-substrate");
      expect(box.xmin, `left on ${fixture}`).toBeGreaterThanOrEqual(24);
      expect(box.xmax, `right on ${fixture}`).toBeLessThanOrEqual(470);
    }
  });

  it("keeps the deadwood vein on the trunk rather than beside it", () => {
    // The load-bearing claim of the vein: offset and width are both fractions of
    // the local girth, so it can never walk off the wood.
    //
    // Measured against the drawn branch strokes rather than against BASE_X,
    // because the trunk wanders as it rises - a fixed vertical line through the
    // base is not where the wood is by the time the vein ends, which is what a
    // first attempt at this test got wrong. Every vein point has to sit within
    // half a girth of some point on the branch skeleton.
    for (const fixture of FIXTURES) {
      const facts = factsAs(fixture, "sharimiki");
      const svg = draw(facts);
      if (!has(svg, "kd-deadwood")) continue;

      const points = (cls: string): Array<[number, number]> => {
        const body = new RegExp(`<g class="${cls}"[^>]*>([\\s\\S]*?)</g>`).exec(svg)?.[1] ?? "";
        const out: Array<[number, number]> = [];
        for (const d of body.match(/\sd="([^"]+)"/g) ?? []) {
          const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
          for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i]!, nums[i + 1]!]);
        }
        return out;
      };

      const trunk = points("kd-branches");
      const reach = Math.max(6, facts.trunkGirth * 0.5);
      for (const [vx, vy] of points("kd-deadwood")) {
        const nearest = Math.min(...trunk.map(([bx, by]) => Math.hypot(vx - bx, vy - by)));
        expect(nearest, `${fixture}: vein at ${String(vx)},${String(vy)} left the wood`).toBeLessThan(
          reach,
        );
      }
    }
  });
});

describe("the marks are deterministic and cheap", () => {
  it("draws the same markup every time", () => {
    for (const form of [...Object.keys(MARK_CLASS), "kokedama"] as FormName[]) {
      const facts = factsAs("maintainer", form);
      const first = draw(facts);
      for (let i = 0; i < 5; i += 1) expect(draw(facts), form).toBe(first);
    }
  });

  it("costs a rounding error against the size cap", () => {
    // Skeleton nodes are the byte budget and these marks add none, so the whole
    // cost is the markup itself. Held at 2 KB because the worst full-scale render
    // already sits near 92% of the 60 KB cap - there is no margin to spend, and a
    // mark that grew into kilobytes would be spending it invisibly.
    for (const fixture of FIXTURES) {
      const plain = draw(factsAs(fixture, "moyogi")).length;
      for (const form of [...Object.keys(MARK_CLASS), "kokedama"] as FormName[]) {
        const cost = draw(factsAs(fixture, form)).length - plain;
        expect(cost, `${form} on ${fixture} cost ${String(cost)} bytes`).toBeLessThan(2048);
      }
    }
  });

  it("draws no marks below reduced detail", () => {
    // strip and button are a silhouette and a glyph (TASTE §4). A rock a few
    // pixels across is bytes spent on something no eye resolves - the same
    // finding the butterflies cost this project once already.
    for (const [form, cls] of Object.entries(MARK_CLASS)) {
      for (const detail of ["silhouette", "glyph"] as Detail[]) {
        const svg = draw(factsAs("maintainer", form as FormName), detail);
        expect(has(svg, cls!), `${form} at ${detail}`).toBe(false);
      }
    }
  });

  it("still replaces the pot at every detail, because a kokedama has no pot", () => {
    // The exception to the rule above: skipping the ball would not omit a mark,
    // it would draw a pot for a form that has not got one.
    for (const detail of ["full", "reduced", "silhouette"] as Detail[]) {
      const substrate = /<g class="kd-substrate">([\s\S]*?)<\/g>/.exec(
        draw(factsAs("newcomer", "kokedama"), detail),
      )?.[1];
      expect(substrate, detail).toBeDefined();
      expect(substrate!.includes("--kd-foliage1"), detail).toBe(true);
    }
  });
});

describe("every mark says where it came from", () => {
  it("pairs each mark with its receipt in both directions, for every form", () => {
    // `receipts.test.ts` asserts this over the fixtures. It cannot reach
    // sharimiki or neagari, which no fixture selects - so the same rule is
    // asserted here over all fourteen forms with the form forced.
    for (const fixture of FIXTURES) {
      for (const form of FORM_NAMES) {
        const facts = factsAs(fixture, form);
        const svg = draw(facts);
        const targets = new Set(receiptsFor(facts, "en").map((r) => r.target));

        for (const cls of Object.values(MARK_CLASS)) {
          expect(targets.has(cls!), `${form} on ${fixture}: ${cls!} drawn unaccounted for`).toBe(
            has(svg, cls!),
          );
        }
      }
    }
  });

  it("names the repository the stone is", () => {
    for (const fixture of FIXTURES) {
      const facts = factsAs(fixture, "sekijoju");
      const anchor = facts.repoMix.anchor;
      const stone = receiptsFor(facts, "en").find((r) => r.target === "kd-stone");
      if (anchor === null) {
        // A stone that cannot name its repository is not drawn at all: the whole
        // form is the claim "this one project", and an anonymous rock is a lie.
        expect(stone, fixture).toBeUndefined();
        expect(has(draw(facts), "kd-stone"), fixture).toBe(false);
        continue;
      }
      expect(stone?.value, fixture).toBe(anchor.nameWithOwner);
      expect(stone?.provenance, fixture).toContain(anchor.nameWithOwner);
    }
  });

  it("describes the ground as a moss ball when the ground is a moss ball", () => {
    for (const fixture of FIXTURES) {
      const ground = receiptsFor(factsAs(fixture, "kokedama"), "en").find(
        (r) => r.target === "kd-substrate",
      );
      expect(ground?.label, fixture).toBe("moss ball");
      // The pot tier is still a true fact about the account, so the receipt is
      // not allowed to drop it just because no pot is drawn.
      expect(ground?.provenance, fixture).toContain("year");
      expect(ground?.value, fixture).not.toContain("pot");
    }
  });

  it("keeps a pot receipt for every form that draws a pot", () => {
    for (const fixture of FIXTURES) {
      for (const form of FORM_NAMES) {
        if (form === "kokedama") continue;
        const facts = factsAs(fixture, form);
        const ground = receiptsFor(facts, "en").find((r) => r.target === "kd-substrate");
        expect(ground?.value, `${form} on ${fixture}`).toBe(`${facts.potTier} pot`);
      }
    }
  });
});

describe("the fixtures that select a draw-layer form get its mark", () => {
  it.each(allFixtures())("%s draws whatever its own form owns", (_name, history) => {
    // The end-to-end check: no forced form, just the tree an account gets.
    const facts = treeFacts(history, FIXTURE_ANCHOR_DATE);
    const svg = drawBonsai(facts, themeByName("ink"), speciesByName("classic")).svg;
    const cls = MARK_CLASS[facts.form];

    if (facts.form === "kokedama") {
      expect(/<g class="kd-substrate">[\s\S]*?--kd-foliage1/.test(svg)).toBe(true);
    } else if (cls !== undefined && facts.repoMix.anchor !== null) {
      expect(has(svg, cls), `${facts.form}`).toBe(true);
    }
  });
});
