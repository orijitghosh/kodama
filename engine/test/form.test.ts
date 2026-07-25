/**
 * Form selection (C.5, D-042/D-043).
 *
 * The thresholds this exercises are placeholders and calibration will move them,
 * so these tests are deliberately written to survive that: they assert the
 * *structure* of the ladder - reachability, priority, totality, the maturity
 * floor, the restyle beat - and they read every number they compare against out
 * of `FORM_THRESHOLDS` rather than restating it. A recalibration that changes a
 * threshold should not turn this file red.
 *
 * The load-bearing test is "every rung is reachable". A rung sitting below a
 * broader one is a style no account can ever have, and a calibration histogram
 * reports that as a flat 0% without saying why - which is exactly how the
 * proposal's tabled order hid an unreachable `neagari` (D-043).
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORM,
  FORM_LADDER,
  FORM_MIN_MATURITY,
  FORM_NAMES,
  FORM_THRESHOLDS,
  mayRestyle,
  selectForm,
} from "../src/form.js";
import type { FormName } from "../src/form.js";
import { MAX_MATURITY, treeFacts } from "../src/facts.js";
import { addDays, isoWeekOf, isoWeekStart } from "../src/date.js";
import type { NormalizedHistory, RepoMix, TreeFacts, WeekCell } from "../src/types.js";
import { FIXTURE_ANCHOR_DATE, loadFixture } from "./helpers/fixtures.js";
import { historyWith, weeksEndingAt } from "./helpers/history.js";

const TODAY = FIXTURE_ANCHOR_DATE;
const LAST_COMPLETE_WEEK = isoWeekOf(addDays(isoWeekStart(isoWeekOf(TODAY)), -7));

/**
 * Enough flat weeks to clear the maturity floor comfortably, with a cadence of
 * exactly zero variation - so any cadence-driven rung that fires in a test below
 * fired because the test asked for it.
 */
const STEADY_WEEKS = weeksEndingAt(LAST_COMPLETE_WEEK, 200, 20);

/** Weeks that end `gapWeeks` before the last complete week, then resume. */
function weeksWithGap(gapWeeks: number, sinceWeeks: number): WeekCell[] {
  const before = weeksEndingAt(
    isoWeekOf(addDays(isoWeekStart(LAST_COMPLETE_WEEK), -7 * (sinceWeeks + gapWeeks))),
    180,
    20,
  );
  return [...before, ...weeksEndingAt(LAST_COMPLETE_WEEK, sinceWeeks, 20)];
}

/**
 * A long busy stretch that fades to `tail` commits a week for the last 60 weeks,
 * with no gap anywhere - a decline, not an absence. The distinction is the whole
 * difference between the windswept rungs and `sharimiki`, and writing this as two
 * separate runs of weeks with a hole between them is how the first draft of these
 * cases accidentally tested deadwood three times.
 */
function fadingWeeks(tail: number): WeekCell[] {
  return [
    ...weeksEndingAt(isoWeekOf(addDays(isoWeekStart(LAST_COMPLETE_WEEK), -7 * 60)), 200, 40),
    ...weeksEndingAt(LAST_COMPLETE_WEEK, 60, tail),
  ];
}

/** Alternating quiet and heavy weeks: a high `cadenceCV` by construction. */
function burstyWeeks(count: number): WeekCell[] {
  return weeksEndingAt(LAST_COMPLETE_WEEK, count, 20).map((week, i) => ({
    ...week,
    c: i % 2 === 0 ? 1 : 80,
  }));
}

const NOTHING: RepoMix = { hhi: 0, ownShare: 0, breadth: 0, orgs: 0, anchor: null };

/** A mix that no rung reads as anything: concentrated, owned, unremarkable. */
const PLAIN: RepoMix = { hhi: 0.3, ownShare: 0.95, breadth: 4, orgs: 0, anchor: null };

function facts(history: NormalizedHistory, date = TODAY): TreeFacts {
  return treeFacts(history, date);
}

function formOf(history: NormalizedHistory, repoMix: RepoMix, date = TODAY): FormName {
  return selectForm({ facts: facts(history, date), repoMix });
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

describe("the catalogue", () => {
  it("names every rung exactly once, plus the seedling and the fallback", () => {
    expect(new Set(FORM_NAMES).size).toBe(FORM_NAMES.length);
    const laddered = FORM_LADDER.map((rung) => rung.name);
    expect(new Set(laddered).size).toBe(laddered.length);
    expect(FORM_NAMES).toEqual(["kokedama", ...laddered, DEFAULT_FORM]);
  });

  it("gives every rung a sentence a reader could recognise themselves in", () => {
    // C.7 turns these into receipts, and a receipt is the project's evidence that
    // an element means something. An empty one is a shape with no claim.
    for (const rung of FORM_LADDER) {
      expect(rung.reads.length, rung.name).toBeGreaterThan(8);
    }
  });
});

// ---------------------------------------------------------------------------
// Reachability - the test that matters
// ---------------------------------------------------------------------------

/**
 * One crafted account per rung: the shortest history that should land on it.
 *
 * Asserting the *whole* selection rather than the rung's predicate is the point.
 * A case that satisfies its own rung but is intercepted by an earlier one fails
 * here, which makes this simultaneously a reachability test and a priority-order
 * test.
 */
const CASES: Array<[FormName, NormalizedHistory, RepoMix]> = [
  [
    "ikadabuki",
    historyWith({ weeks: STEADY_WEEKS, createdAt: "2018-01-08" }),
    { hhi: 0.2, ownShare: 0.1, breadth: 12, orgs: 3, anchor: null },
  ],
  [
    "yoseUe",
    historyWith({ weeks: STEADY_WEEKS, createdAt: "2018-01-08" }),
    { hhi: 0.05, ownShare: 0.5, breadth: 30, orgs: 6, anchor: null },
  ],
  [
    "kabudachi",
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
  ],
  [
    "sokan",
    historyWith({
      weeks: STEADY_WEEKS,
      createdAt: "2018-01-08",
      languages: [
        { name: "Go", share: 0.5 },
        { name: "Rust", share: 0.4 },
      ],
    }),
    PLAIN,
  ],
  [
    "bunjin",
    historyWith({
      weeks: weeksEndingAt(LAST_COMPLETE_WEEK, 300, 6),
      createdAt: "2018-01-08",
      totals: { commits: 1200, starsReceived: 900 },
    }),
    PLAIN,
  ],
  [
    "sekijoju",
    historyWith({ weeks: STEADY_WEEKS, createdAt: "2015-01-05" }),
    {
      hhi: 0.3,
      ownShare: 0.9,
      breadth: 5,
      orgs: 0,
      anchor: { nameWithOwner: "hana/kodama", years: 7, share: 0.44 },
    },
  ],
  [
    "sharimiki",
    // Gone for 40 weeks, back for 40: a spell of ~273 days that closed ~273 ago.
    historyWith({ weeks: weeksWithGap(40, 40), createdAt: "2015-01-05" }),
    PLAIN,
  ],
  [
    "neagari",
    // Twelve years old, still ticking over at a fraction of its best year.
    historyWith({ weeks: fadingWeeks(1), createdAt: "2014-01-06" }),
    PLAIN,
  ],
  [
    "fukinagashi",
    // The same shape at five years old: a decline, not a monument.
    historyWith({ weeks: fadingWeeks(6), createdAt: "2021-01-04" }),
    PLAIN,
  ],
  [
    "hokidachi",
    historyWith({ weeks: STEADY_WEEKS, createdAt: "2018-01-08" }),
    { hhi: 0.1, ownShare: 0.7, breadth: 7, orgs: 1, anchor: null },
  ],
  [
    "chokkan",
    historyWith({
      weeks: STEADY_WEEKS,
      createdAt: "2018-01-08",
      streak: { current: 200, longest: 400, lastActiveDate: TODAY },
    }),
    { hhi: 0.6, ownShare: 0.9, breadth: 3, orgs: 0, anchor: null },
  ],
  [
    "shakan",
    historyWith({ weeks: burstyWeeks(300), createdAt: "2018-01-08" }),
    { hhi: 0.5, ownShare: 0.45, breadth: 4, orgs: 1, anchor: null },
  ],
];

describe("every rung is reachable", () => {
  it("covers the whole ladder with a case each", () => {
    expect(CASES.map(([name]) => name)).toEqual(FORM_LADDER.map((rung) => rung.name));
  });

  for (const [expected, history, repoMix] of CASES) {
    it(`selects ${expected}`, () => {
      expect(formOf(history, repoMix)).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// Totality and the floor
// ---------------------------------------------------------------------------

describe("the maturity floor", () => {
  it("gives a seedling the moss ball, whatever else is true of it", () => {
    // A level-4 account triggering the forest rule is the case this guards: the
    // signals are real, the sample behind them is not.
    const young = historyWith({
      weeks: weeksEndingAt(LAST_COMPLETE_WEEK, 20, 8),
      createdAt: "2018-01-08",
    });
    expect(facts(young).maturity).toBeLessThan(FORM_MIN_MATURITY);
    expect(
      formOf(young, { hhi: 0.05, ownShare: 0.5, breadth: 30, orgs: 6, anchor: null }),
    ).toBe("kokedama");
  });

  it("gives a ghost the moss ball rather than a claim about nothing", () => {
    expect(formOf(historyWith({ weeks: [] }), NOTHING)).toBe("kokedama");
  });
});

describe("the fallback", () => {
  it("is moyogi when nothing more specific is true", () => {
    expect(formOf(historyWith({ weeks: burstyWeeks(300), createdAt: "2018-01-08" }), PLAIN)).toBe(
      DEFAULT_FORM,
    );
  });

  it("is total: every fixture lands on some named form", () => {
    for (const name of ["ghost", "newcomer", "grinder", "maintainer", "whale", "veteran"]) {
      const history = loadFixture(name);
      const form = selectForm({ facts: facts(history), repoMix: history.repoMix });
      expect(FORM_NAMES, name).toContain(form);
    }
  });
});

describe("selection is pure", () => {
  it("returns the same form for the same input, every time", () => {
    for (const [, history, repoMix] of CASES) {
      const first = formOf(history, repoMix);
      for (let i = 0; i < 5; i += 1) expect(formOf(history, repoMix)).toBe(first);
    }
  });

  it("reads nothing but facts and the repo mix", () => {
    // Same history, same date, different login: form is about the work, not the
    // seed. (The seed still varies the drawing within a form - that is C.4.)
    const history = historyWith({ weeks: STEADY_WEEKS, createdAt: "2018-01-08" });
    expect(formOf(history, PLAIN)).toBe(formOf({ ...history, login: "someone-else" }, PLAIN));
  });
});

// ---------------------------------------------------------------------------
// The three archetypes the PRD names (§7.6 acceptance)
// ---------------------------------------------------------------------------

function fixtureForm(name: string): FormName {
  const history = loadFixture(name);
  return selectForm({ facts: facts(history), repoMix: history.repoMix });
}

describe("the archetypes read differently", () => {
  it("gives the four fixtures above the floor four different silhouettes", () => {
    // Half of §7.6's acceptance bar, and the half that needs no corpus. The other
    // half - the histogram - is `pnpm --filter @kodama/api calibrate`, which
    // fetches real accounts and is deliberately not a test (D-043).
    const forms = ["maintainer", "veteran", "whale", "newcomer"].map(fixtureForm);
    expect(new Set(forms).size, forms.join(" / ")).toBe(4);
  });

  it("records that the grinder falls under the floor, which §7.6 does not accept yet", () => {
    // A finding, pinned rather than papered over. §7.6 asks that maintainer,
    // grinder and newcomer land on *visibly different* styles, and today grinder
    // and newcomer are the same moss ball: the grinder fixture is two years old
    // with ~2 000 commits, which is maturity 4, one level under FORM_MIN_MATURITY.
    //
    // So the floor as tabled conflates "not enough evidence" with "not enough
    // volume per level". The grinder has ~100 active weeks of the steadiest cadence
    // in the fixture set - there is plenty to read, it is simply not level 5 yet.
    // Which way that resolves (drop the floor to 4, or make it evidence-based on
    // `activeWeeks`) is a calibration decision and belongs to the run, not to a
    // guess made here. `calibrate.ts` reports this criterion explicitly.
    expect(facts(loadFixture("grinder")).maturity).toBeLessThan(FORM_MIN_MATURITY);
    expect(fixtureForm("grinder")).toBe("kokedama");
    expect(fixtureForm("newcomer")).toBe("kokedama");
    expect(fixtureForm("maintainer")).not.toBe("kokedama");
  });
});

// ---------------------------------------------------------------------------
// The restyle beat (C.6 rule 2)
// ---------------------------------------------------------------------------

describe("when a form is allowed to change", () => {
  const history = historyWith({ weeks: STEADY_WEEKS, createdAt: "2018-01-08" });

  it("lets a first render pick anything", () => {
    expect(mayRestyle(facts(history), "2018-01-08", null)).toBe(true);
  });

  it("restyles on a level-up and on no other ordinary day", () => {
    const f = facts(history);
    expect(mayRestyle(f, "2018-01-08", f.maturity - 1)).toBe(true);
    expect(mayRestyle(f, "2018-01-08", f.maturity)).toBe(false);
  });

  it("restyles a capped account on its anniversary instead", () => {
    // The hole rule 2 leaves: a whale is pinned at 13 forever, so a level-up beat
    // alone would freeze the accounts with the most history to tell (D-042).
    const whale = loadFixture("whale");
    const f = facts(whale);
    expect(f.maturity).toBe(MAX_MATURITY);

    const anniversary = `${TODAY.slice(0, 4)}${whale.createdAt.slice(4)}`;
    expect(mayRestyle(facts(whale, anniversary), whale.createdAt, MAX_MATURITY)).toBe(true);
    expect(mayRestyle(f, whale.createdAt, MAX_MATURITY)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

describe("the thresholds", () => {
  it("are all finite and non-negative, and the slant band is a band", () => {
    for (const [name, value] of Object.entries(FORM_THRESHOLDS)) {
      expect(Number.isFinite(value), name).toBe(true);
      expect(value, name).toBeGreaterThanOrEqual(0);
    }
    expect(FORM_THRESHOLDS.slantOwnShareMin).toBeLessThan(FORM_THRESHOLDS.slantOwnShareMax);
  });

  it("keeps exposed-root strictly narrower than windswept", () => {
    // Why neagari sits above fukinagashi. If this inequality ever flips, the
    // ordering argument in D-043 stops holding and one of them goes dark.
    expect(FORM_THRESHOLDS.exposedRootDecline).toBeLessThan(FORM_THRESHOLDS.windsweptDecline);
  });
});
