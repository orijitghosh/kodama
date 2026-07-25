/**
 * Receipts - every drawn element, traced back to the public number that put it
 * there (PRD §Receipts layer, SPEC-SERVICE §5).
 *
 * Every element on the tree names the figure it came from and how that figure
 * became this shape. If an element cannot say where it came from, it does not
 * get drawn. The rule holds because this list is derived from the same
 * `TreeFacts` the renderer draws from.
 *
 * Pure, like the rest of the engine: `receiptsFor(facts, locale)` is a function
 * of its arguments and nothing else.
 *
 * A receipt exists exactly when the element is on the canvas. The site relies on
 * that in both directions, and the property suite asserts the correspondence
 * rather than trusting it.
 */

import { fruitNoun, labelsFor } from "./locale.js";
import { DEFAULT_SPECIES, isClassic, speciesByName } from "./species.js";
import type { Species } from "./species.js";
import type { PotTier, TreeFacts } from "./types.js";

export interface Receipt {
  /**
   * The class the renderer puts on the group this describes. The site queries
   * the SVG with it, so it is part of the contract rather than a hint: renaming
   * a class in a biome breaks a receipt, and the golden tests say so.
   */
  target: string;
  /** Short name of the element: "fruit", "lanterns". Localized. */
  label: string;
  /** What is on the tree right now: "5 persimmons", "a 214-day streak". */
  value: string;
  /**
   * The public figure and the rule applied to it, in one sentence. English
   * regardless of locale, matching `biographyFor` - the label tables carry
   * nouns, and translated prose is a promise the project cannot keep yet.
   */
  provenance: string;
}

const POT_REASON: Record<PotTier, string> = {
  plastic: "an account under a year old",
  clay: "an account past its first year",
  glazed: "an account past three years",
  antique: "an account past seven years",
  stone: "an account past ten years",
};

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/**
 * Every element currently drawn, in the order the eye meets it: the tree
 * itself, then what grows on it, then what visits it, then the ground and the
 * season.
 */
export function receiptsFor(
  facts: TreeFacts,
  locale: string,
  species: Species = speciesByName(DEFAULT_SPECIES),
): Receipt[] {
  const labels = labelsFor(locale);
  const { ornaments, totals, streak } = facts;
  const receipts: Receipt[] = [];

  const add = (target: string, label: string, value: string, provenance: string): void => {
    receipts.push({ target, label, value, provenance });
  };

  // --- the tree ---------------------------------------------------------

  add(
    "kd-foliage",
    labels.legendFoliage,
    isClassic(species)
      ? `maturity ${String(facts.maturity)} of 13`
      : `maturity ${String(facts.maturity)} of 13, drawn as a ${species.label}`,
    `${plural(totals.commits, "commit", "commits")} across the account's lifetime, summed as ` +
      `log2(1 + commits) per active week so that a prolific year cannot flatten a quiet one.` +
      // A chosen plant explains itself as a choice. It changes the leaf, the
      // autumn colour, the fruit and the flower, and none of the numbers - so the
      // receipt says which half of the picture it is answerable for.
      (isClassic(species)
        ? ""
        : ` The plant is a ${species.label}, chosen with ?species=${species.name}: it sets the ` +
          `leaf, the autumn colour and the fruit form, and none of the counts above or below.`),
  );

  if (ornaments.shoots > 0) {
    add(
      "kd-shoots",
      labels.legendShoots,
      plural(ornaments.shoots, "shoot", "shoots"),
      `${plural(facts.commitsLast7d, "commit", "commits")} in the last seven days.`,
    );
  }

  // --- what grows on it -------------------------------------------------

  if (ornaments.fruit.length > 0) {
    const ripe = ornaments.fruit.filter((f) => f.ripeness >= 1).length;
    add(
      "kd-fruits",
      labels.legendFruit,
      `${String(ornaments.fruit.length)} ${fruitNoun(species, ornaments.fruit.length)}`,
      `${plural(totals.prsMerged, "merged pull request", "merged pull requests")} in total; the ` +
        `last ten are the ones drawn, ripening over sixty days from the merge date. ` +
        `${ripe === 0 ? "None are" : plural(ripe, "is", "are")} fully ripe.`,
    );
  }

  if (ornaments.unripeFruit > 0) {
    add(
      "kd-unripe",
      labels.legendUnripe,
      plural(ornaments.unripeFruit, "green fruit", "green fruit"),
      `${plural(totals.prsOpen, "open pull request", "open pull requests")}, one green fruit each, capped.`,
    );
  }

  if (ornaments.lanterns > 0) {
    add(
      "kd-lanterns",
      labels.legendLanterns,
      plural(ornaments.lanterns, "lantern", "lanterns"),
      `${plural(totals.reviews, "code review", "code reviews")}, as log2(1 + reviews) - ` +
        `a lantern is an order of magnitude, not a tally.`,
    );
  }

  if (ornaments.blossomClusters > 0) {
    add(
      "kd-blossoms",
      labels.legendBlossom,
      plural(ornaments.blossomClusters, "blossom cluster", "blossom clusters"),
      `a current streak of ${plural(streak.current, "day", "days")}; blossom opens at fourteen ` +
        `days and gains a cluster every thirty.`,
    );
  }

  if (ornaments.fallingPetals > 0) {
    add(
      "kd-petals",
      "falling petals",
      plural(ornaments.fallingPetals, "petal", "petals"),
      `a streak that ended - the last active day was ${streak.lastActiveDate}, and petals fall ` +
        `for a fortnight after.`,
    );
  }

  // --- what visits it ---------------------------------------------------

  if (ornaments.fireflies > 0) {
    // Theme-blind by construction: `receiptsFor` takes facts and a locale, not a
    // palette, and the same count is drawn as fireflies at night and butterflies
    // by day. So the sentence names both rather than guessing which is on screen.
    add(
      "kd-fireflies",
      labels.legendFireflies,
      plural(ornaments.fireflies, "mark", "marks"),
      `${plural(totals.starsReceived, "star", "stars")} across owned public repositories, as ` +
        `3 × log10(1 + stars) - fireflies on the night themes, butterflies on the day ones.`,
    );
  }

  if (ornaments.bird !== "none") {
    add(
      "kd-bird",
      labels.legendBird,
      ornaments.bird === "nesting" ? "a nesting bird" : "a perched bird",
      `${plural(totals.issuesClosed, "closed issue", "closed issues")}; a bird perches at fifty ` +
        `and nests at two hundred and fifty.`,
    );
  }

  if (ornaments.windChime) {
    add(
      "kd-chime",
      labels.legendChime,
      "a wind chime",
      `${plural(totals.discussions, "answered discussion", "answered discussions")}; the chime ` +
        `hangs at twenty-five.`,
    );
  }

  // --- the ground and the season ----------------------------------------

  add(
    "kd-substrate",
    "pot",
    `${facts.potTier} pot`,
    `${POT_REASON[facts.potTier]} - ${String(Math.floor(facts.accountYears))} whole ${
      Math.floor(facts.accountYears) === 1 ? "year" : "years"
    } as of ${facts.date}.`,
  );

  if (facts.events.length > 0) {
    add(
      "kd-seasonal",
      labels.seasons[facts.season],
      facts.events.map((e) => e.kind).join(", "),
      `the render date ${facts.date} falls inside a seasonal window; the season is a function of ` +
        `the date alone, never of the account.`,
    );
  }

  return receipts;
}
