/**
 * Per-form geometry properties (C.4, D-042).
 *
 * `trunks.test.ts` proves the multi-trunk primitive. This file proves the other
 * half: that every one of the fourteen forms draws a tree that is postable at all
 * maturities and seeds, and that no form buys its look by shedding foliage.
 *
 * The assertions are the same three the trunk plans already answer to - frame,
 * pad count, monotonicity - applied across `FORM_GEOMETRY` by iteration rather
 * than by name, so a style added after this commit inherits them automatically.
 */

import { describe, expect, it } from "vitest";
import { FORM_GEOMETRY, UNCHANGED_SKELETON_FORMS, geometryFor } from "../src/form-geometry.js";
import { FORM_NAMES } from "../src/form.js";
import { attractorCloud, buildSkeleton, padCountFor, BASE_Y } from "../src/skeleton.js";
import { seedFromLogin } from "../src/rng.js";
import { FIXTURE_NAMES } from "./helpers/fixtures.js";

const SEEDS = FIXTURE_NAMES.map(seedFromLogin);
const LEVELS = [3, 5, 8, 11, 13];
const FORMS = Object.entries(FORM_GEOMETRY);

function skeletonFor(form: string, seed: number, maturity: number) {
  const { trunks, cloud } = geometryFor(form as never);
  return buildSkeleton(seed, maturity, trunks, cloud);
}

describe("the default output is untouched", () => {
  it("draws the seeded cloud when no shape is given", () => {
    for (const seed of SEEDS) {
      expect(attractorCloud(seed, {})).toEqual(attractorCloud(seed));
    }
  });

  it("gives moyogi and the draw-layer styles the tree they always had", () => {
    // The load-bearing claim of C.4: five of the fourteen forms are not allowed
    // to move a single node, because their work happens in the draw layer.
    expect(UNCHANGED_SKELETON_FORMS).toEqual([
      "kokedama",
      "sekijoju",
      "neagari",
      "sharimiki",
      "moyogi",
    ]);

    for (const form of UNCHANGED_SKELETON_FORMS) {
      for (const seed of SEEDS) {
        for (const maturity of LEVELS) {
          expect(skeletonFor(form, seed, maturity), form).toEqual(
            buildSkeleton(seed, maturity),
          );
        }
      }
    }
  });
});

describe("every form is a complete table entry", () => {
  it("covers every name in the ladder", () => {
    expect(Object.keys(FORM_GEOMETRY).sort()).toEqual([...FORM_NAMES].sort());
  });

  it("is deterministic", () => {
    for (const [form] of FORMS) {
      const first = skeletonFor(form, seedFromLogin("maintainer"), 8);
      for (let i = 0; i < 10; i += 1) {
        expect(skeletonFor(form, seedFromLogin("maintainer"), 8), form).toEqual(first);
      }
    }
  });
});

describe("every form owes the same pads (C.6 rule 1)", () => {
  it("places exactly padCountFor(maturity), whatever the style", () => {
    // bunjin is the reason this test exists: the proposal's "2-3 pads regardless
    // of maturity" would fail here, and a crown shrunk far enough to starve
    // buildPads of tips fails here too.
    for (const [form] of FORMS) {
      for (const seed of SEEDS) {
        for (const maturity of LEVELS) {
          const skeleton = skeletonFor(form, seed, maturity);
          expect(skeleton.pads.length, `${form}@${String(maturity)}`).toBe(
            padCountFor(maturity),
          );
        }
      }
    }
  });

  it("never sheds a pad when the style itself changes", () => {
    // A restyle arrives on a level-up. Whatever it lands on must not look pruned.
    for (const seed of SEEDS) {
      for (const maturity of LEVELS) {
        const counts = FORMS.map(([form]) => skeletonFor(form, seed, maturity).pads.length);
        expect(Math.min(...counts), `@${String(maturity)}`).toBe(Math.max(...counts));
      }
    }
  });

  it("never sheds a pad on a level-up, whatever the style", () => {
    for (const [form] of FORMS) {
      for (const seed of SEEDS.slice(0, 3)) {
        let previous = 0;
        for (let maturity = 3; maturity <= 13; maturity += 1) {
          const pads = skeletonFor(form, seed, maturity).pads.length;
          expect(pads, `${form}@${String(maturity)}`).toBeGreaterThanOrEqual(previous);
          previous = pads;
        }
      }
    }
  });
});

describe("every form stays inside the composition", () => {
  it("keeps the crown clear of the header zone (TASTE §4: y >= 80)", () => {
    for (const [form] of FORMS) {
      for (const seed of SEEDS) {
        for (const maturity of LEVELS) {
          const { nodes } = skeletonFor(form, seed, maturity);
          const highest = Math.min(...nodes.map((node) => node.y));
          expect(highest, `${form}@${String(maturity)}`).toBeGreaterThanOrEqual(80);
        }
      }
    }
  });

  it("keeps every node inside the tree region (TASTE §4: x in [24, 470])", () => {
    for (const [form] of FORMS) {
      for (const seed of SEEDS) {
        for (const maturity of LEVELS) {
          for (const node of skeletonFor(form, seed, maturity).nodes) {
            expect(node.x, `${form} left @${String(maturity)}`).toBeGreaterThanOrEqual(24);
            expect(node.x, `${form} right @${String(maturity)}`).toBeLessThanOrEqual(470);
          }
        }
      }
    }
  });

  it("never grows below the soil line", () => {
    // Rotation and doming both move points toward the pot, so this is the check
    // that a shape has not pushed the crown underground.
    for (const [form] of FORMS) {
      for (const seed of SEEDS) {
        const { nodes } = skeletonFor(form, seed, 13);
        for (const node of nodes) {
          expect(node.y, `${form}`).toBeLessThanOrEqual(BASE_Y);
        }
      }
    }
  });
});

describe("no form costs more than the tree already cost", () => {
  it("keeps every form's node count near the single trunk's", () => {
    // Skeleton nodes are the byte budget: branch strokes are the most expensive
    // thing in the document, at roughly 74 B a node on a level-13 account. This
    // is asserted as a node count rather than as bytes because it is the cheap
    // proxy - measuring 14 forms across every scale, species and animation state
    // takes minutes, and `pnpm size` cannot see a form no fixture selects.
    //
    // It is also the test that would have caught C.4's real defect. Four trunk
    // plans and two crown shapes went over the 60 KB full-scale cap on their
    // first render, and CI called it green: the size script measured one static
    // `classic` combination at 72% of cap while the true worst case, animated
    // `sakura`, was already at 94.9%. There is no margin to spend here.
    const seed = seedFromLogin("whale");
    const baseline = buildSkeleton(seed, 13).nodes.length;

    for (const [form] of FORMS) {
      const nodes = skeletonFor(form, seed, 13).nodes.length;
      expect(nodes, `${form} grew ${String(nodes)} nodes against ${String(baseline)}`).toBeLessThanOrEqual(
        Math.ceil(baseline * 1.05),
      );
    }
  });
});

describe("the shaped forms actually differ", () => {
  it("draws a different tree than moyogi for every shaped style", () => {
    // A form that reads identically to the informal upright is a form that does
    // not exist, and would make its receipt a lie.
    const shaped = FORM_NAMES.filter((name) => !UNCHANGED_SKELETON_FORMS.includes(name));
    for (const form of shaped) {
      for (const seed of SEEDS.slice(0, 3)) {
        expect(skeletonFor(form, seed, 11).nodes, form).not.toEqual(
          buildSkeleton(seed, 11).nodes,
        );
      }
    }
  });

  it("gives chokkan a crown centred on its own trunk", () => {
    // The one claim the style is named for: no lean, no tilt.
    for (const seed of SEEDS) {
      const cloud = attractorCloud(seed, FORM_GEOMETRY.chokkan.cloud);
      const xs = cloud.map((point) => point.x);
      const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
      expect(Math.abs(centre - 236), String(seed)).toBeLessThan(12);
    }
  });

  it("combs fukinagashi's crown to one side", () => {
    // Measured as reach, not as a headcount either side of the axis: the bias
    // scales each point's radius and never moves it across the centre, so the
    // population split stays ~50/50 however extreme the wind is. What changes -
    // and what a viewer actually sees - is how far the crown gets on each side.
    for (const seed of SEEDS) {
      const cloud = attractorCloud(seed, FORM_GEOMETRY.fukinagashi.cloud);
      const centre = 236 + (FORM_GEOMETRY.fukinagashi.cloud.leanX ?? 0);
      const right = Math.max(...cloud.map((point) => point.x)) - centre;
      const left = centre - Math.min(...cloud.map((point) => point.x));
      expect(right / left, String(seed)).toBeGreaterThan(2);
    }
  });

  it("flattens the underside of a domed crown", () => {
    // Asserted on the primitive rather than on hokidachi's composite shape,
    // because that form also overrides lean and tilt - a comparison against the
    // plain cloud would not isolate what `domed` does. Same reason the midpoint
    // is not the reference: compressing the underside moves the midpoint up, so
    // measuring against it hides the effect it is meant to detect.
    for (const seed of SEEDS) {
      const plain = attractorCloud(seed);
      const dome = attractorCloud(seed, { domed: 0.62 });
      const lowest = (points: { y: number }[]) => Math.max(...points.map((p) => p.y));
      const highest = (points: { y: number }[]) => Math.min(...points.map((p) => p.y));

      // The bottom lifts...
      expect(lowest(dome), String(seed)).toBeLessThan(lowest(plain));
      // ...and the apex stays where it was, so this is a dome and not a shrink.
      expect(highest(dome), String(seed)).toBeCloseTo(highest(plain), 5);
    }
  });

  it("keeps bunjin's crown small and high", () => {
    for (const seed of SEEDS) {
      const plain = attractorCloud(seed);
      const literati = attractorCloud(seed, FORM_GEOMETRY.bunjin.cloud);
      const spread = (points: { x: number; y: number }[]) =>
        Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
      expect(spread(literati), String(seed)).toBeLessThan(spread(plain));
      const meanY = (points: { y: number }[]) =>
        points.reduce((sum, p) => sum + p.y, 0) / points.length;
      expect(meanY(literati), String(seed)).toBeLessThan(meanY(plain));
    }
  });

  it("leans shakan out of its pot", () => {
    // Rotation is about the base, so the crown moves and the base does not.
    for (const seed of SEEDS) {
      const plain = attractorCloud(seed);
      const slanted = attractorCloud(seed, FORM_GEOMETRY.shakan.cloud);
      const meanX = (points: { x: number }[]) =>
        points.reduce((sum, p) => sum + p.x, 0) / points.length;
      expect(meanX(slanted), String(seed)).not.toBeCloseTo(meanX(plain), 0);
    }
  });
});
