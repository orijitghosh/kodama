/**
 * The four forms whose style is drawn rather than grown (C.4, D-042).
 *
 * `form-geometry.ts` answers most of "form changes the tree" by reparameterising
 * the skeleton. These four cannot be answered that way: deadwood, exposed root,
 * root over rock and moss ball are all the *same* tree with something added to
 * or replacing the ground and the trunk. They share `AS_ALWAYS`, so the skeleton
 * they draw over is byte-identical to the one every account has always had, and
 * the entire style lives in this file.
 *
 * Three of them are additive marks placed between the substrate and the branch
 * strokes, so the trunk is drawn in front of its own roots. The fourth replaces
 * the pot, which is why the moss ball is called from `drawSubstrate` rather than
 * layered on top of it.
 *
 * Every mark is a pure function of `(facts, seed)` and every one draws on its own
 * labelled RNG substream, so adding a form here cannot shift a single existing
 * ornament - `streamsFor(seed).for(label)` is independent per label.
 */

import { BASE_X, BASE_Y } from "../skeleton.js";
import type { Skeleton, SkeletonNode } from "../skeleton.js";
import { streamsFor } from "../rng.js";
import { circle, el, group, PathBuilder, path } from "../svg.js";
import { slot } from "../themes.js";
import type { FormName } from "../form.js";
import type { TreeFacts } from "../types.js";

/**
 * The pot dimensions a mark is sized against.
 *
 * Passed in rather than imported, because pot geometry belongs to the substrate
 * in `bonsai.ts` and a mark has no business owning the table. Every mark scales
 * off it so a stone-pot veteran's rock reads as the same idea as a clay-pot
 * account's, at the size its ground actually is.
 */
export interface PotBox {
  width: number;
  height: number;
  lip: number;
  rim: number;
}

/** Two decimals is the document's precision everywhere else; matched here. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// sharimiki: a bleached vein up the live trunk
// ---------------------------------------------------------------------------

/**
 * The trunk spine: the root, then the heaviest child at each step.
 *
 * Weight is subtree size, so following the heaviest child is following the limb
 * carrying the most crown - which is what an eye reads as "the trunk". On a
 * multi-trunk skeleton the walk starts from the heaviest root for the same
 * reason `drawBranches` measures girth against it.
 */
function trunkSpine(nodes: SkeletonNode[]): SkeletonNode[] {
  const heaviest = new Int32Array(nodes.length).fill(-1);
  for (let i = 1; i < nodes.length; i += 1) {
    const parent = nodes[i]!.parent;
    if (parent < 0) continue;
    const held = heaviest[parent]!;
    if (held < 0 || nodes[i]!.weight > nodes[held]!.weight) heaviest[parent] = i;
  }

  let start = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    if (nodes[i]!.parent < 0 && nodes[i]!.weight > nodes[start]!.weight) start = i;
  }

  const spine: SkeletonNode[] = [nodes[start]!];
  for (let i = start; heaviest[i]! >= 0; ) {
    i = heaviest[i]!;
    spine.push(nodes[i]!);
  }
  return spine;
}

/**
 * Deadwood: a strip of the trunk stripped back to bare wood.
 *
 * Drawn *inside* the trunk silhouette rather than beside it, and that is the
 * whole trick. A shari is a bleached channel on a living trunk, not a second
 * pole - so the offset and the width are both fractions of the local girth,
 * which means the vein tapers with the trunk for free and can never escape it.
 * Set them independently and the vein slides off the side of a thin upper trunk
 * and reads as a broken branch.
 *
 * `snow` is the fill because it is the one slot that is pale in both schemes.
 * Bleached wood that goes dark on the dark theme is not bleached wood.
 */
export function drawDeadwoodVein(skeleton: Skeleton, facts: TreeFacts): string {
  const spine = trunkSpine(skeleton.nodes);
  // Under five nodes there is no trunk to bleach - a seedling is all crown - and
  // a two-point vein reads as a scratch. `sharimiki` needs a year gone and a
  // year back to be selected at all, so this is a guard, not a common path.
  if (spine.length < 5) return "";

  const rootWeight = spine[0]!.weight;
  // Stops well short of the crown: shari runs up the trunk and dies out where
  // the tree starts branching, and past that point the girth is too thin to
  // hold a visible channel anyway.
  const last = Math.max(3, Math.floor((spine.length - 1) * 0.45));

  const strokes: string[] = [];
  for (let i = 0; i < last; i += 1) {
    const from = spine[i]!;
    const to = spine[i + 1]!;
    const girth = facts.trunkGirth * Math.sqrt(to.weight / rootWeight);
    const width = girth * 0.3;
    if (width < 1.2) break;

    // Perpendicular to the segment, on a consistent side: a vein that crossed
    // the trunk mid-way would read as a wound, not a stripped face.
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const off = girth * 0.2;
    const ox = (dy / length) * off;
    const oy = (-dx / length) * off;

    // Bowed by the same 0.14 `segmentPath` bows the branch strokes with. A
    // straight chord alongside a curved trunk drifts off the wood on any seed
    // with character in its stem, which is every seed - the vein has to be the
    // trunk's own curve, offset, or it reads as a snapped branch leaning on it.
    const ax = from.x + ox;
    const ay = from.y + oy;
    const bx = to.x + ox;
    const by = to.y + oy;
    strokes.push(
      path(
        new PathBuilder()
          .moveTo(round2(ax), round2(ay))
          .quadraticTo(
            round2((ax + bx) / 2 - dy * 0.14),
            round2((ay + by) / 2 + dx * 0.14),
            round2(bx),
            round2(by),
          )
          .toString(),
        { "stroke-width": round2(width) },
      ),
    );
  }
  if (strokes.length === 0) return "";

  return group(
    {
      class: "kd-deadwood",
      stroke: slot("snow"),
      fill: "none",
      "stroke-linecap": "round",
      opacity: 0.9,
    },
    strokes,
  );
}

// ---------------------------------------------------------------------------
// neagari: roots lifted clear of the soil
// ---------------------------------------------------------------------------

/**
 * Exposed root: the trunk stands on a splay of visible roots.
 *
 * The soil line cannot move: the skeleton is untouched by contract and its root
 * node sits at `BASE_Y`, so the trunk still reaches the soil at full girth. What
 * reads as "lifted" is therefore the *flare*, not a void beneath the tree - the
 * legs converge behind the trunk and splay wider than it, and the daylight
 * between adjacent legs is what the eye takes for exposed root. `spread` is set
 * against pot width rather than girth for exactly that reason: it has to clear
 * the trunk at every tier or the flare disappears inside it and the mark is
 * drawn for nothing.
 *
 * Legs are drawn back to front by width so the near ones overlay the far ones,
 * and the trunk is drawn after this group, so it stands in front of its own
 * roots rather than behind them.
 */
export function drawExposedRoots(facts: TreeFacts, pot: PotBox, seed: number): string {
  const rng = streamsFor(seed).for("exposed-roots");
  // Older accounts have lifted further. Capped: past ~34px the trunk begins
  // above the pot rim and the tree reads as levitating rather than as rooted.
  const rise = Math.min(34, 16 + facts.maturity * 1.4);
  const spread = pot.width * 0.3;
  const soil = BASE_Y + pot.lip * 0.5;

  // Four legs, two either side. An odd count puts a leg down the centre line,
  // which hides the gap the whole style depends on.
  const legs: { d: string; width: number }[] = [];
  for (const fraction of [-1, -0.46, 0.46, 1]) {
    const jitter = rng.range(-0.12, 0.12);
    const dx = spread * (fraction + jitter);
    const outer = Math.abs(fraction) > 0.5;
    const width = Math.max(1.4, facts.trunkGirth * (outer ? 0.2 : 0.3));
    legs.push({
      width,
      d: new PathBuilder()
        .moveTo(round2(BASE_X + dx * 0.3), round2(BASE_Y - rise))
        .quadraticTo(
          round2(BASE_X + dx * 1.15),
          round2(BASE_Y - rise * 0.3),
          round2(BASE_X + dx),
          round2(soil + rng.range(0, 1.6)),
        )
        .toString(),
    });
  }
  legs.sort((a, b) => a.width - b.width);

  return group(
    {
      class: "kd-roots",
      stroke: slot("trunk"),
      fill: "none",
      "stroke-linecap": "round",
    },
    legs.map((leg) => path(leg.d, { "stroke-width": round2(leg.width) })),
  );
}

// ---------------------------------------------------------------------------
// sekijoju: root over rock
// ---------------------------------------------------------------------------

/**
 * Root over rock: a stone at the base, with roots gripping over it.
 *
 * The stone is the one long-lived repository the form was selected for, so it is
 * drawn at the size of the ground rather than at a fixed size - an account whose
 * anchor carries it into a stone pot gets a bigger rock. It sits off to one side
 * and partly buried, because a rock centred under the trunk just reads as a
 * lumpy pot.
 *
 * `border` is the face: the one slot that is a neutral mid-tone in both schemes,
 * which is what stone has to be. Depth is one darker facet, as TASTE §1.2
 * requires - no gradient, no shadow.
 */
export function drawStone(facts: TreeFacts, pot: PotBox, seed: number): string {
  const rng = streamsFor(seed).for("stone");
  const cx = BASE_X + pot.width * 0.2;
  const halfWidth = pot.width * 0.21;
  const height = 26 + pot.width * 0.1;
  const buried = BASE_Y + pot.lip * 1.2;
  const cy = buried - height / 2;

  // Eight jittered points around an ellipse, flattened where it enters the soil.
  // A rock is an irregular polygon or it is a pebble drawn by a computer.
  const SIDES = 8;
  const face = new PathBuilder();
  for (let i = 0; i < SIDES; i += 1) {
    const angle = (i / SIDES) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const jitter = rng.range(0.86, 1.14);
    const x = cx + halfWidth * Math.cos(angle) * jitter;
    const y = Math.min(buried, cy + (height / 2) * Math.sin(angle) * jitter);
    if (i === 0) face.moveTo(round2(x), round2(y));
    else face.lineTo(round2(x), round2(y));
  }
  face.close();

  // The shaded side, as a wedge off the same silhouette rather than a second
  // outline: two points on the rim and the centre.
  const shade = new PathBuilder()
    .moveTo(round2(cx + halfWidth * 0.86), round2(cy - height * 0.1))
    .lineTo(round2(cx + halfWidth * 0.3), round2(buried))
    .lineTo(round2(cx - halfWidth * 0.5), round2(buried))
    .lineTo(round2(cx), round2(cy + height * 0.12))
    .close();

  const parts = [
    path(face.toString(), { fill: slot("border") }),
    path(shade.toString(), { fill: slot("bg"), opacity: 0.22 }),
  ];

  // Roots over the shoulder of the rock: this is the "over" in root over rock,
  // and without them the stone is a boulder the tree happens to stand beside.
  const roots = 3;
  for (let i = 0; i < roots; i += 1) {
    const share = (i + 1) / (roots + 1);
    // Graded rather than uniform: three roots of one width read as a printed
    // triple line, which is the one thing a root should never look like.
    const width = Math.max(1.4, facts.trunkGirth * (0.22 - i * 0.04));
    parts.push(
      path(
        new PathBuilder()
          .moveTo(round2(BASE_X + 3), round2(BASE_Y - 24 - i * 5))
          .quadraticTo(
            round2(cx - halfWidth * 0.2),
            round2(cy - height * (0.42 + share * 0.18)),
            round2(cx + halfWidth * (0.5 + share * 0.4)),
            round2(buried - pot.lip * 0.4),
          )
          .toString(),
        {
          fill: "none",
          stroke: slot("trunk"),
          "stroke-width": round2(width),
          "stroke-linecap": "round",
        },
      ),
    );
  }

  return group({ class: "kd-stone" }, parts);
}

// ---------------------------------------------------------------------------
// kokedama: a bound moss ball instead of a pot
// ---------------------------------------------------------------------------

/**
 * The moss ball, which replaces the pot rather than sitting in it.
 *
 * `kokedama` is not a career style - it is what an account gets before there is
 * enough history to claim one (`activeWeeks` under 52), so it is drawn for
 * genuinely small trees. The ball rises a little above the soil line, which is
 * what a moss ball does, but only ~a third of its radius: at level 3 the trunk
 * is short, and a ball tall enough to look generous swallows the tree.
 *
 * It runs off the bottom edge exactly as the pot does at the larger tiers, which
 * is why nothing here worries about the 420px canvas height.
 */
export function drawMossBall(facts: TreeFacts, pot: PotBox, seed: number): string {
  const rng = streamsFor(seed).for("moss-ball");
  const r = pot.width * 0.3;
  const cy = BASE_Y + r * 0.34;

  const parts: string[] = [
    circle(BASE_X, round2(cy), round2(r), { fill: slot("foliage1") }),
    // A second disc, not a gradient: the lit crown of the ball, offset up.
    circle(BASE_X, round2(cy - r * 0.16), round2(r * 0.86), { fill: slot("foliage2") }),
  ];

  // Tufts around the upper rim, so the silhouette is moss and not a green disc.
  for (let i = 0; i < 5; i += 1) {
    const angle = Math.PI + (i / 4) * Math.PI + rng.range(-0.16, 0.16);
    const at = r * rng.range(0.82, 0.95);
    const length = r * rng.range(0.12, 0.2);
    const x = BASE_X + at * Math.cos(angle);
    const y = cy + at * Math.sin(angle);
    parts.push(
      path(
        new PathBuilder()
          .moveTo(round2(x), round2(y))
          .quadraticTo(
            round2(x + length * 0.4),
            round2(y - length),
            round2(x + length * 1.1),
            round2(y - length * 0.5),
          )
          .toString(),
        {
          fill: "none",
          stroke: slot("foliage3"),
          "stroke-width": 1.4,
          "stroke-linecap": "round",
        },
      ),
    );
  }

  // The binding. A moss ball is held by string, and without it this is a shrub
  // growing out of a green circle.
  const base = rng.range(0, Math.PI);
  for (let i = 0; i < 3; i += 1) {
    const angle = base + (i * Math.PI) / 3;
    const ax = Math.cos(angle);
    const ay = Math.sin(angle);
    parts.push(
      path(
        new PathBuilder()
          .moveTo(round2(BASE_X + r * ax), round2(cy + r * ay))
          // Bowed perpendicular, so the string wraps the ball instead of
          // cutting across it as a diameter.
          .quadraticTo(
            round2(BASE_X - r * ay * 0.34),
            round2(cy + r * ax * 0.34),
            round2(BASE_X - r * ax),
            round2(cy - r * ay),
          )
          .toString(),
        {
          fill: "none",
          stroke: slot("trunk"),
          "stroke-width": 1.2,
          opacity: 0.75,
        },
      ),
    );
  }

  if (facts.ornaments.soilPetalRing) {
    // The same memory the pot presses into its soil, put where this form has a
    // surface for it: around the crown of the ball, not at a soil line it has
    // not got.
    parts.push(
      el("ellipse", {
        cx: BASE_X,
        cy: round2(cy - r * 0.62),
        rx: round2(r * 0.66),
        ry: round2(r * 0.2),
        fill: "none",
        stroke: slot("blossom1"),
        "stroke-width": 1,
        opacity: 0.5,
      }),
    );
  }

  return parts.join("");
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** Forms whose substrate is not a pot. */
export function replacesPot(form: FormName): boolean {
  return form === "kokedama";
}

/**
 * The ground-level marks, drawn between the substrate and the branch strokes.
 *
 * Returns `""` for the eleven forms that have none, which `drawBonsai` filters
 * out - a form pays no bytes for a layer it does not use.
 *
 * `sekijoju`'s stone is conditional on the anchor being present, and that is a
 * correspondence guarantee rather than defensive coding: the stone *is* that
 * repository, its receipt names it, and an element that cannot say where it came
 * from does not get drawn. The rung requires a non-null anchor to select the
 * form at all, so the null branch is unreachable through `selectForm` - it
 * exists so that hand-built facts cannot produce an unaccountable rock.
 */
export function drawGroundMarks(facts: TreeFacts, pot: PotBox, seed: number): string {
  switch (facts.form) {
    case "neagari":
      return drawExposedRoots(facts, pot, seed);
    case "sekijoju":
      return facts.repoMix.anchor === null ? "" : drawStone(facts, pot, seed);
    default:
      return "";
  }
}

/** The marks drawn over the branch strokes, because they sit on the trunk. */
export function drawTrunkMarks(skeleton: Skeleton, facts: TreeFacts): string {
  return facts.form === "sharimiki" ? drawDeadwoodVein(skeleton, facts) : "";
}
