/**
 * The species imagery for the bonsai biome: leaf mass, fruit, flower.
 *
 * Three deliberate constraints shape everything here.
 *
 * **A leaf mass, not a leaf.** The crown is built from pad clusters - four to
 * nine blobs per pad, up to about 150 on a whale (`buildClusters`). Drawing an
 * individual palmate leaf at each site would be 150 inline paths and would blow
 * the 60 KB full-scale cap, which is what PROPOSAL-VARIETALS §7.5 warned about.
 * So each species defines one `<symbol>` holding a *tuft* of its foliage, and a
 * blob becomes a `<use>` of it at the blob's size: one definition per document,
 * and roughly a circle's worth of bytes per instance.
 *
 * **Fill by inheritance.** Shapes inside a symbol carry no `fill`, so each
 * `<use>` paints its instance from the foliage slot it was given. One mechanism,
 * no per-instance colour duplication, and the three-tone alternation the crown
 * already had survives untouched.
 *
 * **Readable at 12 px.** These are 10-20 px on screen. Every shape below is
 * authored against that, not against a botanical illustration: a palmate leaf is
 * five blunt lobes, a ginkgo four wide ones. If a species cannot be told from its
 * neighbour at badge size it has failed, whatever it looks like zoomed in.
 *
 * `classic` has no entry here. It is the tree as shipped, drawn by the code that
 * always drew it (`drawFoliage`), and this file is only reached for an alternate.
 */

import type { BlossomKind, FruitKind, LeafKind, Species, SpeciesName } from "../species.js";
import { circle, el, group, PathBuilder, path } from "../svg.js";
import { slot } from "../themes.js";

/** Every symbol is authored in this box and scaled per instance. */
const BOX = 20;
const C = BOX / 2;

/**
 * The symbol id carries the species.
 *
 * Within one document `kd-leaf` would have been enough, and a badge is always one
 * document. But an id is only unique inside the document it lands in, and this
 * engine's output gets inlined: the receipts page inlines a tree (D-035), a
 * contact sheet inlines dozens, and Grove (Tier 3) will inline up to eight at
 * once. Two species sharing one id in one page means the first definition paints
 * every crown - which is exactly what happened to the first gate-3 sheet, and it
 * read as "the leaf shapes do not work" rather than as an id collision. Naming
 * the species makes the collision impossible where it matters and harmless where
 * it does not: two ginkgos share an id and an identical definition.
 */
export function leafSymbolId(species: Species): string {
  // Abbreviated because this string is repeated once per foliage blob - about 150
  // times on a whale - so every character is 150 bytes of badge.
  return `kd-l-${SHORT[species.name]}`;
}

const SHORT: Record<SpeciesName, string> = {
  classic: "cla",
  momiji: "mom",
  ginkgo: "gin",
  sakura: "sak",
  fuji: "fuj",
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A leaf blade as a pointed ellipse: two cubics meeting at tip and base.
 *
 * `attrs` is how the fruit shapes borrow the same primitive - inside a symbol a
 * blade carries no fill and inherits, but a samara hanging on a branch needs its
 * own.
 */
function blade(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  deg: number,
  attrs: Record<string, string | number> = {},
): string {
  const d = new PathBuilder()
    .moveTo(cx, cy - ry)
    .cubicTo(cx + rx, cy - ry * 0.35, cx + rx, cy + ry * 0.35, cx, cy + ry)
    .cubicTo(cx - rx, cy + ry * 0.35, cx - rx, cy - ry * 0.35, cx, cy - ry)
    .close()
    .toString();
  if (deg === 0) return path(d, attrs);
  return path(d, {
    ...attrs,
    transform: `rotate(${String(round2(deg))} ${String(round2(cx))} ${String(round2(cy))})`,
  });
}

/**
 * A pad is a mass with an edge, and the edge is the species.
 *
 * The first attempt made each tuft a spray of blades radiating from the centre.
 * Rendered at 12 px that turned every crown into a thistle and made a pine
 * indistinguishable from a maple - the pads stopped reading as foliage at all.
 * The mass is what the classic tree got right, so it stays: a filled core, with
 * species-shaped lobes breaking the outline. Maple lobes are broad and blunt, a
 * ginkgo's edge is scalloped, a wisteria's comes in opposed pairs.
 */
function mass(core: number): string {
  return circle(C, C, core);
}

/**
 * `count` lobes evenly around the mass, each reaching `tip` from the centre.
 * `width` is the half-width at the base, so a small width is a needle and a
 * large one is a lobe.
 */
function lobes(count: number, core: number, tip: number, width: number, phase = 0): string {
  const parts: string[] = [];
  const mid = (core + tip) / 2;
  for (let i = 0; i < count; i += 1) {
    const deg = phase + (i / count) * 360;
    const rad = (deg * Math.PI) / 180;
    parts.push(
      blade(
        C + Math.cos(rad) * (mid - core * 0.15),
        C + Math.sin(rad) * (mid - core * 0.15),
        width,
        (tip - core) / 2 + core * 0.35,
        deg + 90,
      ),
    );
  }
  return parts.join("");
}

/**
 * The other edge family: rounded bumps instead of pointed blades.
 *
 * A maple lobe is blunt, and at 12 px pointed lobes made every crown read as the
 * same spiky round whatever species it was. The broadleaves take this; wisteria,
 * whose leaflets really are pointed and paired, takes `lobes`.
 */
function bumps(count: number, core: number, r: number, phase = 0): string {
  const parts: string[] = [];
  // Seated so the bump's outer edge lands near the box edge without leaving the
  // core visible as a separate disc behind it.
  const seat = 10 - r * 0.82;
  for (let i = 0; i < count; i += 1) {
    const rad = ((phase + (i / count) * 360) * Math.PI) / 180;
    parts.push(circle(round2(C + Math.cos(rad) * seat), round2(C + Math.sin(rad) * seat), r));
  }
  return mass(core) + parts.join("");
}

const LEAVES: Record<LeafKind, () => string> = {
  // Maple: five blunt lobes - the most recognisable outline in the set.
  palmate: () => bumps(5, 4.6, 4.6, 18),
  // Ginkgo: four wide fans, so the edge reads scalloped rather than lobed.
  fan: () => bumps(4, 5, 5.4, 45),
  // Cherry: small ovate leaves, a gently bumpy edge.
  ovate: () => bumps(7, 5.6, 3.2, 12),
  // Wisteria: pinnate, so the edge comes in opposed pairs rather than a ring.
  pinnate: () =>
    mass(5.6) +
    lobes(3, 5.4, 9.8, 2.4, 90) +
    lobes(3, 5.4, 9.8, 2.4, 270) +
    lobes(2, 5.4, 8.4, 1.9, 0),
};

/**
 * The species' foliage symbol, for `<defs>`.
 *
 * `overflow="visible"` is deliberate: several tufts are authored slightly past
 * the box so a pad's edge stays ragged rather than clipping to a square.
 */
export function leafSymbol(species: Species): string {
  if (species.leaf === null) throw new Error("classic has no leaf symbol");
  return el(
    "symbol",
    {
      id: leafSymbolId(species),
      viewBox: `0 0 ${String(BOX)} ${String(BOX)}`,
      overflow: "visible",
    },
    LEAVES[species.leaf](),
  );
}

/** One blob of foliage as an instance of the species symbol. */
export function leafUse(species: Species, x: number, y: number, r: number, fill: string): string {
  // A tuft fills its box, so the instance is sized on the blob's diameter and
  // centred on it - the same footprint the circle it replaces had.
  const size = round2(r * 2);
  return el("use", {
    href: `#${leafSymbolId(species)}`,
    x: round2(x - r),
    y: round2(y - r),
    width: size,
    height: size,
    fill,
  });
}

// ---------------------------------------------------------------------------
// Fruit: what a merged pull request ripens into
// ---------------------------------------------------------------------------

/**
 * A species' fruit at radius `r`, centred on (x, y).
 *
 * `ripe` picks the fruit colour over the unripe green; the caller still owns the
 * ripening overlay, the stem and the counting, because those are grammar rather
 * than botany (SPEC-ENGINE §3.4).
 */
export function speciesFruit(kind: FruitKind, x: number, y: number, r: number, fill: string): string {
  switch (kind) {
    case "persimmon":
      // The original: a plain disc, which is what `classic` still draws.
      return circle(x, y, r, { fill });
    case "samara":
      // The maple's winged seed: two blades off one point, the wing being the
      // whole joke.
      return (
        blade(x - r * 0.5, y, r * 0.42, r * 1.1, -28, { fill }) +
        blade(x + r * 0.5, y, r * 0.42, r * 1.1, 28, { fill })
      );
    case "nut":
      return el("ellipse", { cx: x, cy: y, rx: round2(r * 0.72), ry: round2(r * 0.92), fill });
    case "cherry":
      // A pair on one stalk, which is how cherries hang.
      return (
        circle(round2(x - r * 0.5), y, round2(r * 0.62), { fill }) +
        circle(round2(x + r * 0.5), round2(y + r * 0.2), round2(r * 0.62), { fill })
      );
    case "pod":
      return el("ellipse", { cx: x, cy: y, rx: round2(r * 0.38), ry: round2(r * 1.15), fill });
  }
}

// ---------------------------------------------------------------------------
// Flowers
// ---------------------------------------------------------------------------

/**
 * A species' flower. The *count* still comes from the streak (SPEC-ENGINE §3.4)
 * - species changes what a flower looks like, never whether one is earned.
 */
export function speciesBlossom(kind: BlossomKind, x: number, y: number, scale: number): string {
  const parts: string[] = [];

  if (kind === "raceme") {
    // Wisteria hangs. Five small florets down a pendulous chain, which is a
    // completely different silhouette from the five-petal disc.
    for (let i = 0; i < 5; i += 1) {
      const t = i / 4;
      parts.push(
        circle(
          round2(x + (i % 2 === 0 ? -0.8 : 0.8) * scale),
          round2(y + t * 8.5 * scale),
          round2((1.9 - t * 0.7) * scale),
          { fill: i % 2 === 0 ? slot("blossom1") : slot("blossom2") },
        ),
      );
    }
    return parts.join("");
  }

  // Cherry blossoms are small and come in threes; everything else is the
  // original single five-petal flower.
  const petalR = kind === "cluster" ? 1.9 : 2.2;
  const ring = kind === "cluster" ? 2 : 2.3;
  const centres = kind === "cluster" ? 3 : 1;

  for (let c = 0; c < centres; c += 1) {
    const angleOffset = (c / Math.max(1, centres)) * Math.PI * 2;
    const ox = centres === 1 ? x : x + Math.cos(angleOffset) * 3.1 * scale;
    const oy = centres === 1 ? y : y + Math.sin(angleOffset) * 3.1 * scale;
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      parts.push(
        circle(
          round2(ox + Math.cos(angle) * ring * scale),
          round2(oy + Math.sin(angle) * ring * scale),
          round2(petalR * scale),
          { fill: slot("blossom1") },
        ),
      );
    }
    parts.push(circle(round2(ox), round2(oy), round2(1.2 * scale), { fill: slot("blossom2") }));
  }

  return parts.join("");
}

// ---------------------------------------------------------------------------
// Butterflies
// ---------------------------------------------------------------------------

/**
 * Stars on a day theme.
 *
 * Fireflies are night-only, and correctly so - a glowing dot on washi is a
 * smudge (D-020). But that left `paper`, `sakura` and `shore` with no
 * representation of stars at all: the single most-cited number on GitHub,
 * invisible on half the themes. A butterfly is the day form of the same mark:
 * same count, same log scale, same receipt, drawn in a colour that reads on a
 * pale ground instead of one that needs the dark to glow.
 */
export function butterfly(x: number, y: number): string {
  // Wings in the blossom slot, not the accent.
  //
  // Accent is the theme's loudest colour and on the washi palettes it is a rust
  // brown, which at 5 px with a dark body read as a small brown insect on the
  // paper - or as grit. The blossom slot is a soft petal colour in every palette,
  // which is what a butterfly wants, and it borrows a colour the eye already
  // accepts as "the pretty thing on this tree".
  // Sized against a README, not against a zoom. The first pass used a 2.6 × 1.5
  // wing at 0.9 opacity, which is legible at 3× and invisible at 1× - about seven
  // pixels of pale rose on washi, which a reader simply does not see. A firefly
  // gets away with being small because its glow halo doubles its footprint; a
  // butterfly has no halo, so it has to be bigger and fully opaque.
  const wing = (dx: number, deg: number): string =>
    el("ellipse", {
      cx: round2(x + dx),
      cy: y,
      rx: 3.5,
      ry: 2,
      fill: slot("blossom1"),
      transform: `rotate(${String(deg)} ${String(round2(x + dx))} ${String(y)})`,
    });

  return group({ class: "kd-butterfly" }, [
    wing(-2, -38),
    wing(2, 38),
    // A dark thin body is what stops two ellipses reading as a pair of fallen
    // petals. It is the trunk colour rather than a blossom tone: the wings are
    // what needed to stop being brown, not the body, and without something dark
    // between them the mark has no anchor.
    el("ellipse", { cx: x, cy: y, rx: 0.6, ry: 2.4, fill: slot("trunk"), opacity: 0.9 }),
  ]);
}
