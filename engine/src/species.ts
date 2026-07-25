/**
 * Species: which plant to draw. A render option, not a fact.
 *
 * The tree the project shipped is `classic`, and it stays the default - nobody's
 * badge changes because this file exists. Four alternates are offered as options:
 * Japanese maple, ginkgo, cherry, wisteria. Each changes the leaf mass, the autumn
 * colour, the fruit form and the flower form, and nothing else.
 *
 * **Why this is an option and not derived from `languages[]`.** An earlier draft
 * picked the species from the top language, which made the picture carry a signal
 * the schema already had. It was the wrong trade: it changed every existing tree
 * to say something the owner never chose, and it put a claim in the receipts
 * ("this is a ginkgo because you write Go") that only holds while a curated
 * language table holds. A chosen plant claims nothing and breaks nothing. The PRD
 * closes the door on config files, not on URL params - the grammar has taken
 * `theme`, `scale`, `animate` and `tint` from the URL since v1, and this is the
 * fifth of those, not a new mechanism.
 *
 * So species may never touch what an account earned: no pad count, no ornament
 * count, no threshold, no skeleton. It is a costume. `species.test.ts` asserts
 * that directly, because it is the property that keeps two people with the same
 * history and different taste comparable.
 */

import type { ColorShift } from "./color.js";

export const SPECIES_NAMES = ["classic", "momiji", "ginkgo", "sakura", "fuji"] as const;
export type SpeciesName = (typeof SPECIES_NAMES)[number];

export const DEFAULT_SPECIES: SpeciesName = "classic";

/**
 * The leaf mass primitive. Not one leaf - a pad's worth of them, which is the
 * unit the crown is actually built from (`buildClusters`), so a species costs one
 * `<symbol>` in `<defs>` and a `<use>` per blob instead of a path per leaf.
 *
 * `null` is `classic`: the plain disc the tree has always used.
 */
export type LeafKind = "palmate" | "fan" | "ovate" | "pinnate";

/** What a merged pull request ripens into. */
export type FruitKind = "persimmon" | "samara" | "nut" | "cherry" | "pod";

/** How a kept streak flowers. `fivePetal` is the original and stays the default. */
export type BlossomKind = "fivePetal" | "cluster" | "raceme";

export interface Species {
  name: SpeciesName;
  /** English common name, for the header line and the receipt sentence. */
  label: string;
  /** `null` draws the original foliage discs. */
  leaf: LeafKind | null;
  /**
   * Autumn foliage, replacing the one global shift (SPEC-ENGINE §3.5). `null`
   * keeps the global amber, which is what `classic` has always turned.
   */
  autumn: ColorShift | null;
  fruit: FruitKind;
  blossom: BlossomKind;
}

/**
 * Autumn shifts, authored against the reference summer foliage.
 *
 * Each has to satisfy the constraint the global amber shift already documented:
 * the hue must actually arrive (a partial lerp from green stops in the olives) and
 * the saturation has to carry it, while staying duller than the fruit slots so a
 * leaf is never mistaken for a persimmon.
 */
const SCARLET: ColorShift = { towardHue: 12, towardAmount: 0.95, saturate: 2.9, lighten: 1.06 };
const GOLD: ColorShift = { towardHue: 44, towardAmount: 0.97, saturate: 3.1, lighten: 1.18 };
const SOFT_YELLOW: ColorShift = { towardHue: 52, towardAmount: 0.8, saturate: 2.2, lighten: 1.16 };

const SPECIES: Record<SpeciesName, Species> = {
  /** The tree as shipped: plain foliage discs, global amber autumn, persimmons. */
  classic: {
    name: "classic",
    label: "bonsai",
    leaf: null,
    autumn: null,
    fruit: "persimmon",
    blossom: "fivePetal",
  },
  momiji: {
    name: "momiji",
    label: "Japanese maple",
    leaf: "palmate",
    autumn: SCARLET,
    fruit: "samara",
    blossom: "fivePetal",
  },
  ginkgo: {
    name: "ginkgo",
    label: "ginkgo",
    leaf: "fan",
    autumn: GOLD,
    fruit: "nut",
    blossom: "fivePetal",
  },
  sakura: {
    name: "sakura",
    label: "cherry",
    leaf: "ovate",
    autumn: SOFT_YELLOW,
    fruit: "cherry",
    blossom: "cluster",
  },
  fuji: {
    name: "fuji",
    label: "wisteria",
    leaf: "pinnate",
    autumn: SOFT_YELLOW,
    fruit: "pod",
    blossom: "raceme",
  },
};

/**
 * Tolerant of a name it does not know, because the alternative is a crash.
 *
 * The service validates `?species=` before it reaches here (params.ts), so an
 * unknown value should be impossible - but this is the one option whose absence
 * would throw inside the drawing rather than degrade, and the route's contract is
 * that every path returns a tree. An unknown plant is the default plant.
 */
export function speciesByName(name: SpeciesName): Species {
  return SPECIES[name] ?? SPECIES[DEFAULT_SPECIES];
}

/** True for the default plant, whose drawing predates this file. */
export function isClassic(species: Species): boolean {
  return species.name === "classic";
}
