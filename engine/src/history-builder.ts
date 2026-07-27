/**
 * Builders for synthetic histories.
 *
 * These lived in `test/helpers/history.ts` and moved here when `form-cases.ts`
 * did, so that the crafted accounts and the nine test suites that vary a field at
 * a time are built by the same code rather than by two copies of the same default
 * object. `test/helpers/history.ts` re-exports them, so nothing in the suite
 * changed shape.
 *
 * Nothing here reads the disk: `src/` runs inside a Worker.
 */

import { addDays, isoWeekOf, isoWeekStart } from "./date.js";
import type { NormalizedHistory, WeekCell } from "./types.js";

/**
 * The anchor every synthetic history is authored against, matching
 * `fixtures/index.json`. Duplicated as a literal because `src/` reads no files,
 * and pinned to the real anchor by `fixtures.test.ts`.
 */
export const SYNTHETIC_ANCHOR_DATE = "2026-07-15";

type DeepPartialHistory = Partial<Omit<NormalizedHistory, "totals" | "streak" | "repoMix">> & {
  totals?: Partial<NormalizedHistory["totals"]>;
  streak?: Partial<NormalizedHistory["streak"]>;
  repoMix?: Partial<NormalizedHistory["repoMix"]>;
};

/**
 * A minimal, valid history that rule tests can vary one field of at a time.
 * Defaults are deliberately inert - no streak, no stars, no PRs - so any
 * ornament a test sees is one the test asked for.
 */
export function historyWith(overrides: DeepPartialHistory = {}): NormalizedHistory {
  const base: NormalizedHistory = {
    v: 2,
    login: "fixture",
    fetchedAt: SYNTHETIC_ANCHOR_DATE,
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
    streak: { current: 0, longest: 0, lastActiveDate: SYNTHETIC_ANCHOR_DATE },
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
