/**
 * Form - the silhouette, chosen from how someone works (D-042, PROPOSAL-VARIETALS §3).
 *
 * Everything else on the tree is volume or age or a costume. Form is the answer
 * to the launch comment that trees are hard to tell apart, because it is the
 * *outline* that changes: two five-year accounts with the same commit count and
 * completely different working lives stop being the same drawing.
 *
 * Three things about this module in particular.
 *
 * **It is a priority ladder, first match wins**, and the order is part of the
 * design rather than an implementation detail. A rung placed below a broader one
 * is a style nobody can ever be - see `neagari` below, which was exactly that
 * bug as the proposal tabled it (D-043). `FORM_LADDER` is data so the ordering
 * is one readable list instead of a nest of branches.
 *
 * **Every threshold here is a placeholder pending calibration** (§7.6). They are
 * gathered in `FORM_THRESHOLDS` for that reason: a calibration run has one object
 * to move, and the diff of a recalibration is legible. Nothing in this file
 * should be read as an authored value until a corpus run has passed its
 * acceptance bar - no style above 35% of accounts, none below 2%.
 *
 * **It draws nothing.** Selection is a pure function of `TreeFacts` and the repo
 * mix, and the geometry it maps onto - trunk plans, cloud reparameterisations,
 * draw-layer additions - arrives with C.4. That separation is what lets the
 * ladder be calibrated before it is visible to a single reader.
 */

import { daysBetween } from "./date.js";
import { MAX_MATURITY } from "./limits.js";
import type { RepoMix, TreeFacts } from "./types.js";

/**
 * The catalogue. Japanese names, because they are the classification the styles
 * come from and every one of them is a claim about growth conditions rather than
 * a decoration - which is the whole reason the mapping onto careers works.
 */
export const FORM_NAMES = [
  /** Moss ball. Not a style: the seedling and ghost display. */
  "kokedama",
  /** Raft - several trunks off a fallen stem. Builds on others' work. */
  "ikadabuki",
  /** Forest - graded trees in one tray. Spread across communities. */
  "yoseUe",
  /** Literati - tall, thin, foliage at the apex. Wrote one thing everyone uses. */
  "bunjin",
  /** Root over rock. One long-lived project, and the stone is that project. */
  "sekijoju",
  /** Clump - trunks from one root mass. Genuine polyglot. */
  "kabudachi",
  /** Twin trunk. Two worlds. */
  "sokan",
  /** Formal upright. The metronome. */
  "chokkan",
  /** Broom - a fan splitting off one trunk. Even, wide contributor. */
  "hokidachi",
  /** Exposed root. Long history, quiet now. */
  "neagari",
  /** Windswept. Pulled away by life. */
  "fukinagashi",
  /** Deadwood - a bleached vein beside a live one. Survived something. */
  "sharimiki",
  /** Slant. One big codebase. */
  "shakan",
  /** Informal upright - today's tree, and the fallback. */
  "moyogi",
] as const;

export type FormName = (typeof FORM_NAMES)[number];

/** The style every account gets when nothing more specific is true. */
export const DEFAULT_FORM: FormName = "moyogi";

/**
 * How the spoken biography names a style.
 *
 * The Japanese name and then a gloss, because neither alone is honest: the
 * Japanese name is what everything else in this project calls the style, and a
 * screen-reader user who does not have bonsai vocabulary gets nothing from it
 * on its own. Species took the same shape - a `label` on the record, English,
 * outside the locale tables - and this follows it rather than inventing a
 * second convention (D-011: no font metrics, so nothing here is a layout).
 *
 * Not localised, for the same reason `Species.label` is not: these are proper
 * names of a classification, and a `ja` table would be translating them back
 * into the language they came from.
 */
export const FORM_LABELS: Record<FormName, string> = {
  kokedama: "kokedama, a bound moss ball",
  ikadabuki: "ikadabuki, a raft",
  yoseUe: "yose-ue, a forest planting",
  bunjin: "bunjin, a literati",
  sekijoju: "seki-joju, root over rock",
  kabudachi: "kabudachi, a clump",
  sokan: "sokan, a twin trunk",
  chokkan: "chokkan, a formal upright",
  hokidachi: "hokidachi, a broom",
  neagari: "neagari, an exposed root",
  fukinagashi: "fukinagashi, a windswept",
  sharimiki: "sharimiki, deadwood",
  shakan: "shakan, a slant",
  moyogi: "moyogi, an informal upright",
};

/**
 * Forms whose substrate is not a pot.
 *
 * A fact about the style rather than about the drawing, which is why it sits
 * here and not in `form-marks.ts` where it was first written: the biography has
 * to know it too, and it must not have to import the draw layer to find out.
 */
export function replacesPot(form: FormName): boolean {
  return form === "kokedama";
}

/**
 * Below this much *evidence*, nobody gets a style claim.
 *
 * This was a maturity floor of 5 until the corpus was measured, and it was wrong
 * by a lot: 58% of real accounts fell under it, and those accounts had a median
 * of 91 active weeks - nearly two years of work - distributed across nine
 * different styles once the ladder was allowed to read them (D-044).
 *
 * The cause is that maturity is a *volume* ladder - 400 growth units a level,
 * roughly four years of steady commits to reach level 5 - so it answers "how
 * much", while a floor needs to ask "how much do we know". `activeWeeks` asks
 * that directly. One year of weeks that actually had something in them, after
 * which 83% of the measured corpus can hold a style and a seedling is a
 * genuinely new account rather than anybody who is not a whale.
 */
export const FORM_MIN_ACTIVE_WEEKS = 52;

/**
 * Every number the ladder compares against, in one place.
 *
 * **Measured, not authored** - as of the 2026-07-25 calibration run over 159
 * accounts, 132 of them styled (D-044). Each one is placed where it puts its rung
 * inside §7.6's 2-35% band, and the run is replayable at any time with
 * `pnpm --filter @kodama/api calibrate -- --from-cache`.
 *
 * Placed against a sample, though, and the sample is GitHub user search, which
 * ranks by popularity. The rungs resting on four or five accounts - stone,
 * exposed root, slant - are placements rather than measurements, and a curated
 * corpus moving them is expected rather than a regression.
 */
export const FORM_THRESHOLDS = {
  /** ikadabuki: mostly other people's repositories, and many of them. */
  raftOwnShare: 0.25,
  raftBreadth: 12,
  /**
   * yoseUe: many owners, many repos, no centre of gravity. Every one of these is
   * far past where the first draft guessed - corpus median breadth is 26 repos
   * and median hhi 0.13, so "scattered across twenty repos" describes half of
   * GitHub rather than a forest.
   */
  forestOrgs: 8,
  forestHhi: 0.1,
  forestBreadth: 60,
  /** kabudachi: three languages carrying real share, spread across repos. */
  clumpLangs: 3,
  clumpHhi: 0.25,
  /**
   * sokan: a *second* language holding better than 30%. Only the second share is
   * tested because the shares are sorted and sum to at most one - if the runner-up
   * clears 30%, the leader has too, and one condition says it more plainly.
   */
  twinSecondLang: 0.3,
  /**
   * bunjin: reach far out of proportion to output. The corpus median is 3.7 stars
   * per commit, so the guessed 0.4 was below the tenth percentile - it described
   * everybody. 25 is roughly the corpus's eightieth percentile.
   */
  literatiStarsPerCommit: 25,
  literatiMaxCommits: 5000,
  literatiMinYears: 3,
  /** sekijoju: one old repo of the account's own, still central. */
  stoneRepoYears: 5,
  stoneRepoShare: 0.2,
  /**
   * chokkan: rhythm, and nothing else.
   *
   * It asked for steadiness *and* an unbroken streak *and* concentration, which
   * is three claims wearing one name, and the conjunction admitted 4 accounts in
   * 132. Concentration is not part of what "metronome" means, so it is gone.
   */
  uprightCadenceCV: 0.9,
  uprightStreak: 60,
  /**
   * hokidachi: spread, and nothing else.
   *
   * Broom and upright were competing for the same steady accounts, so whichever
   * sat higher starved the other. Broom is now about breadth and evenness across
   * repositories, upright about evenness across time. One signal each.
   */
  broomHhi: 0.06,
  broomBreadth: 20,
  /** neagari: a long history that has gone quiet. */
  exposedRootYears: 7,
  exposedRootDecline: 0.15,
  /** fukinagashi: pulled away, but still here. */
  windsweptDecline: 0.2,
  /**
   * sharimiki: a year gone and a year back.
   *
   * At the drafted 180/180 this accepted 69 accounts of 149 - in a ten-year
   * account, a six-month gap that closed six months ago is not a signal, it is a
   * description of having existed.
   */
  deadwoodSpellDays: 365,
  deadwoodHealedDays: 365,
  /**
   * shakan: one big codebase, part of it somebody else's.
   *
   * The drafted band wanted mid `ownShare` with high `hhi`, and those are
   * anticorrelated in real data - contributing to other people's repositories is
   * exactly what spreads a mix out - so the pair admitted nobody at all.
   */
  slantOwnShareMin: 0.3,
  slantOwnShareMax: 0.9,
  slantHhi: 0.18,
} as const;

/**
 * The facts a rung may read: everything except the form itself.
 *
 * Spelled as an omission because `treeFacts` calls `selectForm` while it is still
 * assembling the facts - the form is the last field filled in, so it cannot be a
 * required input to choosing it. A complete `TreeFacts` is still accepted
 * wherever this is, which is what keeps the calibration harness and the tests
 * calling `selectForm` exactly as they did.
 */
export type FormFacts = Omit<TreeFacts, "form">;

/** What a rung gets to look at. Everything here is already derived. */
export interface FormInput {
  facts: FormFacts;
  repoMix: RepoMix;
}

/** One rung: a name and the condition that claims it. */
export interface FormRung {
  name: FormName;
  /** Why a reader would recognise themselves in it. Feeds the receipt in C.7. */
  reads: string;
  when: (input: FormInput) => boolean;
}

/** Language shares, descending, without assuming the payload arrived sorted. */
function langShares(facts: FormFacts): number[] {
  return facts.languages.map((lang) => lang.share).sort((a, b) => b - a);
}

/** Stars received per commit - reach measured against output. */
function starsPerCommit(facts: FormFacts): number {
  if (facts.totals.commits <= 0) return 0;
  return facts.totals.starsReceived / facts.totals.commits;
}

/** Days since the most recent dormancy closed, or null if none ever has. */
function healedFor(facts: FormFacts): number | null {
  const spells = facts.signals.dormancyHistory;
  const last = spells[spells.length - 1];
  if (last === undefined) return null;
  return daysBetween(last.endedAt, facts.date);
}

/**
 * The ladder, in priority order. First match wins.
 *
 * Ordering rule: **a narrower rung sits above every rung that subsumes it.** The
 * structural claims about where someone's commits go come first; the rungs about
 * rhythm and decline come last, because every account has a cadence and only some
 * have a distinctive one.
 *
 * Two places the drafted order was wrong, both caught by measurement rather than
 * by reading the table:
 *
 * - `neagari` above `fukinagashi` (D-043). Windswept asks for a decline, exposed
 *   root for a steeper decline plus seven years - tabled the other way round, no
 *   account could ever be an exposed root.
 * - `chokkan` and `hokidachi` above the decline rungs, and holding one signal
 *   each (D-044). They previously overlapped on steadiness, so whichever sat
 *   higher starved the other to zero, and both sat under rungs that took their
 *   accounts first.
 *
 * The reachability test in `form.test.ts` asserts every rung through the whole
 * selector, which is what keeps this from happening again to a rung added later.
 */
export const FORM_LADDER: readonly FormRung[] = [
  {
    name: "ikadabuki",
    reads: "builds on other people's work",
    when: ({ repoMix }) =>
      repoMix.ownShare < FORM_THRESHOLDS.raftOwnShare &&
      repoMix.breadth >= FORM_THRESHOLDS.raftBreadth,
  },
  {
    name: "yoseUe",
    reads: "spread across many communities",
    when: ({ repoMix }) =>
      repoMix.orgs >= FORM_THRESHOLDS.forestOrgs &&
      repoMix.hhi < FORM_THRESHOLDS.forestHhi &&
      repoMix.breadth >= FORM_THRESHOLDS.forestBreadth,
  },
  {
    name: "bunjin",
    reads: "wrote one thing a lot of people use",
    when: ({ facts }) =>
      facts.totals.commits > 0 &&
      facts.totals.commits < FORM_THRESHOLDS.literatiMaxCommits &&
      facts.accountYears >= FORM_THRESHOLDS.literatiMinYears &&
      starsPerCommit(facts) >= FORM_THRESHOLDS.literatiStarsPerCommit,
  },
  {
    name: "sekijoju",
    reads: "one long-lived project",
    when: ({ repoMix }) =>
      repoMix.anchor !== null &&
      repoMix.anchor.years >= FORM_THRESHOLDS.stoneRepoYears &&
      repoMix.anchor.share >= FORM_THRESHOLDS.stoneRepoShare,
  },
  {
    name: "kabudachi",
    reads: "a genuine polyglot",
    when: ({ facts, repoMix }) =>
      facts.signals.langCount15 >= FORM_THRESHOLDS.clumpLangs &&
      repoMix.hhi < FORM_THRESHOLDS.clumpHhi,
  },
  {
    name: "sokan",
    reads: "two worlds at once",
    when: ({ facts }) => (langShares(facts)[1] ?? 0) >= FORM_THRESHOLDS.twinSecondLang,
  },
  {
    name: "chokkan",
    reads: "a metronome",
    when: ({ facts }) =>
      facts.signals.cadenceCV < FORM_THRESHOLDS.uprightCadenceCV &&
      facts.streak.longest >= FORM_THRESHOLDS.uprightStreak,
  },
  {
    name: "hokidachi",
    reads: "even and wide",
    when: ({ repoMix }) =>
      repoMix.hhi < FORM_THRESHOLDS.broomHhi &&
      repoMix.breadth >= FORM_THRESHOLDS.broomBreadth,
  },
  {
    name: "neagari",
    reads: "a long history, quiet lately",
    when: ({ facts }) =>
      facts.accountYears >= FORM_THRESHOLDS.exposedRootYears &&
      facts.signals.declineRatio < FORM_THRESHOLDS.exposedRootDecline,
  },
  {
    name: "fukinagashi",
    reads: "pulled away, but still here",
    when: ({ facts }) =>
      !facts.dormant && facts.signals.declineRatio < FORM_THRESHOLDS.windsweptDecline,
  },
  {
    name: "sharimiki",
    reads: "came back from a long absence",
    when: ({ facts }) => {
      const healed = healedFor(facts);
      if (healed === null) return false;
      const last = facts.signals.dormancyHistory[facts.signals.dormancyHistory.length - 1]!;
      return (
        last.days >= FORM_THRESHOLDS.deadwoodSpellDays &&
        healed >= FORM_THRESHOLDS.deadwoodHealedDays
      );
    },
  },
  {
    name: "shakan",
    reads: "one big codebase",
    when: ({ repoMix }) =>
      repoMix.ownShare >= FORM_THRESHOLDS.slantOwnShareMin &&
      repoMix.ownShare <= FORM_THRESHOLDS.slantOwnShareMax &&
      repoMix.hhi > FORM_THRESHOLDS.slantHhi,
  },
];

/**
 * Which silhouette an account gets.
 *
 * Pure, and total: every input lands on some rung or on `moyogi`. The evidence
 * floor comes first, because a style is a claim and there is nothing yet to
 * claim about an account with a few weeks in it.
 */
export function selectForm({ facts, repoMix }: FormInput): FormName {
  if (facts.signals.activeWeeks < FORM_MIN_ACTIVE_WEEKS) return "kokedama";

  for (const rung of FORM_LADDER) {
    if (rung.when({ facts, repoMix })) return rung.name;
  }
  return DEFAULT_FORM;
}

/**
 * Whether today is a day this account's form is allowed to change (D-042, C.6).
 *
 * Form is chosen from ratios that move in both directions, and a restyle re-poses
 * every element - so it may not happen on an ordinary Tuesday. Two beats, and
 * both are monotone and stateless:
 *
 *   - **A maturity level-up.** Levels only ever rise and they are rare, so a
 *     restyle arrives alongside visible growth and reads as earned.
 *   - **The account anniversary**, for accounts pinned at `MAX_MATURITY`. Without
 *     this the accounts with the most history are the only ones frozen forever,
 *     which is backwards. It is already a beat in this engine - trunk girth
 *     quantizes on it, the crane visits.
 *
 * The caller supplies the maturity it last rendered; `null` means "never seen
 * before", which is a first render and therefore free to pick any style.
 * `createdAt` comes in as an argument because it is not on `TreeFacts` - the
 * facts layer keeps `accountYears` and drops the date.
 */
export function mayRestyle(
  facts: TreeFacts,
  createdAt: string,
  lastMaturity: number | null,
): boolean {
  if (lastMaturity === null) return true;
  if (facts.maturity > lastMaturity) return true;
  // Month and day, ignoring the year: the anniversary, which is already a beat
  // in this engine (girth quantizes on it, the crane visits).
  return facts.maturity >= MAX_MATURITY && facts.date.slice(5) === createdAt.slice(5);
}
