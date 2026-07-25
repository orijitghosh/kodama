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

/**
 * The whole skeleton's node budget, shared across however many trunks there are.
 *
 * Exported because it is the byte cost of the picture: branch strokes are the
 * most expensive thing in the document, and the trunk-plan properties assert
 * against this rather than against a number copied into the test.
 */
export const MAX_SKELETON_NODES = 420;

const GROWTH = {
  /** How far a node reaches per iteration. */
  step: 9,
  /** Attractors farther than this influence nobody. */
  influence: 62,
  /** Attractors closer than this to any node are satisfied and removed. */
  kill: 15,
  maxIterations: 220,
  maxNodes: MAX_SKELETON_NODES,
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

/**
 * One trunk rising from the soil (SPEC-ENGINE §3.3, D-042).
 *
 * Twin trunk, clump, forest and raft are all the same primitive: N roots seeded
 * along the soil line, each colonising its own share of the one attractor cloud.
 * A plan says where a trunk starts and how far up it goes; everything else about
 * it is the same growth the single trunk has always used.
 */
export interface TrunkPlan {
  /** Horizontal offset of this trunk's base from `BASE_X`, in px. */
  dx: number;
  /**
   * How far into the crown this trunk reaches, as a fraction of the main
   * trunk's. 1 is full height; a twin trunk's second stem is around 0.6.
   */
  reach: number;
}

/**
 * The tree as it has always been drawn, and the default.
 *
 * Byte-identity for the default output is not negotiable (D-042), so this exact
 * plan takes the untransformed path below rather than a transform that happens
 * to be the identity - `BASE_X + (x - BASE_X)` is not always bit-identical to
 * `x`, and one changed digit is a changed tree in every README.
 */
export const SINGLE_TRUNK: readonly TrunkPlan[] = [{ dx: 0, reach: 1 }];

function isUntransformed(trunk: TrunkPlan): boolean {
  return trunk.dx === 0 && trunk.reach === 1;
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

function colonize(nodes: SkeletonNode[], attractors: Vec[], nodeCap: number): void {
  const live = attractors.slice();

  for (let iteration = 0; iteration < GROWTH.maxIterations; iteration += 1) {
    if (live.length === 0 || nodes.length >= nodeCap) break;

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
      if (nodes.length >= nodeCap) break;
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

/**
 * Subtree sizes, which set branch thickness: thick where much hangs off it.
 *
 * The `parent < 0` skip is what makes this safe for more than one trunk: every
 * root carries -1, and a multi-trunk skeleton has one at each trunk's base
 * rather than only at index 0.
 */
function computeWeights(nodes: SkeletonNode[]): void {
  for (let i = nodes.length - 1; i > 0; i -= 1) {
    const node = nodes[i]!;
    if (node.parent < 0) continue;
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

/**
 * Splits the cloud between trunks: each attractor goes to the trunk whose base
 * is nearest in x, ties to the earlier trunk.
 *
 * Nearest-in-x rather than nearest overall because trunks differ horizontally
 * and share the soil line - measuring in both axes would hand the whole lower
 * crown to whichever trunk happened to be shortest. The result is that each
 * trunk owns a vertical slab of the crown, which is what a clump actually looks
 * like: stems fanning out, each carrying its own side of the foliage.
 */
function partition(attractors: Vec[], trunks: readonly TrunkPlan[]): Vec[][] {
  const shares: Vec[][] = trunks.map(() => []);
  if (trunks.length === 1) {
    // No comparison to make, and no new array of points: the single-trunk path
    // must reach growth with exactly the objects it always did.
    shares[0] = attractors;
    return shares;
  }

  for (const attractor of attractors) {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < trunks.length; i += 1) {
      const d = Math.abs(attractor.x - (BASE_X + trunks[i]!.dx));
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    shares[best]!.push(attractor);
  }
  return shares;
}

/** A trunk's share, pulled in toward its own base so `reach` shortens it. */
function shorten(share: Vec[], trunk: TrunkPlan): Vec[] {
  if (isUntransformed(trunk)) return share;
  const bx = BASE_X + trunk.dx;
  return share.map((point) => ({
    x: bx + (point.x - BASE_X) * trunk.reach,
    y: BASE_Y + (point.y - BASE_Y) * trunk.reach,
  }));
}

/**
 * Builds the skeleton for a (seed, maturity) pair, optionally on more than one
 * trunk. Always identical for the same arguments.
 *
 * With the default plan this is the tree as it has always been drawn, node for
 * node - the goldens and Taste Gate #1 are what prove it, and they are expected
 * to keep passing through every form commit that does not deliberately restyle a
 * fixture (D-042).
 */
export function buildSkeleton(
  seed: number,
  maturity: number,
  trunks: readonly TrunkPlan[] = SINGLE_TRUNK,
): Skeleton {
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

  // The node budget is shared, not per trunk. Branch strokes are the most
  // expensive thing in the document, so four trunks each free to grow 420 nodes
  // would put a whale straight through the 60 KB cap. One trunk still gets the
  // whole 420, which is the other half of keeping the default identical.
  const nodeCap = Math.max(1, Math.ceil(GROWTH.maxNodes / trunks.length));
  const shares = partition(attractors, trunks);

  const nodes: SkeletonNode[] = [];
  for (let i = 0; i < trunks.length; i += 1) {
    const trunk = trunks[i]!;
    const share = shorten(shares[i]!, trunk);

    // Each trunk grows in its own array and is spliced in afterwards, so one
    // trunk's tips can never be pulled toward another's attractors. Sharing the
    // array would have them competing and merging into one crown, which is the
    // opposite of what a twin trunk is.
    const branch: SkeletonNode[] = [
      { x: BASE_X + trunk.dx, y: BASE_Y, parent: -1, weight: 1, depth: 0 },
    ];

    // A trunk that won its share of nothing stays a stub at the soil rather
    // than growing 40 steps of bare pole toward a crown it has no claim on.
    // Only reachable from a plan whose trunks sit outside the crown entirely.
    if (share.length > 0) {
      growTrunk(branch, share, rng);
      colonize(branch, share, nodeCap);
    }

    const offset = nodes.length;
    for (const node of branch) {
      nodes.push(node.parent < 0 ? node : { ...node, parent: node.parent + offset });
    }
  }

  computeWeights(nodes);

  return { nodes, pads: buildPads(nodes, padCountFor(maturity)), maturity };
}
