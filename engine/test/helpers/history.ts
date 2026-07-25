import { addDays, isoWeekOf, isoWeekStart } from "../../src/date.js";
import type { NormalizedHistory, WeekCell } from "../../src/types.js";
import { FIXTURE_ANCHOR_DATE } from "./fixtures.js";

/**
 * A minimal, valid history that rule tests can vary one field of at a time.
 * Defaults are deliberately inert - no streak, no stars, no PRs - so any
 * ornament a test sees is one the test asked for.
 */
export function historyWith(overrides: DeepPartialHistory = {}): NormalizedHistory {
  const base: NormalizedHistory = {
    v: 2,
    login: "fixture",
    fetchedAt: FIXTURE_ANCHOR_DATE,
    // A fixed date chosen not to fall on the anchor's month-and-day, so the
    // default history never accidentally triggers the anniversary spirit.
    createdAt: "2023-03-08",
    weeks: [],
    totals: {
      commits: 0,
      prsMerged: 0,
      prsOpen: 0,
      reviews: 0,
      issuesClosed: 0,
      discussions: 0,
      starsReceived: 0,
    },
    streak: { current: 0, longest: 0, lastActiveDate: FIXTURE_ANCHOR_DATE },
    recentPRs: [],
    languages: [],
    // Inert like the rest: nothing qualifying, so no form rule can fire off the
    // back of a default a test did not ask for.
    repoMix: { hhi: 0, ownShare: 0, breadth: 0, orgs: 0, anchor: null },
  };

  return {
    ...base,
    ...overrides,
    totals: { ...base.totals, ...overrides.totals },
    streak: { ...base.streak, ...overrides.streak },
    repoMix: { ...base.repoMix, ...overrides.repoMix },
  } as NormalizedHistory;
}

type DeepPartialHistory = Partial<Omit<NormalizedHistory, "totals" | "streak" | "repoMix">> & {
  totals?: Partial<NormalizedHistory["totals"]>;
  streak?: Partial<NormalizedHistory["streak"]>;
  repoMix?: Partial<NormalizedHistory["repoMix"]>;
};

/**
 * `count` consecutive ISO weeks of `commits` each, ending at `lastWeek`.
 * Ascending, as the schema requires.
 */
export function weeksEndingAt(lastWeek: string, count: number, commits: number): WeekCell[] {
  const lastMonday = isoWeekStart(lastWeek);
  const weeks: WeekCell[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    weeks.push({ w: isoWeekOf(addDays(lastMonday, -7 * i)), c: commits });
  }
  return weeks;
}
