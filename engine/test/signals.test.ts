import { describe, expect, it } from "vitest";
import {
  activeWeeks,
  burstiness,
  cadenceCV,
  declineRatio,
  derivedSignalsFor,
  dormancyHistory,
  DORMANCY_SPELL_DAYS,
  langCount15,
  LANG_SHARE_FLOOR,
  treeFacts,
} from "../src/facts.js";
import { addDays, daysBetween, isoWeekOf, isoWeekStart } from "../src/date.js";
import type { WeekCell } from "../src/types.js";
import { allFixtures, FIXTURE_ANCHOR_DATE } from "./helpers/fixtures.js";
import { historyWith, weeksEndingAt } from "./helpers/history.js";

const TODAY = FIXTURE_ANCHOR_DATE;

/** The Monday of the last *complete* week - the newest week these signals read. */
const LAST_COMPLETE_WEEK = isoWeekOf(addDays(isoWeekStart(isoWeekOf(TODAY)), -7));

/** Weeks of `commits` each, `back` weeks before the last complete week. */
function weeksBefore(back: number, count: number, commits: number): WeekCell[] {
  const anchor = isoWeekOf(addDays(isoWeekStart(LAST_COMPLETE_WEEK), -7 * back));
  return weeksEndingAt(anchor, count, commits);
}

/** One week of activity, `weeksAgo` whole weeks before the last complete week. */
function weekAt(weeksAgo: number, commits: number): WeekCell {
  return {
    w: isoWeekOf(addDays(isoWeekStart(LAST_COMPLETE_WEEK), -7 * weeksAgo)),
    c: commits,
  };
}

describe("activeWeeks", () => {
  it("counts stored weeks, which are exactly the weeks with activity", () => {
    expect(activeWeeks(historyWith({ weeks: [] }))).toBe(0);
    expect(activeWeeks(historyWith({ weeks: weeksBefore(0, 30, 4) }))).toBe(30);
  });
});

describe("cadenceCV", () => {
  const cases: Array<[string, number[], number]> = [
    ["no history at all", [], 0],
    ["a single week, which has no spread to measure", [7], 0],
    ["a perfectly flat run", [5, 5, 5, 5], 0],
    ["a two-week split", [1, 3], 0.5],
    // Ten times the volume, same shape: the metric asks about rhythm, not size.
    ["the same shape ten times larger", [10, 30], 0.5],
    ["one spike among quiet weeks", [1, 1, 1, 9], (Math.sqrt(12) / 3) * 1],
  ];

  for (const [name, counts, expected] of cases) {
    it(`scores ${name}`, () => {
      const weeks = counts.map((c, i) => weekAt(counts.length - 1 - i, c));
      expect(cadenceCV(historyWith({ weeks }))).toBeCloseTo(expected, 10);
    });
  }

  it("is unmoved by where in the calendar the weeks sit", () => {
    const shape = [2, 8, 3, 9];
    const recent = shape.map((c, i) => weekAt(shape.length - 1 - i, c));
    const ancient = shape.map((c, i) => weekAt(400 + shape.length - 1 - i, c));
    expect(cadenceCV(historyWith({ weeks: recent }))).toBeCloseTo(
      cadenceCV(historyWith({ weeks: ancient })),
      10,
    );
  });
});

describe("burstiness", () => {
  const cases: Array<[string, number[], number]> = [
    ["no history at all", [], 0],
    ["a single week, which is its own mean", [7], 1],
    ["a flat run", [5, 5, 5, 5], 1],
    ["one week carrying everything", [1, 1, 1, 9], 9 / 3],
    ["a doubled week", [4, 8], 8 / 6],
  ];

  for (const [name, counts, expected] of cases) {
    it(`scores ${name}`, () => {
      const weeks = counts.map((c, i) => weekAt(counts.length - 1 - i, c));
      expect(burstiness(historyWith({ weeks }))).toBeCloseTo(expected, 10);
    });
  }

  it("cannot exceed the number of active weeks", () => {
    const weeks = [weekAt(3, 1), weekAt(2, 1), weekAt(1, 1), weekAt(0, 900)];
    expect(burstiness(historyWith({ weeks }))).toBeLessThanOrEqual(weeks.length);
  });
});

describe("declineRatio", () => {
  it("reads an empty history as no decline rather than as total collapse", () => {
    // A ghost never fell off; it never started. The ladder must not dress that
    // up as a windswept life.
    expect(declineRatio(historyWith({ weeks: [] }), TODAY)).toBe(1);
  });

  it("scores a flat two-year run at 1", () => {
    const weeks = weeksBefore(0, 104, 6);
    expect(declineRatio(historyWith({ weeks }), TODAY)).toBeCloseTo(1, 10);
  });

  it("scores a fivefold slowdown at its ratio", () => {
    // 52 weeks at 10, then 26 weeks at 2: the best year averaged 10, the last
    // half-year averaged 2.
    const weeks = [...weeksBefore(26, 52, 10), ...weeksBefore(0, 26, 2)];
    expect(declineRatio(historyWith({ weeks }), TODAY)).toBeCloseTo(0.2, 10);
  });

  it("scores an account busier than it has ever been above 1", () => {
    const weeks = [...weeksBefore(26, 52, 2), ...weeksBefore(0, 26, 10)];
    expect(declineRatio(historyWith({ weeks }), TODAY)).toBeGreaterThan(1);
  });

  it("ignores the current partial week", () => {
    // Otherwise the ratio would sag every Monday and recover every Sunday,
    // which is the day-to-day instability D-005 forbids.
    const settled = weeksBefore(0, 104, 6);
    const withSpike = [...settled, { w: isoWeekOf(TODAY), c: 500 }];
    expect(declineRatio(historyWith({ weeks: withSpike }), TODAY)).toBeCloseTo(
      declineRatio(historyWith({ weeks: settled }), TODAY),
      10,
    );
  });

  it("does not manufacture a decline out of youth", () => {
    // Twelve weeks old and perfectly steady. Dividing the recent sum by a fixed
    // 26 would count the weeks before the account existed as zeros and report
    // this as a tree half blown over.
    const weeks = weeksBefore(0, 12, 8);
    expect(declineRatio(historyWith({ weeks }), TODAY)).toBeCloseTo(1, 10);
  });

  it("treats activity confined to the current week as no baseline", () => {
    const weeks = [{ w: isoWeekOf(TODAY), c: 40 }];
    expect(declineRatio(historyWith({ weeks }), TODAY)).toBe(1);
  });

  it("measures against the best year, not the first or the last", () => {
    // A quiet start, a strong middle, a quiet now: the middle is the baseline.
    const weeks = [
      ...weeksBefore(130, 52, 1),
      ...weeksBefore(78, 52, 20),
      ...weeksBefore(26, 52, 1),
      ...weeksBefore(0, 26, 1),
    ];
    expect(declineRatio(historyWith({ weeks }), TODAY)).toBeCloseTo(1 / 20, 10);
  });
});

describe("langCount15", () => {
  const cases: Array<[string, number[], number]> = [
    ["no languages", [], 0],
    ["one dominant language", [0.9], 1],
    ["the floor exactly, which counts", [0.7, LANG_SHARE_FLOOR], 2],
    ["a hair under the floor, which does not", [0.7, LANG_SHARE_FLOOR - 0.0001], 1],
    ["a genuine polyglot", [0.3, 0.25, 0.2, 0.16], 4],
    ["a long tail of dabbling", [0.8, 0.05, 0.04, 0.03], 1],
  ];

  for (const [name, shares, expected] of cases) {
    it(`counts ${name}`, () => {
      const languages = shares.map((share, i) => ({ name: `lang${String(i)}`, share }));
      expect(langCount15(historyWith({ languages }))).toBe(expected);
    });
  }
});

describe("dormancyHistory", () => {
  it("finds nothing in an unbroken run", () => {
    expect(dormancyHistory(historyWith({ weeks: weeksBefore(0, 60, 5) }))).toEqual([]);
  });

  it("ignores a gap at the threshold and takes the one past it", () => {
    // Silence is measured from the end of the last active week, so a gap of N
    // whole weeks between Mondays is 7N - 7 days of quiet: 26 weeks is 175 days
    // and stays under, 27 weeks is 182 and does not.
    const under = historyWith({ weeks: [weekAt(26, 4), weekAt(0, 4)] });
    expect(dormancyHistory(under)).toEqual([]);

    const over = historyWith({ weeks: [weekAt(27, 4), weekAt(0, 4)] });
    const spells = dormancyHistory(over);
    expect(spells).toHaveLength(1);
    expect(spells[0]!.days).toBe(182);
    expect(spells[0]!.days).toBeGreaterThan(DORMANCY_SPELL_DAYS);
  });

  it("reports the honest silence, not the distance between Mondays", () => {
    const spells = dormancyHistory(historyWith({ weeks: [weekAt(30, 4), weekAt(0, 4)] }));
    expect(spells[0]!.days).toBe(30 * 7 - 7);
    expect(daysBetween(spells[0]!.startedAt, spells[0]!.endedAt)).toBe(30 * 7);
  });

  it("dates a spell to the week it began and the week it closed", () => {
    const spells = dormancyHistory(historyWith({ weeks: [weekAt(40, 4), weekAt(2, 4)] }));
    expect(spells[0]!.startedAt).toBe(isoWeekStart(isoWeekOf(spells[0]!.startedAt)));
    expect(spells[0]!.startedAt).toBe(isoWeekStart(weekAt(40, 4).w));
    expect(spells[0]!.endedAt).toBe(isoWeekStart(weekAt(2, 4).w));
  });

  it("does not count an absence that is still running", () => {
    // The tree is dormant, not healed. A trunk cannot be marked as having
    // survived something it is still inside.
    expect(dormancyHistory(historyWith({ weeks: weeksBefore(200, 20, 5) }))).toEqual([]);
  });

  it("keeps the most recent spells and drops the ancient ones", () => {
    const weeks = [
      weekAt(300, 4),
      weekAt(260, 4),
      weekAt(220, 4),
      weekAt(180, 4),
      weekAt(140, 4),
      weekAt(100, 4),
      weekAt(0, 4),
    ];
    const spells = dormancyHistory(historyWith({ weeks }));
    // Six gaps of 40 weeks each; TreeFacts is served as JSON, so the list is
    // capped rather than growing with the length of a sparse career.
    expect(spells).toHaveLength(4);
    expect(spells[3]!.endedAt).toBe(isoWeekStart(weekAt(0, 4).w));
    expect(spells[0]!.startedAt).toBe(isoWeekStart(weekAt(220, 4).w));
  });

  it("returns spells oldest first", () => {
    const weeks = [weekAt(200, 4), weekAt(150, 4), weekAt(60, 4), weekAt(0, 4)];
    const spells = dormancyHistory(historyWith({ weeks }));
    expect(spells.map((s) => s.startedAt)).toEqual([...spells.map((s) => s.startedAt)].sort());
  });
});

describe("the signal bundle", () => {
  it("is what treeFacts carries", () => {
    const history = historyWith({
      weeks: weeksBefore(0, 40, 6),
      languages: [{ name: "TypeScript", share: 0.8 }],
    });
    expect(treeFacts(history, TODAY).signals).toEqual(derivedSignalsFor(history, TODAY));
  });

  it("stays finite for every committed fixture, including the empty one", () => {
    for (const [name, history] of allFixtures()) {
      const { signals } = treeFacts(history, TODAY);
      for (const [key, value] of Object.entries(signals)) {
        if (typeof value !== "number") continue;
        expect(Number.isFinite(value), `${name}.${key}`).toBe(true);
        expect(value, `${name}.${key}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("separates the fixtures it is meant to separate", () => {
    // The whole point of C.1: these accounts currently differ only in how much
    // and how long. If the signals cannot tell them apart, no ladder built on
    // them can either.
    const byName = new Map(
      allFixtures().map(([name, history]) => [name, treeFacts(history, TODAY)]),
    );
    const grinder = byName.get("grinder")!;
    const maintainer = byName.get("maintainer")!;
    expect(grinder.signals.cadenceCV).not.toBeCloseTo(maintainer.signals.cadenceCV, 2);
  });
});
