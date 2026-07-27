/**
 * The bonsai biome: the first renderer over the shared contract, not the
 * architecture itself (D-004).
 *
 * The vocabulary this file maps is deliberately generic - substrate, masses,
 * ornaments, inhabitants - so a future reef or tapestry biome can map the same
 * TreeFacts onto entirely different imagery without touching the engine API.
 */

import { BASE_X, BASE_Y, buildSkeleton } from "../skeleton.js";
import { geometryFor } from "../form-geometry.js";
import type { Pad, Skeleton, SkeletonNode } from "../skeleton.js";
import { seedFromLogin, streamsFor } from "../rng.js";
import type { Rng } from "../rng.js";
import { butterfly, leafSymbol, leafUse, speciesBlossom, speciesFruit } from "./leaves.js";
import { isClassic } from "../species.js";
import type { Species } from "../species.js";
import { circle, el, group, PathBuilder, path } from "../svg.js";
import { slot } from "../themes.js";
import type { Theme, TreeFacts } from "../types.js";

/**
 * How much of the plant to draw.
 *
 * The small scales are not the full tree shrunk: TASTE §4 asks strip for a
 * silhouette and button for a glyph, and emitting four hundred hairline paths
 * into an 88×31 badge would blow its 4 KB budget by twentyfold while rendering
 * detail no eye can resolve. Detail is chosen per scale, so each size is drawn
 * at the fidelity it can actually show.
 */
export type Detail = "full" | "reduced" | "silhouette" | "glyph";

/** Pot dimensions per tier. A decade pot is a monument, and reads like one. */
const POTS = {
  plastic: { width: 108, height: 30, lip: 4, rim: 3 },
  clay: { width: 118, height: 34, lip: 5, rim: 4 },
  glazed: { width: 128, height: 38, lip: 6, rim: 4 },
  antique: { width: 138, height: 42, lip: 7, rim: 5 },
  stone: { width: 150, height: 46, lip: 8, rim: 6 },
} as const;

// ---------------------------------------------------------------------------
// Substrate: pot and soil
// ---------------------------------------------------------------------------

export function drawSubstrate(facts: TreeFacts): string {
  const pot = POTS[facts.potTier];
  const left = BASE_X - pot.width / 2;
  const top = BASE_Y;

  // A trapezoid rather than a rectangle: bonsai pots taper, and the taper is
  // most of what separates "pot" from "box" at this size.
  const taper = pot.width * 0.08;
  const body = new PathBuilder()
    .moveTo(left, top + pot.lip)
    .lineTo(left + pot.width, top + pot.lip)
    .lineTo(left + pot.width - taper, top + pot.height)
    .lineTo(left + taper, top + pot.height)
    .close();

  const parts: string[] = [
    // The soil sits behind the rim so the rim reads as in front of it.
    el("ellipse", {
      cx: BASE_X,
      cy: top + pot.lip * 0.5,
      rx: pot.width / 2 - 3,
      ry: pot.lip * 1.1,
      fill: slot("border"),
    }),
    el("rect", {
      x: left,
      y: top,
      width: pot.width,
      height: pot.lip,
      rx: 1.5,
      fill: slot("trunk"),
      opacity: 0.85,
    }),
    path(body.toString(), { fill: slot("trunk") }),
    // One darker tone for depth; TASTE §1.2 forbids shadows and gradients.
    path(
      new PathBuilder()
        .moveTo(left + taper, top + pot.height)
        .lineTo(left + pot.width - taper, top + pot.height)
        .lineTo(left + pot.width - taper - 4, top + pot.height - pot.rim)
        .lineTo(left + taper + 4, top + pot.height - pot.rim)
        .close()
        .toString(),
      { fill: slot("bg"), opacity: 0.25 },
    ),
  ];

  if (facts.ornaments.soilPetalRing) {
    // A permanent memory of the best run ever recorded, pressed into the soil.
    parts.push(
      el("ellipse", {
        cx: BASE_X,
        cy: top + pot.lip * 0.5,
        rx: pot.width / 2 - 8,
        ry: pot.lip * 0.7,
        fill: "none",
        stroke: slot("blossom1"),
        "stroke-width": 1,
        opacity: 0.5,
      }),
    );
  }

  return group({ class: "kd-substrate" }, parts);
}

// ---------------------------------------------------------------------------
// Masses: trunk, branches, foliage pads
// ---------------------------------------------------------------------------

/**
 * Branch strokes, drawn thickest first so thin twigs overlay their parents
 * cleanly. Width follows subtree weight, which is why a branch carrying half
 * the crown looks like it could.
 */
export function drawBranches(skeleton: Skeleton, facts: TreeFacts, detail: Detail): string {
  const { nodes } = skeleton;

  // Widths are measured against the heaviest trunk, not against node 0 and not
  // against the sum. A multi-trunk skeleton has a root at each trunk's base, and
  // measuring every stem against its own root would draw four full-girth trunks;
  // measuring against the sum would thin the main stem as trunks were added.
  // Taking the maximum keeps girth reading as account age on the dominant trunk
  // and makes the lesser stems proportionally thinner, which is what a clump is.
  let rootWeight = 1;
  for (const node of nodes) {
    if (node.parent < 0 && node.weight > rootWeight) rootWeight = node.weight;
  }

  // Below these stroke widths a branch contributes bytes but no visible line
  // at the target size.
  const minimumWidth = detail === "full" ? 0 : detail === "reduced" ? 2.4 : 3.2;

  interface Stroke {
    d: string;
    width: number;
  }

  // Winter thins the canopy from the outside in: the finest twigs go bare while
  // the trunk and limbs hold, so the tree stays recognisably the same tree. The
  // set is chosen by rank, not by an absolute share cutoff - bareBranchRatio is
  // the fraction of eligible twigs that go, so a dense crown and a sparse one
  // both keep the same proportion of their structure. Ranking by (share, index)
  // is deterministic and, being a fixed function of the skeleton, drops the same
  // twigs every winter rather than shuffling the tree annually.
  const eligible: number[] = [];
  if (facts.bareBranchRatio > 0) {
    for (let i = 1; i < nodes.length; i += 1) {
      if (nodes[i]!.depth > 4) eligible.push(i);
    }
    eligible.sort((a, b) => nodes[a]!.weight - nodes[b]!.weight || a - b);
  }
  const bareCount = Math.round(eligible.length * facts.bareBranchRatio);
  const bare = new Set(eligible.slice(0, bareCount));

  const strokes: Stroke[] = [];

  for (let i = 1; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    // A second or third trunk's root has no parent to draw a segment back to.
    // Without this the path would carry NaN, which is a broken image, which the
    // product forbids outright.
    if (node.parent < 0) continue;
    const parent = nodes[node.parent]!;
    const share = node.weight / rootWeight;
    const width = Math.max(1, facts.trunkGirth * Math.sqrt(share));

    if (width < minimumWidth) continue;
    if (bare.has(i)) continue;

    strokes.push({ d: segmentPath(parent, node), width });
  }

  strokes.sort((a, b) => b.width - a.width);

  return group(
    {
      class: "kd-branches",
      stroke: slot("trunk"),
      fill: "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    strokes.map((stroke) => path(stroke.d, { "stroke-width": stroke.width })),
  );
}

/** A gently curved segment; straight lines read as scaffolding, not branches. */
function segmentPath(from: SkeletonNode, to: SkeletonNode): string {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Bow perpendicular to the segment, scaled to its length.
  const bow = 0.14;
  return new PathBuilder()
    .moveTo(from.x, from.y)
    .quadraticTo(midX - dy * bow, midY + dx * bow, to.x, to.y)
    .toString();
}

/**
 * Foliage pads as clusters of flat circles.
 *
 * Cluster count per pad is `padDensity`, so growth inside a maturity level is
 * visible without the skeleton moving. Three foliage tones give depth without
 * a gradient, which TASTE §1.2 rules out.
 */
/** One drawn foliage blob. */
export interface Blob {
  x: number;
  y: number;
  r: number;
}

/**
 * A pad as it is actually drawn.
 *
 * `pad.r` is a *bounding* radius: the blobs inside are 0.42-0.66 of it and sit
 * anywhere within 0.62 of it from the centre, so no drawn circle ever reaches
 * the nominal edge. Anything that has to sit *on* the foliage - snow, and
 * whatever Tier 2 adds - needs the geometry that was drawn, not the geometry
 * the pad was budgeted at. Building the cluster once and sharing it is what
 * keeps those two from disagreeing.
 */
export interface PadCluster {
  pad: Pad;
  blobs: Blob[];
  /** The blob whose top edge is highest: where anything settling lands. */
  crest: Blob;
}

export function buildClusters(
  skeleton: Skeleton,
  facts: TreeFacts,
  seed: number,
  detail: Detail,
): PadCluster[] {
  const rng = streamsFor(seed).for("foliage");

  // A silhouette keeps one disc per pad: the crown's shape survives, the
  // texture does not, and the texture is what costs the bytes.
  const density =
    detail === "full"
      ? facts.padDensity
      : detail === "reduced"
        ? Math.min(3, facts.padDensity)
        : 1;

  return skeleton.pads.map((pad) => {
    if (density === 1) {
      const only: Blob = { x: pad.x, y: pad.y, r: pad.r * 0.86 };
      return { pad, blobs: [only], crest: only };
    }

    const blobs: Blob[] = [];
    for (let i = 0; i < density; i += 1) {
      const angle = rng.next() * Math.PI * 2;
      const spread = Math.sqrt(rng.next()) * pad.r * 0.62;
      const radius = pad.r * (0.42 + rng.next() * 0.24);
      blobs.push({
        x: pad.x + Math.cos(angle) * spread,
        y: pad.y + Math.sin(angle) * spread * 0.72,
        r: radius,
      });
    }

    let crest = blobs[0]!;
    for (const blob of blobs) {
      if (blob.y - blob.r < crest.y - crest.r) crest = blob;
    }

    return { pad, blobs, crest };
  });
}

/**
 * The crown.
 *
 * `classic` draws a disc per blob, exactly as it always has. An alternate species
 * draws a `<use>` of its leaf symbol at the same footprint, so the silhouette the
 * skeleton budgeted is untouched and only the texture changes (leaves.ts). The
 * three-tone alternation is the original and stays either way: it is what keeps a
 * dense crown from flattening into one mass.
 *
 * Below `full` even an alternate collapses back to discs. At 420×160 a five-lobe
 * leaf is three pixels of noise, and the pads are carrying shape, not identity.
 */
export function drawFoliage(clusters: PadCluster[], species: Species, detail: Detail): string {
  const tones = [slot("foliage1"), slot("foliage2"), slot("foliage3")];
  const leafy = detail === "full" && species.leaf !== null;

  return group(
    { class: "kd-foliage" },
    clusters.map((cluster) =>
      group(
        { class: "kd-pad" },
        cluster.blobs.map((blob, i) => {
          const fill = tones[i % tones.length]!;
          return leafy
            ? leafUse(species, blob.x, blob.y, blob.r, fill)
            : circle(blob.x, blob.y, blob.r, { fill });
        }),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Ornaments: what the last week and month actually did (SPEC-ENGINE §3.4)
// ---------------------------------------------------------------------------

/** Fruit radius by additions bucket - a big PR hangs heavier. */
const FRUIT_RADIUS: Record<1 | 2 | 3, number> = { 1: 4, 2: 6, 3: 8 };

/**
 * Ornaments at the small scales.
 *
 * `reduced` keeps the story (there is fruit, there are lanterns) but not the
 * count, because at 420×160 a tenth persimmon is two hundred bytes nobody can
 * see. Silhouette and glyph carry none: they are shape, not narrative.
 */
function ornamentBudget(detail: Detail): number {
  return detail === "full" ? 1 : detail === "reduced" ? 0.5 : 0;
}

/**
 * Spreads n ornaments over the pads one apiece before doubling up, so a user
 * with four merged PRs sees them across the crown rather than stacked on one
 * branch.
 */
function padCycle(order: Pad[], index: number): Pad | undefined {
  return order.length === 0 ? undefined : order[index % order.length];
}

/** Pads ordered top-first: where a tree puts its newest growth. */
function padsNewestFirst(pads: Pad[]): Pad[] {
  return pads.map((pad, i) => ({ pad, i })).sort((a, b) => a.pad.y - b.pad.y || a.i - b.i).map((e) => e.pad);
}

/** Pads ordered bottom-first: where weight hangs. */
function padsLowestFirst(pads: Pad[]): Pad[] {
  return pads.map((pad, i) => ({ pad, i })).sort((a, b) => b.pad.y - a.pad.y || a.i - b.i).map((e) => e.pad);
}

/**
 * A point on a pad's rim. `lower` biases into the bottom half, which is where
 * anything heavy enough to hang belongs.
 */
function rimSite(pad: Pad, rng: Rng, lower: boolean): { x: number; y: number } {
  const angle = lower
    ? Math.PI * (0.12 + rng.next() * 0.76)
    : rng.next() * Math.PI * 2;
  return {
    x: pad.x + Math.cos(angle) * pad.r * 0.7,
    y: pad.y + Math.sin(angle) * pad.r * (lower ? 0.62 : 0.5),
  };
}

/**
 * This week's commits, as bright new growth at the crown tips.
 *
 * Shoots are the one ornament that answers "was anyone here this week", so they
 * sit where the eye lands first rather than being scattered evenly.
 */
function drawShoots(pads: Pad[], count: number, rng: Rng): string {
  if (count === 0) return "";
  const order = padsNewestFirst(pads);
  const shoots: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const pad = padCycle(order, i);
    if (pad === undefined) break;
    const site = rimSite(pad, rng, false);
    shoots.push(
      circle(site.x, site.y, 2.6, { fill: slot("foliage3") }),
      circle(site.x, site.y, 1.3, { fill: slot("accent"), opacity: 0.75 }),
    );
  }

  return group({ class: "kd-shoots" }, shoots);
}

/**
 * Merged pull requests, ripening green to persimmon over three days.
 *
 * The ripeness lerp is drawn as an unripe disc fading off a ripe one rather
 * than as an interpolated hex, because the colours are CSS custom properties
 * that resolve differently in light and dark (D-006) - there is no hex here to
 * interpolate. Opacity gets the same result in one paint, with no gradient,
 * which TASTE §1.2 rules out anyway.
 */
function drawFruit(
  pads: Pad[],
  facts: TreeFacts,
  species: Species,
  budget: number,
  detail: Detail,
  rng: Rng,
): string {
  const wanted = Math.round(facts.ornaments.fruit.length * budget);
  if (wanted === 0) return "";
  const order = padsLowestFirst(pads);
  const parts: string[] = [];
  // At compact scale a fruit is six pixels across; its stem is one, and the
  // ripeness overlay resolves to nothing. Both are dropped rather than emitted
  // below the threshold of sight.
  const detailed = detail === "full";

  for (let i = 0; i < wanted; i += 1) {
    const fruit = facts.ornaments.fruit[i];
    const pad = padCycle(order, i);
    if (fruit === undefined || pad === undefined) break;

    const site = rimSite(pad, rng, true);
    const r = FRUIT_RADIUS[fruit.bucket];
    const y = site.y + r * 0.6;

    const shapes: string[] = [];
    if (detailed) {
      // The stem first, so the fruit reads as attached rather than floating.
      shapes.push(
        el("line", {
          x1: site.x,
          y1: site.y - r * 0.4,
          x2: site.x,
          y2: y - r * 0.7,
          stroke: slot("trunk"),
          "stroke-width": 1,
          "stroke-linecap": "round",
          opacity: 0.7,
        }),
      );
    }

    // Unripe fruit reads green at every scale; only the blend is dropped.
    const ripe = detailed || fruit.ripeness >= 0.5;
    // The species decides the form - a cone, a samara, a fig - and the grammar
    // keeps the size, the count and the ripening (leaves.ts).
    shapes.push(
      speciesFruit(species.fruit, site.x, y, r, ripe ? slot("fruit2") : slot("foliage3")),
    );

    if (detailed && fruit.ripeness < 1) {
      // Ripening is an opacity, not a colour lerp: the slots are CSS variables
      // resolving differently in light and dark, so there is no hex to
      // interpolate.
      //
      // An alternate species' fruit can be more than one shape (a samara is two
      // blades, a cherry is a pair), so its overlay is grouped to fade as one.
      // `classic` keeps the bare circle with the opacity on it: a wrapper would be
      // tidier and would also change the bytes of every tree already in a README,
      // which is a worse trade than one branch here.
      const opacity = round2(1 - fruit.ripeness);
      shapes.push(
        isClassic(species)
          ? circle(site.x, y, r, { fill: slot("foliage3"), opacity })
          : group({ opacity }, [speciesFruit(species.fruit, site.x, y, r, slot("foliage3"))]),
      );
    }

    parts.push(group({ class: "kd-fruit" }, shapes));
  }

  return group({ class: "kd-fruits" }, parts);
}

/** Open pull requests: the same shape, still green, still small. */
function drawUnripeFruit(pads: Pad[], count: number, rng: Rng): string {
  if (count === 0) return "";
  const order = padsLowestFirst(pads);
  const parts: string[] = [];

  for (let i = 0; i < count; i += 1) {
    // Offset the cycle so an open PR does not land on the same pad as the
    // merged one drawn first; they read as different work, not a double image.
    const pad = padCycle(order, i + 1);
    if (pad === undefined) break;
    const site = rimSite(pad, rng, true);
    parts.push(circle(site.x, site.y + 2, 3, { fill: slot("foliage3"), opacity: 0.9 }));
  }

  return group({ class: "kd-unripe" }, parts);
}

/**
 * Reviews, as lanterns hung under the lower branches.
 *
 * Reviews are the contribution the green wall never shows, so the grammar
 * over-weights them deliberately (D-010) and gives them the warmest element on
 * the tree. Night themes light them.
 */
function drawLanterns(
  pads: Pad[],
  count: number,
  theme: Theme,
  detail: Detail,
  rng: Rng,
): string {
  if (count === 0) return "";
  const order = padsLowestFirst(pads);
  const parts: string[] = [];
  const detailed = detail === "full";

  for (let i = 0; i < count; i += 1) {
    const pad = padCycle(order, i);
    if (pad === undefined) break;

    const site = rimSite(pad, rng, true);
    const top = site.y + 4;
    const w = 5.5;
    const h = 7.5;

    const lantern: string[] = [];

    if (theme.night && detailed) {
      // A soft halo, not a filter: filters are a camo variable we have not
      // spiked yet, and a flat low-opacity disc survives anything.
      lantern.push(
        circle(site.x, top + h / 2, w * 1.9, { fill: slot("glow"), opacity: 0.14 }),
      );
    }

    if (detailed) {
      lantern.push(
        el("line", {
          x1: site.x,
          y1: site.y - 2,
          x2: site.x,
          y2: top,
          stroke: slot("trunk"),
          "stroke-width": 0.9,
          opacity: 0.8,
        }),
      );
    }

    lantern.push(
      el("rect", {
        x: site.x - w / 2,
        y: top,
        width: w,
        height: h,
        rx: 2,
        fill: slot("accent"),
      }),
    );

    if (detailed) {
      // The paper seam. Without it a lantern is a warm pill; with it, it is
      // unmistakably a lantern, which is the whole payoff for reviews.
      lantern.push(
        el("rect", {
          x: site.x - w / 2 - 0.8,
          y: top + h * 0.42,
          width: w + 1.6,
          height: 1,
          fill: slot("trunk"),
          opacity: 0.55,
        }),
      );
    }

    parts.push(group({ class: "kd-lantern" }, lantern));
  }

  return group({ class: "kd-lanterns" }, parts);
}

/** Two decimals, matching the serializer so ornament opacity cannot drift. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Everything hung on the masses. Order is back to front: fruit and lanterns
 * hang in front of foliage, shoots sit on top of it.
 */
export function drawOrnaments(
  skeleton: Skeleton,
  facts: TreeFacts,
  theme: Theme,
  species: Species,
  seed: number,
  detail: Detail,
): string {
  const budget = ornamentBudget(detail);
  if (budget === 0) return "";

  const streams = streamsFor(seed);
  const { pads } = skeleton;
  const scale = (n: number): number => Math.round(n * budget);

  const layers = [
    drawLanterns(pads, scale(facts.ornaments.lanterns), theme, detail, streams.for("lanterns")),
    drawUnripeFruit(pads, scale(facts.ornaments.unripeFruit), streams.for("unripe")),
    drawFruit(pads, facts, species, budget, detail, streams.for("fruit")),
    drawShoots(pads, scale(facts.ornaments.shoots), streams.for("shoots")),
  ].filter((layer) => layer !== "");

  return layers.length === 0 ? "" : group({ class: "kd-ornaments" }, layers);
}

// ---------------------------------------------------------------------------
// Inhabitants: who the work attracted (SPEC-ENGINE §3.4)
// ---------------------------------------------------------------------------

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
  r: number;
}

/** The crown's extent, used to place things that live in the air around it. */
function crownBounds(pads: Pad[]): Bounds {
  let minX = BASE_X;
  let maxX = BASE_X;
  let minY = BASE_Y;
  let maxY = BASE_Y;

  for (const pad of pads) {
    minX = Math.min(minX, pad.x - pad.r);
    maxX = Math.max(maxX, pad.x + pad.r);
    minY = Math.min(minY, pad.y - pad.r);
    maxY = Math.max(maxY, pad.y + pad.r);
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    r: Math.max(maxX - minX, maxY - minY) / 2,
  };
}

/**
 * The outermost branch node above a given height - where something with weight
 * would actually choose to sit. Deterministic: ties break on node index, never
 * on iteration order.
 */
function perchNode(skeleton: Skeleton, preferRight: boolean): SkeletonNode | undefined {
  let best: SkeletonNode | undefined;
  let bestScore = -Infinity;

  for (const node of skeleton.nodes) {
    if (node.y > BASE_Y - 80) continue;
    const reach = preferRight ? node.x - BASE_X : BASE_X - node.x;
    // Prefer far out and reasonably high, but not the very topmost twig, which
    // is too thin to read as load-bearing.
    const score = reach - Math.abs(node.y - (BASE_Y - 150)) * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }

  return best;
}

/**
 * A flower, in the species' own form (leaves.ts).
 *
 * Five petals round a centre dot is the default and was v1's only flower; a
 * wisteria hangs a raceme instead, an azalea opens one large bloom, a cherry
 * comes in threes. The count is still the streak's - species changes what a
 * flower looks like, never whether one is earned.
 */
function blossom(species: Species, x: number, y: number, scale: number): string {
  return group({ class: "kd-blossom" }, speciesBlossom(species.blossom, x, y, scale));
}

/**
 * A streak of two weeks or more flowers the tree.
 *
 * Clusters, not a uniform dusting: a kept tree blossoms in bursts, and four
 * evenly spread flowers read as decoration rather than as a consequence.
 */
function drawBlossoms(
  pads: Pad[],
  species: Species,
  clusters: number,
  detail: Detail,
  rng: Rng,
): string {
  if (clusters === 0) return "";
  const order = padsNewestFirst(pads);
  const perCluster = detail === "full" ? 3 : 1;
  const parts: string[] = [];

  for (let i = 0; i < clusters; i += 1) {
    const pad = padCycle(order, i);
    if (pad === undefined) break;
    for (let j = 0; j < perCluster; j += 1) {
      const site = rimSite(pad, rng, false);
      parts.push(blossom(species, site.x, site.y, detail === "full" ? 1 : 0.85));
    }
  }

  return group({ class: "kd-blossoms" }, parts);
}

/**
 * A broken streak drops petals for a week.
 *
 * This is the only element that responds to absence, and it is deliberately
 * the gentlest one on the tree: nothing wilts, nothing greys, three petals
 * fall. The PRD's "gentle by design" is a promise the drawing has to keep, not
 * only the rule table.
 */
function drawFallingPetals(bounds: Bounds, count: number, rng: Rng): string {
  if (count === 0) return "";
  const parts: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const x = round2(bounds.minX + rng.next() * (bounds.maxX - bounds.minX));
    // Spread down the gap between crown and soil, so they read as mid-fall.
    const y = round2(bounds.maxY + 10 + rng.next() * Math.max(20, BASE_Y - bounds.maxY - 30));
    const tilt = round2(rng.next() * 360);
    // Wrapped so the fall animation (a translate on the group) composes with the
    // petal's own tilt (a rotate on the ellipse) instead of overwriting it.
    parts.push(
      group({ class: "kd-petal" }, [
        el("ellipse", {
          cx: x,
          cy: y,
          rx: 3.2,
          ry: 1.6,
          fill: slot("blossom1"),
          opacity: 0.75,
          transform: `rotate(${String(tilt)} ${String(x)} ${String(y)})`,
        }),
      ]),
    );
  }

  return group({ class: "kd-petals" }, parts);
}

/**
 * Stars, as fireflies at night and butterflies by day.
 *
 * A firefly on washi is a smudge (D-020), so the night themes kept them and the
 * day themes got nothing - which left `paper`, `sakura` and `shore` with no
 * representation of stars at all. Same count, same log scale, same receipt; the
 * mark changes with the light rather than disappearing with it.
 *
 * Atmosphere needs room. At compact scale the tree is under half size and a ring
 * of dots around it reads as speckle rather than as a summer night, so this stays
 * the one inhabitant that is full-scale only.
 */
function drawFireflies(
  bounds: Bounds,
  count: number,
  theme: Theme,
  detail: Detail,
  rng: Rng,
): string {
  if (count === 0 || detail !== "full") return "";
  const parts: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const angle = rng.next() * Math.PI * 2;
    // Ringed around the canopy rather than inside it, where foliage would
    // swallow them.
    const radius = bounds.r * (0.78 + rng.next() * 0.55);
    const x = round2(bounds.cx + Math.cos(angle) * radius);
    const y = round2(bounds.cy + Math.sin(angle) * radius * 0.8);

    if (theme.night) {
      // The glow and the core are one firefly, so they wander together.
      parts.push(
        group({ class: "kd-firefly" }, [
          circle(x, y, 3.2, { fill: slot("firefly"), opacity: 0.16 }),
          circle(x, y, 1.1, { fill: slot("firefly"), opacity: 0.9 }),
        ]),
      );
    } else {
      parts.push(butterfly(x, y));
    }
  }

  return group({ class: theme.night ? "kd-fireflies" : "kd-butterflies" }, parts);
}

/**
 * Closed issues bring a bird; a great many bring one that stays to nest.
 *
 * Triage is the least visible work on GitHub and the first to burn people out,
 * so the grammar gives it a whole inhabitant rather than a counter.
 */
function drawBird(skeleton: Skeleton, kind: "perched" | "nesting"): string {
  const node = perchNode(skeleton, true);
  if (node === undefined) return "";

  const x = round2(node.x);
  const y = round2(node.y - 4);
  const parts: string[] = [];

  if (kind === "nesting") {
    parts.push(
      path(
        new PathBuilder()
          .moveTo(x - 8, y + 1)
          .quadraticTo(x, y + 8, x + 8, y + 1)
          .close()
          .toString(),
        { fill: slot("trunk") },
      ),
    );
  }

  parts.push(
    // Body, head, beak, tail: four shapes is the fewest that still reads as a
    // bird rather than a blob at this size.
    el("ellipse", { cx: x, cy: y - 2, rx: 4.6, ry: 3.2, fill: slot("textSecondary") }),
    circle(x + 3.6, y - 5.4, 2.4, { fill: slot("textSecondary") }),
    path(
      new PathBuilder()
        .moveTo(x + 5.6, y - 5.4)
        .lineTo(x + 8.4, y - 4.6)
        .lineTo(x + 5.6, y - 3.8)
        .close()
        .toString(),
      { fill: slot("accent") },
    ),
    path(
      new PathBuilder()
        .moveTo(x - 4, y - 2.4)
        .lineTo(x - 9.5, y - 4.6)
        .lineTo(x - 4, y - 0.4)
        .close()
        .toString(),
      { fill: slot("textSecondary") },
    ),
  );

  return group({ class: `kd-bird kd-bird-${kind}` }, parts);
}

/** Discussions hang a wind chime - the sound of a place people talk in. */
function drawWindChime(skeleton: Skeleton): string {
  // Opposite side from the bird, so the two never overlap.
  const node = perchNode(skeleton, false);
  if (node === undefined) return "";

  const x = round2(node.x);
  const top = round2(node.y + 2);

  return group({ class: "kd-chime" }, [
    el("line", {
      x1: x,
      y1: top,
      x2: x,
      y2: top + 7,
      stroke: slot("trunk"),
      "stroke-width": 0.9,
      opacity: 0.8,
    }),
    // The bell.
    path(
      new PathBuilder()
        .moveTo(x - 4, top + 13)
        .quadraticTo(x, top + 5.5, x + 4, top + 13)
        .close()
        .toString(),
      { fill: slot("textSecondary") },
    ),
    el("line", {
      x1: x,
      y1: top + 13,
      x2: x,
      y2: top + 19,
      stroke: slot("trunk"),
      "stroke-width": 0.8,
      opacity: 0.7,
    }),
    // The paper catch, which is what actually moves in wind.
    el("rect", {
      x: x - 2,
      y: top + 19,
      width: 4,
      height: 6,
      rx: 0.8,
      fill: slot("blossom1"),
      opacity: 0.85,
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Seasons (SPEC-ENGINE §3.5)
// ---------------------------------------------------------------------------

function hasEvent(facts: TreeFacts, kind: string): boolean {
  return facts.events.some((event) => event.kind === kind);
}

/**
 * Pads with open sky above them.
 *
 * Snow only settles on what the weather can reach. Capping every pad puts
 * white crescents on foliage that is visibly buried behind other foliage, and
 * they read as debris floating in the canopy rather than as snowfall.
 */
function exposedCrests(clusters: PadCluster[]): Blob[] {
  // Compared on the drawn crests, not the pad centres: a pad can sit low while
  // its crest stands clear, and vice versa.
  const crests = clusters
    .map((cluster) => cluster.crest)
    .sort((a, b) => a.y - a.r - (b.y - b.r));

  return crests.filter(
    (crest) =>
      !crests.some(
        (other) =>
          other !== crest &&
          other.y - other.r < crest.y - crest.r &&
          Math.abs(other.x - crest.x) < (other.r + crest.r) * 0.5 &&
          crest.y - other.y < crest.r * 1.1,
      ),
  );
}

/**
 * Snow settled on the upper surfaces: pad crowns and the pot rim.
 *
 * Drawn as clipped caps rather than white blobs. A cap follows the top arc of
 * the thing it sits on, which is the difference between snow and paint.
 */
function drawSettledSnow(clusters: PadCluster[], facts: TreeFacts, detail: Detail): string {
  const parts: string[] = [];
  const capped = exposedCrests(clusters);
  const limit = detail === "full" ? capped.length : Math.ceil(capped.length / 2);

  for (const crest of capped.slice(0, limit)) {
    // Placed on the crest blob, which is a circle that is actually drawn. The
    // pad's own radius is a bounding value no blob reaches, so a cap built
    // from it hangs in open sky above clusters whose blobs happened to sit low.
    const half = crest.r * 0.72;
    const edgeY = crest.y - Math.sqrt(Math.max(0, crest.r * crest.r - half * half));

    // Both edges are curves. A straight bottom turns snow into a white plate
    // laid across the canopy.
    const apex = crest.y - crest.r;
    parts.push(
      path(
        new PathBuilder()
          .moveTo(round2(crest.x - half), round2(edgeY))
          // Quadratic apex sits at the midpoint of endpoints and control, so
          // the control is placed to put the drawn apex just on the blob's
          // own top edge rather than above it.
          .quadraticTo(
            round2(crest.x),
            round2(2 * apex - edgeY),
            round2(crest.x + half),
            round2(edgeY),
          )
          // Bottom edge sags less than the top: the gap between the two curves
          // is the depth of the snow, and it wants to be shallow.
          .quadraticTo(
            round2(crest.x),
            round2(apex + crest.r * 0.34),
            round2(crest.x - half),
            round2(edgeY),
          )
          .close()
          .toString(),
        { fill: slot("snow"), opacity: 0.72 },
      ),
    );
  }

  // The pot rim holds snow too, and it is what sells the whole effect: it is
  // the one place the eye already expects a clean horizontal line.
  const pot = POTS[facts.potTier];
  parts.push(
    el("ellipse", {
      cx: BASE_X,
      cy: round2(BASE_Y + pot.lip * 0.4),
      rx: round2(pot.width / 2 - 4),
      ry: round2(pot.lip * 0.8),
      fill: slot("snow"),
      opacity: 0.7,
    }),
  );

  return group({ class: "kd-snow" }, parts);
}

/** Falling flakes for the first snow of the year. TASTE §6 caps them at 14. */
function drawFallingSnow(bounds: Bounds, rng: Rng): string {
  const flakes: string[] = [];
  for (let i = 0; i < 14; i += 1) {
    const x = round2(bounds.minX - 20 + rng.next() * (bounds.maxX - bounds.minX + 40));
    const y = round2(70 + rng.next() * (BASE_Y - 90));
    flakes.push(
      group({ class: "kd-flake" }, [
        circle(x, y, round2(1 + rng.next() * 1.4), {
          fill: slot("snow"),
          opacity: round2(0.45 + rng.next() * 0.4),
        }),
      ]),
    );
  }
  return group({ class: "kd-snowfall" }, flakes);
}

/**
 * Hanami: for one week in April every tree blossoms, earned or not.
 *
 * This is the only element in the grammar that is not a consequence of the
 * user's work, and it is deliberate - the whole point of hanami is that it
 * arrives for everyone. A dormant account and a whale get the same week.
 */
function drawHanami(
  pads: Pad[],
  species: Species,
  bounds: Bounds,
  detail: Detail,
  rng: Rng,
): string {
  const parts: string[] = [];
  const order = padsNewestFirst(pads);
  const flowers = detail === "full" ? Math.min(10, order.length) : 4;

  for (let i = 0; i < flowers; i += 1) {
    const pad = padCycle(order, i);
    if (pad === undefined) break;
    const site = rimSite(pad, rng, false);
    // Hanami blossoms in the species' own flower: a wisteria's April is a week
    // of racemes, not of cherry discs.
    parts.push(blossom(species, site.x, site.y, 1));
  }

  if (detail === "full") {
    // A few petals already on their way down, so the week reads as peaking
    // rather than as a tree that simply owns pink flowers.
    for (let i = 0; i < 3; i += 1) {
      const x = round2(bounds.minX + rng.next() * (bounds.maxX - bounds.minX));
      const y = round2(bounds.maxY + 8 + rng.next() * 40);
      const tilt = round2(rng.next() * 360);
      parts.push(
        group({ class: "kd-petal" }, [
          el("ellipse", {
            cx: x,
            cy: y,
            rx: 3.2,
            ry: 1.6,
            fill: slot("blossom1"),
            opacity: 0.7,
            transform: `rotate(${String(tilt)} ${String(x)} ${String(y)})`,
          }),
        ]),
      );
    }
  }

  return group({ class: "kd-hanami" }, parts);
}

/**
 * Harvest: for one week in October the ripe fruit comes down into a basket.
 *
 * The basket only appears if there is fruit to put in it. An empty basket
 * beside a fruitless tree would read as a reproach, and the grammar does not
 * reproach (PRD, "gentle by design").
 */
function drawHarvest(facts: TreeFacts, detail: Detail, rng: Rng): string {
  const ripe = facts.ornaments.fruit.filter((f) => f.ripeness >= 1).length;
  if (ripe === 0) return "";

  const pot = POTS[facts.potTier];
  const bx = round2(BASE_X + pot.width / 2 + 26);
  const by = BASE_Y + 18;
  const w = 30;
  const h = 18;

  const parts: string[] = [
    path(
      new PathBuilder()
        .moveTo(bx - w / 2, by - h)
        .lineTo(bx + w / 2, by - h)
        .lineTo(bx + w / 2 - 4, by)
        .lineTo(bx - w / 2 + 4, by)
        .close()
        .toString(),
      { fill: slot("trunk"), opacity: 0.9 },
    ),
    el("rect", {
      x: bx - w / 2 - 1,
      y: by - h - 2,
      width: w + 2,
      height: 3,
      rx: 1,
      fill: slot("trunk"),
    }),
  ];

  // Fruit heaped in the basket, capped at what fits along its mouth.
  const heaped = Math.min(ripe, 5);
  for (let i = 0; i < heaped; i += 1) {
    const spread = heaped === 1 ? 0 : (i / (heaped - 1) - 0.5) * (w - 12);
    parts.push(
      circle(round2(bx + spread), round2(by - h - 1 - rng.next() * 2), 4, {
        fill: slot("fruit2"),
      }),
    );
  }

  if (detail === "full") {
    // One still falling, so the basket reads as being filled now.
    parts.push(
      circle(round2(bx - w / 2 - 10), round2(by - h - 34), 4, {
        fill: slot("fruit2"),
        opacity: 0.85,
      }),
    );
  }

  return group({ class: "kd-harvest" }, parts);
}

/** Everything the calendar adds, on top of what the user earned. */
export function drawSeasonal(
  skeleton: Skeleton,
  clusters: PadCluster[],
  facts: TreeFacts,
  species: Species,
  seed: number,
  detail: Detail,
): string {
  if (detail === "silhouette" || detail === "glyph") return "";

  const streams = streamsFor(seed);
  const bounds = crownBounds(skeleton.pads);

  const layers = [
    hasEvent(facts, "settledSnow") ? drawSettledSnow(clusters, facts, detail) : "",
    hasEvent(facts, "firstSnow") && detail === "full"
      ? drawFallingSnow(bounds, streams.for("snowfall"))
      : "",
    hasEvent(facts, "hanami")
      ? drawHanami(
          skeleton.pads,
          species,
          bounds,
          detail,
          streams.for("hanami"),
        )
      : "",
    hasEvent(facts, "harvest") ? drawHarvest(facts, detail, streams.for("harvest")) : "",
  ].filter((layer) => layer !== "");

  return layers.length === 0 ? "" : group({ class: "kd-seasonal" }, layers);
}

/**
 * Everything that lives on or around the tree rather than growing from it.
 *
 * Drawn after ornaments: an inhabitant is the thing the eye should find last
 * and remember first.
 */
export function drawInhabitants(
  skeleton: Skeleton,
  facts: TreeFacts,
  theme: Theme,
  species: Species,
  seed: number,
  detail: Detail,
): string {
  if (detail === "silhouette" || detail === "glyph") return "";

  const streams = streamsFor(seed);
  const { pads } = skeleton;
  const bounds = crownBounds(pads);
  const { ornaments } = facts;
  const budget = ornamentBudget(detail);
  const scale = (n: number): number => Math.round(n * budget);

  const layers = [
    drawFireflies(bounds, ornaments.fireflies, theme, detail, streams.for("fireflies")),
    drawBlossoms(
      pads,
      species,
      scale(ornaments.blossomClusters),
      detail,
      streams.for("blossoms"),
    ),
    drawFallingPetals(bounds, scale(ornaments.fallingPetals), streams.for("petals")),
    ornaments.windChime && detail === "full" ? drawWindChime(skeleton) : "",
    ornaments.bird === "none" ? "" : drawBird(skeleton, ornaments.bird),
  ].filter((layer) => layer !== "");

  return layers.length === 0 ? "" : group({ class: "kd-inhabitants" }, layers);
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export interface BonsaiTree {
  svg: string;
  skeleton: Skeleton;
}

/**
 * The button glyph: a pot, a trunk and a crown of foliage discs.
 *
 * At 88×31 a tree is a handful of shapes or it is mud, so this is drawn
 * directly rather than derived from the skeleton. It still has to read as a
 * biography at a glance, so both dimensions of growth are legible: the pot tier
 * widens the dish, and maturity grows the crown itself - a sprout is a low pair
 * of discs, a veteran a wide bushy mound on a taller, thicker trunk. Trunk
 * height alone was too fine a signal to tell the levels apart on a badge.
 *
 * Discs are `[dx, dy, r]` offsets from the crown base (dy up). Each set is
 * authored to sit inside y∈[1,24] and x∈[4,28] at every tier so the glyph never
 * clips the card or runs into the login text.
 */
const GLYPH_CROWNS: ReadonlyArray<{ upTo: number; discs: ReadonlyArray<[number, number, number]> }> = [
  // Sprout: a small, narrow bud.
  { upTo: 4, discs: [[-1.8, -2, 3], [1.8, -3.2, 3.4], [0, -5, 3]] },
  // Grown: the classic three-disc crown.
  { upTo: 8, discs: [[-3.6, -1, 4], [3.6, -2, 4.2], [0, -5, 4]] },
  // Ancient: a wide mound, three across and stacked.
  {
    upTo: Infinity,
    discs: [
      [-6, -1.5, 4], [0, -0.5, 4.2], [6, -2, 4],
      [-3.2, -5, 4.2], [3.2, -5.5, 4.3], [0, -8.5, 4],
    ],
  },
];

function drawGlyph(facts: TreeFacts): string {
  const pot = POTS[facts.potTier];
  const scale = 0.16;
  const potWidth = pot.width * scale;
  const cx = 14;
  const baseY = 24;

  // Trunk grows with maturity too, but modestly: the crown carries the signal.
  const trunkHeight = 3.5 + facts.maturity * 0.45;
  const trunkWidth = 1.4 + facts.maturity * 0.12;
  const crownBaseY = baseY - trunkHeight;

  const tones = [slot("foliage1"), slot("foliage2"), slot("foliage3")];
  const crown = (GLYPH_CROWNS.find((c) => facts.maturity <= c.upTo) ?? GLYPH_CROWNS[2]!).discs;

  return group({ class: "kd-tree" }, [
    path(
      new PathBuilder()
        .moveTo(cx - potWidth / 2, baseY)
        .lineTo(cx + potWidth / 2, baseY)
        .lineTo(cx + potWidth / 2 - 1.5, baseY + 4)
        .lineTo(cx - potWidth / 2 + 1.5, baseY + 4)
        .close()
        .toString(),
      { fill: slot("trunk") },
    ),
    el("line", {
      x1: cx,
      y1: baseY,
      x2: cx,
      y2: crownBaseY,
      stroke: slot("trunk"),
      "stroke-width": round2(trunkWidth),
      "stroke-linecap": "round",
    }),
    ...crown.map(([dx, dy, r], i) =>
      circle(cx + dx, crownBaseY + dy, r, { fill: tones[i % tones.length]! }),
    ),
  ]);
}

/** Draws the whole plant: substrate behind, masses in front. */
export function drawBonsai(
  facts: TreeFacts,
  theme: Theme,
  species: Species,
  detail: Detail = "full",
): BonsaiTree {
  const seed = seedFromLogin(facts.login);

  // Where form stops being invisible (C.4, D-042). Everything before this commit
  // derived a style and drew the same tree anyway; from here the silhouette is a
  // function of the account's history. `moyogi` and the four draw-layer styles
  // resolve to the default plan and an empty shape, so most trees are unmoved.
  const { trunks, cloud } = geometryFor(facts.form);
  const skeleton = buildSkeleton(seed, facts.maturity, trunks, cloud);

  if (detail === "glyph") {
    return { svg: drawGlyph(facts), skeleton };
  }

  // Built once and shared: anything that sits on the foliage needs the blobs
  // that were drawn, not the pad radii they were budgeted from.
  const clusters = buildClusters(skeleton, facts, seed, detail);

  const layers = [
    // One definition per document, referenced by every blob in the crown. Only
    // where the tufts are actually drawn: an unreferenced symbol is dead bytes,
    // and `classic` never references one at all.
    detail === "full" && species.leaf !== null ? el("defs", {}, leafSymbol(species)) : "",
    drawSubstrate(facts),
    drawBranches(skeleton, facts, detail),
    drawFoliage(clusters, species, detail),
    drawOrnaments(skeleton, facts, theme, species, seed, detail),
    drawInhabitants(skeleton, facts, theme, species, seed, detail),
    // Last: snow settles on top of everything, and the calendar has the final
    // word on what the tree looks like today.
    drawSeasonal(skeleton, clusters, facts, species, seed, detail),
  ].filter((layer) => layer !== "");

  return { svg: group({ class: "kd-tree" }, layers), skeleton };
}

export type { Pad };
