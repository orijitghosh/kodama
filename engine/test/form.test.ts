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
  FORM_MIN_ACTIVE_WEEKS,
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
    { hhi: 0.2, ownShare: 0.1, breadth: 14, orgs: 3, anchor: null },
  ],
  [
    "yoseUe",
    historyWith({ weeks: STEADY_WEEKS, createdAt: "2018-01-08" }),
    { hhi: 0.05, ownShare: 0.5, breadth: 70, orgs: 9, anchor: null },
  ],
  [
    "bunjin",
    historyWith({
      weeks: weeksEndingAt(LAST_COMPLETE_WEEK, 300, 6),
      createdAt: "2018-01-08",
      totals: { commits: 1200, starsReceived: 40000 },
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
    "chokkan",
    historyWith({
      weeks: STEADY_WEEKS,
      createdAt: "2018-01-08",
      streak: { current: 200, longest: 400, lastActiveDate: TODAY },
    }),
    PLAIN,
  ],
  [
    "hokidachi",
    historyWith({ weeks: STEADY_WEEKS, createdAt: "2018-01-08" }),
    { hhi: 0.04, ownShare: 0.7, breadth: 25, orgs: 2, anchor: null },
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
    "sharimiki",
    // Gone for 60 weeks, back for 60: a spell of ~413 days that closed ~420 ago,
    // which is what the rung asks for now that six months either side turned out
    // to describe most of a decade-old account (D-044).
    historyWith({ weeks: weeksWithGap(60, 60), createdAt: "2015-01-05" }),
    PLAIN,
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

describe("the evidence floor", () => {
  it("gives a seedling the moss ball, whatever else is true of it", () => {
    // Twenty weeks of history triggering the forest rule is the case this guards:
    // the signals are real, the sample behind them is not.
    const young = historyWith({
      weeks: weeksEndingAt(LAST_COMPLETE_WEEK, 20, 8),
      createdAt: "2018-01-08",
    });
    expect(facts(young).signals.activeWeeks).toBeLessThan(FORM_MIN_ACTIVE_WEEKS);
    expect(
      formOf(young, { hhi: 0.05, ownShare: 0.5, breadth: 70, orgs: 9, anchor: null }),
    ).toBe("kokedama");
  });

  it("measures evidence in active weeks, not in levels", () => {
    // The correction D-044 records. A year of weekly activity is enough to read
    // somebody, and it is nowhere near maturity 5 - which needs roughly four years
    // of steady commits, because maturity is a volume ladder. Measured against the
    // corpus, the level floor was silencing 58% of real accounts.
    const year = historyWith({
      weeks: weeksEndingAt(LAST_COMPLETE_WEEK, FORM_MIN_ACTIVE_WEEKS, 4),
      createdAt: "2019-01-07",
      streak: { current: 30, longest: 90, lastActiveDate: TODAY },
    });
    expect(facts(year).maturity).toBeLessThan(5);
    expect(formOf(year, PLAIN)).not.toBe("kokedama");
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
  it("gives maintainer, grinder and newcomer three different silhouettes", () => {
    // §7.6's third acceptance criterion, and the half of the bar that needs no
    // corpus. It failed until the floor moved off maturity and onto active weeks
    // (D-044): the grinder is two years old at maturity 4, and was getting the
    // same moss ball as an account three weeks old. The other half of the bar -
    // the histogram - is `pnpm --filter @kodama/api calibrate`, which fetches real
    // accounts and is deliberately not a test (D-043).
    const forms = ["maintainer", "grinder", "newcomer"].map(fixtureForm);
    expect(new Set(forms).size, forms.join(" / ")).toBe(3);
  });

  it("reads the grinder as a working account, not a seedling", () => {
    // The specific account the old floor got wrong, pinned so it stays fixed.
    const grinder = facts(loadFixture("grinder"));
    expect(grinder.maturity).toBeLessThan(5);
    expect(grinder.signals.activeWeeks).toBeGreaterThanOrEqual(FORM_MIN_ACTIVE_WEEKS);
    expect(fixtureForm("grinder")).not.toBe("kokedama");
    // And the genuinely new account still gets the moss ball, which is the whole
    // point of having a floor at all.
    expect(fixtureForm("newcomer")).toBe("kokedama");
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
