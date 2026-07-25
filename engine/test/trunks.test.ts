/**
 * Multi-root skeleton properties (C.3, D-042).
 *
 * The proposal calls this the only real engine work in the whole of form, and the
 * reason is that four styles and the future Grove feature all rest on it. So the
 * properties are asserted over generated plans and many seeds rather than on one
 * picture: a twin trunk that looks right for `maintainer` at level 8 says almost
 * nothing about a raft at level 5.
 *
 * Two of these tests are the ones that matter.
 *
 * The first is byte-identity for the default. Nothing in this file is allowed to
 * change the tree that is already in people's READMEs, and `SINGLE_TRUNK` taking
 * a genuinely untransformed path is what makes that true (D-042).
 *
 * The second is the pad-count invariant. C.6 rule 1 says form may never change
 * `padCountFor(maturity)` - styles redistribute pads, they never remove one - and
 * this is where that promise is either kept or broken.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_SKELETON_NODES,
  BASE_X,
  BASE_Y,
  buildSkeleton,
  padCountFor,
  SINGLE_TRUNK,
} from "../src/skeleton.js";
import type { TrunkPlan } from "../src/skeleton.js";
import { seedFromLogin } from "../src/rng.js";
import { FIXTURE_NAMES } from "./helpers/fixtures.js";

const SEEDS = FIXTURE_NAMES.map(seedFromLogin);
const LEVELS = [3, 5, 8, 11, 13];

/**
 * The plans the four multi-trunk styles will use, named here so the properties
 * are asserted against the geometry that will actually ship rather than against
 * arbitrary numbers (PROPOSAL-VARIETALS §3).
 */
const PLANS: Record<string, readonly TrunkPlan[]> = {
  single: SINGLE_TRUNK,
  // Twin trunk: a second stem from the base at about 60% of the main height.
  sokan: [
    { dx: 0, reach: 1 },
    { dx: 46, reach: 0.62 },
  ],
  // Clump: three to five stems off one root mass, tallest first.
  kabudachi: [
    { dx: -34, reach: 0.74 },
    { dx: 0, reach: 1 },
    { dx: 30, reach: 0.83 },
    { dx: 62, reach: 0.58 },
  ],
  // Forest: five graded trees in one tray. The outer offsets are ±72 and not
  // ±96 because the wider spread put the leftmost tree's crown at x = 21.5,
  // outside the tree region TASTE §4 allows - the composition test below caught
  // it, which is the entire reason these plans are asserted against the frame
  // rather than eyeballed.
  yoseUe: [
    { dx: -72, reach: 0.55 },
    { dx: -38, reach: 0.78 },
    { dx: 0, reach: 1 },
    { dx: 38, reach: 0.86 },
    { dx: 72, reach: 0.6 },
  ],
  // Raft: several trunks off a fallen stem, none of them dominant. Outer stems
  // at ±64 for the same reason the forest's are at ±72 - at ±78 the left crown
  // reached x = 23.4 and left the frame.
  ikadabuki: [
    { dx: -64, reach: 0.66 },
    { dx: -22, reach: 0.82 },
    { dx: 22, reach: 0.79 },
    { dx: 64, reach: 0.63 },
  ],
};

const MULTI = Object.entries(PLANS).filter(([name]) => name !== "single");

function rootsOf(nodes: { parent: number }[]): number {
  return nodes.filter((node) => node.parent < 0).length;
}

describe("the default plan changes nothing", () => {
  it("is what an omitted argument means, node for node", () => {
    for (const seed of SEEDS) {
      for (const maturity of LEVELS) {
        expect(buildSkeleton(seed, maturity, SINGLE_TRUNK)).toEqual(
          buildSkeleton(seed, maturity),
        );
      }
    }
  });

  it("puts the one root exactly on the trunk base", () => {
    const skeleton = buildSkeleton(seedFromLogin("veteran"), 7);
    expect(rootsOf(skeleton.nodes)).toBe(1);
    expect(skeleton.nodes[0]).toMatchObject({ x: BASE_X, y: BASE_Y, parent: -1 });
  });
});

describe("multi-trunk skeletons", () => {
  it("seeds one root per trunk, at the offset the plan asked for", () => {
    for (const [name, plan] of MULTI) {
      const skeleton = buildSkeleton(seedFromLogin("grinder"), 9, plan);
      expect(rootsOf(skeleton.nodes), name).toBe(plan.length);

      const rootXs = skeleton.nodes.filter((n) => n.parent < 0).map((n) => n.x);
      expect(rootXs, name).toEqual(plan.map((trunk) => BASE_X + trunk.dx));
      for (const node of skeleton.nodes.filter((n) => n.parent < 0)) {
        expect(node.y, name).toBe(BASE_Y);
        expect(node.depth, name).toBe(0);
      }
    }
  });

  it("is deterministic", () => {
    for (const [name, plan] of MULTI) {
      const seed = seedFromLogin("maintainer");
      const first = buildSkeleton(seed, 8, plan);
      for (let i = 0; i < 20; i += 1) {
        expect(buildSkeleton(seed, 8, plan), name).toEqual(first);
      }
    }
  });

  it("keeps every parent a real node earlier in the array", () => {
    // The invariant the draw layer indexes on. A parent pointing forward, or at
    // -1 anywhere but a trunk base, is a NaN in a path attribute.
    for (const [name, plan] of MULTI) {
      for (const seed of SEEDS) {
        const { nodes } = buildSkeleton(seed, 11, plan);
        for (let i = 0; i < nodes.length; i += 1) {
          const parent = nodes[i]!.parent;
          if (parent < 0) {
            expect(parent, `${name}@${String(i)}`).toBe(-1);
            continue;
          }
          expect(parent, `${name}@${String(i)}`).toBeLessThan(i);
          expect(nodes[parent], `${name}@${String(i)}`).toBeDefined();
        }
      }
    }
  });

  it("gives every trunk a share of the crown to grow into", () => {
    // A trunk with no attractors is a stub at the soil. That is a legal outcome
    // of a bad plan, so the plans that ship must not produce it.
    for (const [name, plan] of MULTI) {
      for (const seed of SEEDS) {
        const { nodes } = buildSkeleton(seed, 9, plan);
        const grown = nodes.filter((node) => node.depth > 0).length;
        expect(grown, `${name} grew nothing`).toBeGreaterThan(plan.length * 2);
      }
    }
  });
});

describe("the pad-count invariant (C.6 rule 1)", () => {
  it("owes every maturity the same pads on every plan", () => {
    // The load-bearing promise of the whole feature: a restyle redistributes
    // foliage, it never sheds it. If this fails, form breaks D-005 and no amount
    // of calibration fixes it.
    for (const [name, plan] of Object.entries(PLANS)) {
      for (const seed of SEEDS) {
        for (const maturity of LEVELS) {
          const skeleton = buildSkeleton(seed, maturity, plan);
          expect(skeleton.pads.length, `${name}@${String(maturity)}`).toBe(
            padCountFor(maturity),
          );
        }
      }
    }
  });

  it("never sheds pads on a level-up, whatever the plan", () => {
    for (const [name, plan] of Object.entries(PLANS)) {
      for (const seed of SEEDS.slice(0, 4)) {
        let previous = 0;
        for (let maturity = 3; maturity <= 13; maturity += 1) {
          const pads = buildSkeleton(seed, maturity, plan).pads.length;
          expect(pads, `${name}@${String(maturity)}`).toBeGreaterThanOrEqual(previous);
          previous = pads;
        }
      }
    }
  });

  it("never sheds pads when the style itself changes", () => {
    // The case D-042's monotonicity rules exist for: a restyle arrives on a
    // level-up, and the tree must not look pruned by it.
    for (const seed of SEEDS) {
      for (const maturity of LEVELS) {
        const counts = Object.values(PLANS).map(
          (plan) => buildSkeleton(seed, maturity, plan).pads.length,
        );
        expect(Math.min(...counts)).toBe(Math.max(...counts));
      }
    }
  });
});

describe("multi-trunk stays inside the composition", () => {
  it("keeps the crown clear of the header zone", () => {
    // TASTE §4: nothing above y = 80. `reach` only ever shrinks a share toward
    // the soil, so the ceiling the single trunk respects holds for all of them -
    // this is the test that catches a future plan that scales the wrong way.
    for (const [name, plan] of Object.entries(PLANS)) {
      for (const seed of SEEDS) {
        const { nodes } = buildSkeleton(seed, 13, plan);
        const highest = Math.min(...nodes.map((node) => node.y));
        expect(highest, name).toBeGreaterThanOrEqual(80);
      }
    }
  });

  it("keeps every trunk inside the tree region", () => {
    // TASTE §4: x within [24, 470]. The forest plan spreads the furthest, so it
    // is the one that would fail first if the offsets grew.
    for (const [name, plan] of Object.entries(PLANS)) {
      for (const seed of SEEDS) {
        for (const node of buildSkeleton(seed, 13, plan).nodes) {
          expect(node.x, `${name} left`).toBeGreaterThanOrEqual(24);
          expect(node.x, `${name} right`).toBeLessThanOrEqual(470);
        }
      }
    }
  });

  it("shares one node budget between the trunks instead of multiplying it", () => {
    // Branch strokes are the most expensive thing in the document and the whale
    // already sits at 72% of the full cap, so five trunks each free to grow 420
    // nodes would put it straight through. Note this is a budget ceiling, not a
    // comparison against the single trunk: splitting the crown genuinely costs
    // more nodes than one trunk spends on it, because each stem grows its own
    // approach to its own share. The cap is what protects the byte budget.
    for (const seed of SEEDS) {
      for (const [name, plan] of Object.entries(PLANS)) {
        const multi = buildSkeleton(seed, 13, plan).nodes.length;
        // Each trunk may round its share of the budget up, hence one per trunk.
        expect(multi, name).toBeLessThanOrEqual(MAX_SKELETON_NODES + plan.length);
      }
    }
  });

  it("puts a second trunk's apex below the main trunk's", () => {
    // What `reach` is for. Two stems of equal height read as an accident rather
    // than as a twin trunk.
    for (const seed of SEEDS) {
      const skeleton = buildSkeleton(seed, 11, PLANS["sokan"]!);
      const main = skeleton.nodes.filter((n) => n.x <= BASE_X + 23);
      const second = skeleton.nodes.filter((n) => n.x > BASE_X + 23);
      if (second.length === 0) continue;
      expect(Math.min(...main.map((n) => n.y))).toBeLessThan(
        Math.min(...second.map((n) => n.y)),
      );
    }
  });
});

describe("the cloud is divided between trunks, never extended", () => {
  it("never lets a clump out-grow its own level by more than the approach", () => {
    // Level stability rests on level M consuming the cloud prefix
    // [0, ATTRACTORS_PER_LEVEL * M), and partitioning splits that prefix rather
    // than extending it - so a restyle cannot grant a level's worth of height
    // nobody earned.
    //
    // It is not exactly zero, and the mechanism is worth writing down: a trunk
    // climbs until some attractor of *its own share* is within the influence
    // radius, so a trunk holding a thinner share climbs one or two steps further
    // before it stops. Measured across all ten fixture seeds, all eleven levels
    // and all four plans, the worst overshoot is 12.2 px of node and 11.7 px of
    // pad - an approach that runs on a little, not extra crown. Two growth steps
    // is the bound, which leaves that headroom and still fails a plan that grew a
    // whole crown taller. The header ceiling above is the hard limit either way.
    const STEP = 18;
    for (const seed of SEEDS) {
      for (const maturity of LEVELS) {
        const apex = (plan: readonly TrunkPlan[]): number =>
          Math.min(...buildSkeleton(seed, maturity, plan).nodes.map((node) => node.y));
        const ceiling = apex(SINGLE_TRUNK);
        for (const [name, plan] of MULTI) {
          expect(apex(plan), `${name}@${String(maturity)}`).toBeGreaterThanOrEqual(
            ceiling - STEP,
          );
        }
      }
    }
  });
});
