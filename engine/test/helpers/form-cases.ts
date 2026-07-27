/**
 * One crafted account per form: the shortest history that lands on it.
 *
 * These were written inside `form.test.ts` as a reachability suite, and they moved
 * here the moment Taste Gate #4 needed something to draw. Only four of the fourteen
 * forms are reachable from the ten real fixtures, so a gate sheet built from those
 * would have judged four styles and guessed at ten.
 *
 * Two rules keep this honest, and both are asserted by the callers rather than
 * promised here:
 *
 *   - **Nothing forces the form.** Every case carries its `repoMix` on the history,
 *     so it goes through `selectForm` exactly as a real account does. A case that
 *     stops selecting its form after a recalibration is a failure, not a caption to
 *     update - it means the rung moved out from under its example.
 *   - **Selection is asserted through the whole ladder**, never against the rung's
 *     own predicate. A case that satisfies its rung but is intercepted by a higher
 *     one is the bug D-043 was, and asserting the predicate alone would hide it.
 *
 * The thresholds these are placed against are measured and will move again
 * (`FORM_THRESHOLDS`), so nothing here restates a number - the cases are written a
 * comfortable distance inside their rung rather than on its edge.
 */

import { addDays, isoWeekOf, isoWeekStart } from "../../src/date.js";
import { FORM_NAMES } from "../../src/form.js";
import type { FormName } from "../../src/form.js";
import type { NormalizedHistory, RepoMix, WeekCell } from "../../src/types.js";
import { FIXTURE_ANCHOR_DATE } from "./fixtures.js";
import { historyWith, weeksEndingAt } from "./history.js";

/** The date these accounts are read at - the same one every fixture is authored against. */
export const FORM_CASE_DATE = FIXTURE_ANCHOR_DATE;

export const LAST_COMPLETE_WEEK = isoWeekOf(
  addDays(isoWeekStart(isoWeekOf(FORM_CASE_DATE)), -7),
);

/**
 * Enough flat weeks to clear the evidence floor comfortably, with a cadence of
 * exactly zero variation - so any cadence-driven rung that fires below fired
 * because the case asked for it.
 */
export const STEADY_WEEKS = weeksEndingAt(LAST_COMPLETE_WEEK, 200, 20);

/** Weeks that end `gapWeeks` before the last complete week, then resume. */
export function weeksWithGap(gapWeeks: number, sinceWeeks: number): WeekCell[] {
  const before = weeksEndingAt(
    isoWeekOf(addDays(isoWeekStart(LAST_COMPLETE_WEEK), -7 * (sinceWeeks + gapWeeks))),
    180,
    20,
  );
  return [...before, ...weeksEndingAt(LAST_COMPLETE_WEEK, sinceWeeks, 20)];
}

/**
 * A long busy stretch that fades to `tail` commits a week for the last 60 weeks,
 * with no gap anywhere - a decline, not an absence. That distinction is the whole
 * difference between the windswept rungs and `sharimiki`, and writing it as two
 * runs of weeks with a hole between them is how the first draft of these cases
 * accidentally tested deadwood three times.
 */
export function fadingWeeks(tail: number): WeekCell[] {
  return [
    ...weeksEndingAt(isoWeekOf(addDays(isoWeekStart(LAST_COMPLETE_WEEK), -7 * 60)), 200, 40),
    ...weeksEndingAt(LAST_COMPLETE_WEEK, 60, tail),
  ];
}

/** Alternating quiet and heavy weeks: a high `cadenceCV` by construction. */
export function burstyWeeks(count: number): WeekCell[] {
  return weeksEndingAt(LAST_COMPLETE_WEEK, count, 20).map((week, i) => ({
    ...week,
    c: i % 2 === 0 ? 1 : 80,
  }));
}

/** A mix that no rung reads as anything: concentrated, owned, unremarkable. */
export const PLAIN: RepoMix = { hhi: 0.3, ownShare: 0.95, breadth: 4, orgs: 0, anchor: null };

/** One account, and the sentence a reader should recognise in the picture. */
export interface FormCase {
  form: FormName;
  /** Who this is, in the words the sheet shows under the drawing. */
  reads: string;
  history: NormalizedHistory;
}

function caseFor(
  form: FormName,
  reads: string,
  history: NormalizedHistory,
  repoMix: RepoMix = PLAIN,
): FormCase {
  return { form, reads, history: { ...history, repoMix } };
}

/**
 * Every form, in `FORM_NAMES` order - which is the seedling, the ladder in
 * priority order, then the fallback.
 */
export const FORM_CASES: readonly FormCase[] = [
  caseFor(
    "kokedama",
    "too new to claim anything",
    // Under the evidence floor: eight months of weeks, and the floor asks a year.
    historyWith({ weeks: weeksEndingAt(LAST_COMPLETE_WEEK, 34, 9), createdAt: "2025-11-03" }),
    { hhi: 0.4, ownShare: 1, breadth: 2, orgs: 0, anchor: null },
  ),
  caseFor(
    "ikadabuki",
    "builds on other people's work",
    historyWith({ weeks: STEADY_WEEKS, createdAt: "2018-01-08" }),
    { hhi: 0.2, ownShare: 0.1, breadth: 14, orgs: 3, anchor: null },
  ),
  caseFor(
    "yoseUe",
    "spread across many communities",
    historyWith({ weeks: STEADY_WEEKS, createdAt: "2018-01-08" }),
    { hhi: 0.05, ownShare: 0.5, breadth: 70, orgs: 9, anchor: null },
  ),
  caseFor(
    "bunjin",
    "wrote one thing a lot of people use",
    historyWith({
      weeks: weeksEndingAt(LAST_COMPLETE_WEEK, 300, 6),
      createdAt: "2018-01-08",
      totals: { commits: 1200, starsReceived: 40000 },
    }),
  ),
  caseFor(
    "sekijoju",
    "one long-lived project",
    historyWith({ weeks: STEADY_WEEKS, createdAt: "2015-01-05" }),
    {
      hhi: 0.3,
      ownShare: 0.9,
      breadth: 5,
      orgs: 0,
      anchor: { nameWithOwner: "hana/kodama", years: 7, share: 0.44 },
    },
  ),
  caseFor(
    "kabudachi",
    "a genuine polyglot",
    historyWith({
      weeks: STEADY_WEEKS,
      createdAt: "2018-01-08",
      languages: [
        { name: "Go", share: 0.34 },
        { name: "Rust", share: 0.3 },
        { name: "TypeScript", share: 0.2 },
      ],
    }),
    { hhi: 0.2, ownShare: 0.8, breadth: 6, orgs: 1, anchor: null },
  ),
  caseFor(
    "sokan",
    "two worlds at once",
    historyWith({
      weeks: STEADY_WEEKS,
      createdAt: "2018-01-08",
      languages: [
        { name: "Go", share: 0.5 },
        { name: "Rust", share: 0.4 },
      ],
    }),
  ),
  caseFor(
    "chokkan",
    "a metronome",
    historyWith({
      weeks: STEADY_WEEKS,
      createdAt: "2018-01-08",
      streak: { current: 200, longest: 400, lastActiveDate: FORM_CASE_DATE },
    }),
  ),
  caseFor(
    "hokidachi",
    "even and wide",
    historyWith({ weeks: STEADY_WEEKS, createdAt: "2018-01-08" }),
    { hhi: 0.04, ownShare: 0.7, breadth: 25, orgs: 2, anchor: null },
  ),
  caseFor(
    "neagari",
    "a long history, quiet lately",
    // Twelve years old, still ticking over at a fraction of its best year.
    historyWith({ weeks: fadingWeeks(1), createdAt: "2014-01-06" }),
  ),
  caseFor(
    "fukinagashi",
    "pulled away, but still here",
    // The same shape at five years old: a decline, not a monument.
    historyWith({ weeks: fadingWeeks(6), createdAt: "2021-01-04" }),
  ),
  caseFor(
    "sharimiki",
    "came back from a long absence",
    // Gone for 60 weeks, back for 60: a spell of ~413 days that closed ~420 ago.
    historyWith({ weeks: weeksWithGap(60, 60), createdAt: "2015-01-05" }),
  ),
  caseFor(
    "shakan",
    "one big codebase",
    historyWith({ weeks: burstyWeeks(300), createdAt: "2018-01-08" }),
    { hhi: 0.5, ownShare: 0.45, breadth: 4, orgs: 1, anchor: null },
  ),
  caseFor(
    "moyogi",
    "nothing the ladder has a name for",
    // Steady, owned, concentrated, and old enough to be past every rung that
    // reads a decline - the account the fallback exists for.
    historyWith({ weeks: STEADY_WEEKS, createdAt: "2018-01-08" }),
  ),
];

/** Guards the list against a form being added to the catalogue and forgotten here. */
export function formCasesCoverEveryForm(): boolean {
  return FORM_CASES.map((one) => one.form).join(",") === FORM_NAMES.join(",");
}
