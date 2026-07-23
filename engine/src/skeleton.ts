/**
 * The branch skeleton: seeded space colonization (SPEC-ENGINE §3.3).
 *
 * Space colonization grows a tree toward a cloud of attractor points, which is
 * why the results look pruned rather than fractal: the cloud acts as the light
 * budget a real bonsai grows into.
 *
 * Two invariants:
 *
 * Level stability - the skeleton for a given (seed, maturity) is always
 * identical. The attractor cloud is generated once per seed as a fixed
 * sequence, and level M consumes the prefix `[0, ATTRACTORS_PER_LEVEL * M)`.
 * The level does not move day to day, so neither do the pixels.
 *
 * Element monotonicity - growing a level may re-pose branches (D-005 accepts
 * this; pixel monotonicity would need stored state, which D-002 forbids), but
 * it must never leave the tree with fewer pads than it had. Space colonization
 * gives no such guarantee, so `buildSkeleton` enforces it at the end.
 */

import { streamsFor } from "./rng.js";
import type { Rng } from "./rng.js";

// ---------------------------------------------------------------------------
// Composition constants (TASTE §4: tree region x in [24, 470], pot base y=396,
// crown must not cross y < 80).
// ---------------------------------------------------------------------------

/** Trunk enters off-centre, at roughly 40% across the tree region. */
export const BASE_X = 202;
export const BASE_Y = 396;

/** The crown region: a tilted ellipse the branches are drawn toward. */
const CROWN = {
  cx: 236,
  cy: 206,
  rx: 148,
  ry: 88,
  /** Radians. A slight tilt keeps the silhouette from reading as clip art. */
  tilt: -0.21,
} as const;

export const TOTAL_ATTRACTORS = 260;
export const ATTRACTORS_PER_LEVEL = 20;

/**
 * The crown may not cross into the header zone (TASTE §4: y < 80). The bias that
 * gives each seed its lean lets a heavy-topped, fully grown crown overshoot the
 * bare ellipse, so the mapped cloud is compressed toward the pot when it would
 * breach this line. A little margin keeps rounding error on the safe side.
 */
const CROWN_CEIL = 112;

const GROWTH = {
  /** How far a node reaches per iteration. */
  step: 9,
  /** Attractors farther than this influence nobody. */
  influence: 62,
  /** Attractors closer than this to any node are satisfied and removed. */
  kill: 15,
  maxIterations: 220,
  maxNodes: 420,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkeletonNode {
  x: number;
  y: number;
  /** Index into the node array; -1 for the root. */
  parent: number;
  /** Number of nodes in this node's subtree, including itself. */
  weight: number;
  /** Steps from the root. */
  depth: number;
}

export interface Pad {
  x: number;
  y: number;
  /** Radius in px, 22..38 by cluster weight. */
  r: number;
  /** Tips gathered into this pad. */
  weight: number;
  /** Depth of the pad's anchoring node, used to order drawing back to front. */
  depth: number;
}

export interface Skeleton {
  nodes: SkeletonNode[];
  pads: Pad[];
  maturity: number;
}

interface Vec {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Attractors
// ---------------------------------------------------------------------------

/**
 * How much of the crown region a tree of this maturity reaches into.
 *
 * Without this, maturity only ever changed the *density* of a fixed-size
 * crown: a three-week newcomer and a seven-year veteran drew silhouettes of
 * the same size, differing mainly in pad count. That undercuts the product's
 * central claim - that the tree is a readable biography - so the crown itself
 * grows, and a young tree is visibly a small tree rather than a sparse big one.
 *
 * The shorter crown also shortens the trunk for free, because trunk growth
 * stops once the crown is in reach.
 */
function crownScaleFor(maturity: number): number {
  const t = (maturity - 3) / 10; // 0 at level 3, 1 at level 13
  return 0.52 + 0.48 * t;
}

/**
 * The full attractor sequence for a seed, in unit crown space. Generated once
 * and sliced by level, so growing a level extends the cloud rather than
 * resampling it.
 */
export function attractorCloud(seed: number): Vec[] {
  const rng = streamsFor(seed).for("attractors");
  const points: Vec[] = [];

  // Per-seed crown character. A single shared ellipse sampled uniformly draws
  // a perfectly round crown, which TASTE §2 lists as an instant gate failure -
  // it reads as clip art rather than as a tree someone kept. Each seed gets its
  // own lean, tilt and a preferred direction the foliage masses toward, so the
  // silhouette is asymmetric the way real bonsai are.
  const leanX = rng.range(-30, 30);
  const leanY = rng.range(-14, 10);
  const tilt = CROWN.tilt + rng.range(-0.16, 0.16);
  const heavySide = rng.next() * Math.PI * 2;
  const heaviness = rng.range(0.3, 0.55);

  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const cx = CROWN.cx + leanX;
  const cy = CROWN.cy + leanY;

  for (let i = 0; i < TOTAL_ATTRACTORS; i += 1) {
    // sqrt of a uniform draw spreads points evenly by area rather than
    // bunching them at the centre.
    let radius = Math.sqrt(rng.next());
    const angle = rng.next() * Math.PI * 2;

    // Reach further on the heavy side, less on the other: the crown gains a
    // direction instead of a circumference.
    const bias = 1 - heaviness + heaviness * ((1 + Math.cos(angle - heavySide)) / 2) * 2;
    radius *= bias;

    const ex = CROWN.rx * radius * Math.cos(angle);
    const ey = CROWN.ry * radius * Math.sin(angle);
    points.push({
      x: cx + ex * cos - ey * sin,
      y: cy + ex * sin + ey * cos,
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Grows a trunk upward until the crown is within reach. Without this the
 * colonization starts inside the crown and the tree has no trunk to speak of.
 */
function growTrunk(nodes: SkeletonNode[], attractors: Vec[], rng: Rng): void {
  const lean = rng.range(-0.12, 0.12);
  let guard = 0;

  for (;;) {
    const tip = nodes[nodes.length - 1]!;
    const reachable = attractors.some((a) => distance(a, tip) < GROWTH.influence);
    if (reachable || guard >= 40) break;

    // A slight, seeded wander: a perfectly straight trunk reads as a pole.
    const wobble = rng.range(-0.06, 0.06) + lean;
    nodes.push({
      x: tip.x + Math.sin(wobble) * GROWTH.step,
      y: tip.y - Math.cos(wobble) * GROWTH.step,
      parent: nodes.length - 1,
      weight: 1,
      depth: tip.depth + 1,
    });
    guard += 1;
  }
}

function colonize(nodes: SkeletonNode[], attractors: Vec[]): void {
  const live = attractors.slice();

  for (let iteration = 0; iteration < GROWTH.maxIterations; iteration += 1) {
    if (live.length === 0 || nodes.length >= GROWTH.maxNodes) break;

    // Each attractor pulls on its single nearest node within the influence
    // radius; a node's direction is the sum of its pulls.
    const pulls = new Map<number, Vec>();
    for (const attractor of live) {
      let bestIndex = -1;
      // Annotated because GROWTH is `as const`, which would otherwise infer
      // the literal type and reject any reassignment.
      let bestDistance: number = GROWTH.influence;
      for (let i = 0; i < nodes.length; i += 1) {
        const d = distance(attractor, nodes[i]!);
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = i;
        }
      }
      if (bestIndex === -1) continue;

      const node = nodes[bestIndex]!;
      const dx = attractor.x - node.x;
      const dy = attractor.y - node.y;
      const length = Math.hypot(dx, dy) || 1;
      const existing = pulls.get(bestIndex) ?? { x: 0, y: 0 };
      pulls.set(bestIndex, { x: existing.x + dx / length, y: existing.y + dy / length });
    }

    if (pulls.size === 0) break;

    // Sorting the node indices keeps insertion order independent of Map
    // iteration order, which is the kind of detail byte-identity lives on.
    const growing = [...pulls.keys()].sort((a, b) => a - b);
    const firstNewNode = nodes.length;
    for (const index of growing) {
      if (nodes.length >= GROWTH.maxNodes) break;
      const node = nodes[index]!;
      const pull = pulls.get(index)!;
      const length = Math.hypot(pull.x, pull.y) || 1;
      nodes.push({
        x: node.x + (pull.x / length) * GROWTH.step,
        y: node.y + (pull.y / length) * GROWTH.step,
        parent: index,
        weight: 1,
        depth: node.depth + 1,
      });
    }
    if (nodes.length === firstNewNode) break;

    // Retire satisfied attractors. Only the nodes added this iteration need
    // checking: every surviving attractor was already too far from all the
    // others, and re-testing them turns the loop quadratic in node count.
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const attractor = live[i]!;
      for (let n = firstNewNode; n < nodes.length; n += 1) {
        if (distance(attractor, nodes[n]!) < GROWTH.kill) {
          live.splice(i, 1);
          break;
        }
      }
    }
  }
}

/** Subtree sizes, which set branch thickness: thick where much hangs off it. */
function computeWeights(nodes: SkeletonNode[]): void {
  for (let i = nodes.length - 1; i > 0; i -= 1) {
    const node = nodes[i]!;
    const parent = nodes[node.parent]!;
    parent.weight += node.weight;
  }
}

// ---------------------------------------------------------------------------
// Pads
// ---------------------------------------------------------------------------

/**
 * How many foliage pads a tree of this maturity carries.
 *
 * Pad count is a function of maturity alone, which is what makes D-005's
 * monotonicity promise a guarantee instead of a hope. The alternative -
 * counting whatever tip clusters colonization happened to produce - was
 * measured across 400 seeds and broke monotonicity on 32.5% of level-ups, once
 * by ten pads at a stroke. A tree that visibly sheds foliage by growing older
 * would contradict the one thing the product says about growth.
 *
 * Deriving the count instead of observing it also fixes a second problem the
 * same measurement exposed: raw cluster counts had a median of 12 at level 3
 * and only 20 at level 13, so most of the ladder was visually indistinguishable.
 */
export function padCountFor(maturity: number): number {
  return 4 + maturity;
}

/**
 * Foliage pads sit on selected tips, not on every twig: a pad per twig reads as
 * noise, and real bonsai foliage is groomed into distinct masses.
 *
 * Centres are chosen by farthest-point selection, which is deterministic and
 * spreads pads across the whole crown rather than letting them clump wherever
 * colonization happened to densify. Each remaining tip then joins its nearest
 * centre, and the resulting weight sets the pad's radius.
 */
function buildPads(nodes: SkeletonNode[], padCount: number): Pad[] {
  const branchTips = nodes.filter((_, index) => !nodes.some((n) => n.parent === index));
  if (branchTips.length === 0) return [];

  // A handful of seeds colonize into a single unbranched chain, which has one
  // tip and would leave the tree a stick carrying one pad. Where there are too
  // few tips to place the pads this maturity is owed, foliage is distributed
  // along the branches instead - a narrow upright tree rather than a defect.
  const tips =
    branchTips.length >= padCount ? branchTips : nodes.filter((node) => node.depth > 0);
  if (tips.length === 0) return [];

  const wanted = Math.min(padCount, tips.length);

  // Seed with the tip farthest from the trunk base: the apex reads as the
  // crown's anchor, and starting there keeps the selection stable.
  let firstIndex = 0;
  let firstDistance = -1;
  for (let i = 0; i < tips.length; i += 1) {
    const d = Math.hypot(tips[i]!.x - BASE_X, tips[i]!.y - BASE_Y);
    if (d > firstDistance) {
      firstDistance = d;
      firstIndex = i;
    }
  }

  const chosen = [firstIndex];
  const minDistance = tips.map((tip) =>
    Math.hypot(tip.x - tips[firstIndex]!.x, tip.y - tips[firstIndex]!.y),
  );

  while (chosen.length < wanted) {
    let bestIndex = -1;
    let bestDistance = -1;
    for (let i = 0; i < tips.length; i += 1) {
      if (minDistance[i]! > bestDistance) {
        bestDistance = minDistance[i]!;
        bestIndex = i;
      }
    }
    if (bestIndex === -1) break;
    chosen.push(bestIndex);
    minDistance[bestIndex] = -1;
    for (let i = 0; i < tips.length; i += 1) {
      if (minDistance[i]! < 0) continue;
      const d = Math.hypot(tips[i]!.x - tips[bestIndex]!.x, tips[i]!.y - tips[bestIndex]!.y);
      if (d < minDistance[i]!) minDistance[i] = d;
    }
  }

  const centres = chosen.map((index) => ({
    x: tips[index]!.x,
    y: tips[index]!.y,
    weight: 0,
    depth: tips[index]!.depth,
  }));

  for (const tip of tips) {
    let nearest = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < centres.length; i += 1) {
      const d = Math.hypot(tip.x - centres[i]!.x, tip.y - centres[i]!.y);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = i;
      }
    }
    const centre = centres[nearest]!;
    centre.weight += 1;
    centre.depth = Math.max(centre.depth, tip.depth);
  }

  const maxWeight = Math.max(1, ...centres.map((c) => c.weight));
  return centres
    .map((centre) => ({
      x: centre.x,
      y: centre.y,
      r: 22 + 16 * (centre.weight / maxWeight),
      weight: centre.weight,
      depth: centre.depth,
    }))
    // Back to front, so nearer pads overlap farther ones when drawn.
    .sort((a, b) => a.depth - b.depth || a.x - b.x);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Builds the skeleton for a (seed, maturity) pair. Always identical for that pair. */
export function buildSkeleton(seed: number, maturity: number): Skeleton {
  const cloud = attractorCloud(seed);
  const prefix = cloud.slice(0, Math.max(1, ATTRACTORS_PER_LEVEL * maturity));

  // Shrink the crown toward the trunk for younger trees, keeping the base of
  // the crown near the pot so a small tree sits low rather than floating.
  const scale = crownScaleFor(maturity);
  const anchorY = CROWN.cy + CROWN.ry;
  const attractors = prefix.map((point) => ({
    x: CROWN.cx + (point.x - CROWN.cx) * scale,
    y: anchorY + (point.y - anchorY) * scale,
  }));

  // Seat the crown under the header. A heavy-topped crown can overshoot y<80;
  // rather than clip the apex flat (a hedge) or squeeze y alone (which packs
  // the attractors into a band and doubles the twig density), scale the whole
  // cloud uniformly toward the pot anchor. A similarity transform preserves
  // point spacing, so the crown just gets smaller and lower, not denser.
  let highest = anchorY;
  for (const a of attractors) if (a.y < highest) highest = a.y;
  if (highest < CROWN_CEIL) {
    const k = (anchorY - CROWN_CEIL) / (anchorY - highest);
    for (const a of attractors) {
      a.x = CROWN.cx + (a.x - CROWN.cx) * k;
      a.y = anchorY + (a.y - anchorY) * k;
    }
  }
  const rng = streamsFor(seed).for("trunk");

  const nodes: SkeletonNode[] = [
    { x: BASE_X, y: BASE_Y, parent: -1, weight: 1, depth: 0 },
  ];

  growTrunk(nodes, attractors, rng);
  colonize(nodes, attractors);
  computeWeights(nodes);

  return { nodes, pads: buildPads(nodes, padCountFor(maturity)), maturity };
}
