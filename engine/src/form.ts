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
import { DORMANCY_SPELL_DAYS, MAX_MATURITY } from "./facts.js";
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
  /** Clump - trunks from one root mass. Genuine polyglot. */
  "kabudachi",
  /** Twin trunk. Two worlds. */
  "sokan",
  /** Literati - tall, thin, foliage at the apex. Wrote one thing everyone uses. */
  "bunjin",
  /** Root over rock. One long-lived project, and the stone is that project. */
  "sekijoju",
  /** Deadwood - a bleached vein beside a live one. Survived something. */
  "sharimiki",
  /** Exposed root. Long history, quiet now. */
  "neagari",
  /** Windswept. Pulled away by life. */
  "fukinagashi",
  /** Broom - a fan splitting off one trunk. Even, wide contributor. */
  "hokidachi",
  /** Formal upright. The metronome. */
  "chokkan",
  /** Slant. One big codebase. */
  "shakan",
  /** Informal upright - today's tree, and the fallback. */
  "moyogi",
] as const;

export type FormName = (typeof FORM_NAMES)[number];

/** The style every account gets when nothing more specific is true. */
export const DEFAULT_FORM: FormName = "moyogi";

/**
 * Below this maturity nobody gets a style claim.
 *
 * A level-3 account has a handful of weeks of history; calling it a metronome or
 * a polyglot on that evidence is a guess dressed as a measurement. Seedlings get
 * the moss ball, which says "just planted" and is honest.
 */
export const FORM_MIN_MATURITY = 5;

/**
 * Every number the ladder compares against, in one place.
 *
 * **These are guesses.** PROPOSAL-VARIETALS §3 labels them as such and §7.6 makes
 * calibration a gate on shipping them. `service/scripts/calibrate.ts` is what
 * turns them into measured values; until it has run against a corpus and passed,
 * treat any distribution this produces as unknown.
 */
export const FORM_THRESHOLDS = {
  /** ikadabuki: mostly other people's repositories, and many of them. */
  raftOwnShare: 0.25,
  raftBreadth: 8,
  /** yoseUe: many owners, many repos, no centre of gravity. */
  forestOrgs: 4,
  forestHhi: 0.12,
  forestBreadth: 20,
  /** kabudachi: three languages carrying real share, spread across repos. */
  clumpLangs: 3,
  clumpHhi: 0.25,
  /** sokan: two languages each holding better than a quarter. */
  twinLangShare: 0.28,
  /** bunjin: reach far out of proportion to output. */
  literatiStarsPerCommit: 0.4,
  literatiMaxCommits: 2000,
  literatiMinYears: 3,
  /** sekijoju: one old repo of the account's own, still central. */
  stoneRepoYears: 5,
  stoneRepoShare: 0.3,
  /**
   * sharimiki: a dormancy this long, that closed this long ago. Healed, not a
   * wound - a scar drawn on somebody currently absent would be a different claim.
   */
  deadwoodSpellDays: DORMANCY_SPELL_DAYS,
  deadwoodHealedDays: 180,
  /** neagari: a long history that has gone quiet. */
  exposedRootYears: 8,
  exposedRootDecline: 0.15,
  /** fukinagashi: pulled away, but still here. */
  windsweptDecline: 0.4,
  /** hokidachi: even across repos and even across weeks. */
  broomHhi: 0.15,
  broomCadenceCV: 0.9,
  /** chokkan: the metronome - steady, unbroken, and concentrated. */
  uprightCadenceCV: 0.55,
  uprightStreak: 180,
  uprightHhi: 0.4,
  /** shakan: one big codebase, part of it somebody else's. */
  slantOwnShareMin: 0.25,
  slantOwnShareMax: 0.6,
  slantHhi: 0.35,
} as const;

/** What a rung gets to look at. Everything here is already derived. */
export interface FormInput {
  facts: TreeFacts;
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
function langShares(facts: TreeFacts): number[] {
  return facts.languages.map((lang) => lang.share).sort((a, b) => b - a);
}

/** Days since the most recent dormancy closed, or null if none ever has. */
function healedFor(facts: TreeFacts): number | null {
  const spells = facts.signals.dormancyHistory;
  const last = spells[spells.length - 1];
  if (last === undefined) return null;
  return daysBetween(last.endedAt, facts.date);
}

/**
 * The ladder, in priority order. First match wins.
 *
 * Ordering rule: **a narrower rung sits above every rung that subsumes it.** The
 * multi-trunk styles come first because they are the strongest structural claims
 * and the most specific triggers; the cadence styles come last because almost
 * every account has a cadence and only some have a distinctive one.
 *
 * `neagari` above `fukinagashi` is the one place the proposal's table had this
 * backwards (D-043). Windswept asks for `declineRatio < 0.4`, exposed-root for
 * `< 0.15` plus eight years - so tabled in the other order, no account could ever
 * be an exposed root, and calibration would have reported the style at 0% without
 * saying why. The reachability test in `form.test.ts` is what keeps that from
 * happening again to a rung added later.
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
    name: "kabudachi",
    reads: "a genuine polyglot",
    when: ({ facts, repoMix }) =>
      facts.signals.langCount15 >= FORM_THRESHOLDS.clumpLangs &&
      repoMix.hhi < FORM_THRESHOLDS.clumpHhi,
  },
  {
    name: "sokan",
    reads: "two worlds at once",
    when: ({ facts }) => {
      const shares = langShares(facts);
      return (
        (shares[0] ?? 0) >= FORM_THRESHOLDS.twinLangShare &&
        (shares[1] ?? 0) >= FORM_THRESHOLDS.twinLangShare
      );
    },
  },
  {
    name: "bunjin",
    reads: "wrote one thing a lot of people use",
    when: ({ facts }) =>
      facts.totals.commits > 0 &&
      facts.totals.commits < FORM_THRESHOLDS.literatiMaxCommits &&
      facts.accountYears >= FORM_THRESHOLDS.literatiMinYears &&
      facts.totals.starsReceived / facts.totals.commits >=
        FORM_THRESHOLDS.literatiStarsPerCommit,
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
    name: "hokidachi",
    reads: "even and wide",
    when: ({ facts, repoMix }) =>
      repoMix.hhi < FORM_THRESHOLDS.broomHhi &&
      facts.signals.cadenceCV < FORM_THRESHOLDS.broomCadenceCV,
  },
  {
    name: "chokkan",
    reads: "a metronome",
    when: ({ facts, repoMix }) =>
      facts.signals.cadenceCV < FORM_THRESHOLDS.uprightCadenceCV &&
      facts.streak.longest >= FORM_THRESHOLDS.uprightStreak &&
      repoMix.hhi > FORM_THRESHOLDS.uprightHhi,
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
 * Pure, and total: every input lands on some rung or on `moyogi`. The maturity
 * floor and the empty-history case come first, because a style is a claim and
 * there is nothing to claim about either.
 */
export function selectForm({ facts, repoMix }: FormInput): FormName {
  if (facts.maturity < FORM_MIN_MATURITY) return "kokedama";
  if (facts.signals.activeWeeks === 0) return "kokedama";

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
