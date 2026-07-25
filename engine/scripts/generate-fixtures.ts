/**
 * Generates the synthetic fixtures of SPEC-ENGINE §7.
 *
 * Fixtures are committed JSON, not generated at test time, so the golden suite's
 * inputs never move. This script regenerates them and is seeded, so a rerun is a
 * no-op diff unless one of the shapes here changed.
 *
 * The anchor date is fixed (never "today") for the same reason.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  addDays,
  daysBetween,
  isoWeekOf,
} from "../src/date.js";
import { mulberry32 } from "../src/rng.js";
import type { NormalizedHistory, PRStub, RepoMix, WeekCell } from "../src/types.js";

/** Every fixture is described relative to this date. */
export const FIXTURE_TODAY = "2026-07-15";

/** SPEC-ENGINE §3.1: days are capped at 30 commits before weekly summation. */
const DAILY_COMMIT_CAP = 30;

interface DayGen {
  /** Probability a given day has any activity at all. */
  activeRate: number;
  /** Commit count drawn per active day, before the cap. */
  perDay: (rng: ReturnType<typeof mulberry32>) => number;
}

/**
 * Builds weeks by simulating days, then capping and summing - mirroring what
 * the real normalizer does at fetch time, so the fixtures exercise the same
 * contract rather than a convenient approximation of it.
 */
function buildDays(
  from: string,
  to: string,
  seed: number,
  gen: DayGen,
): { days: Map<string, number>; weeks: WeekCell[]; total: number } {
  const rng = mulberry32(seed);
  const days = new Map<string, number>();
  const span = daysBetween(from, to);

  for (let i = 0; i <= span; i += 1) {
    const date = addDays(from, i);
    if (rng.next() >= gen.activeRate) continue;
    const capped = Math.min(DAILY_COMMIT_CAP, Math.max(0, Math.round(gen.perDay(rng))));
    if (capped > 0) days.set(date, capped);
  }

  return { days, ...summarise(days) };
}

function summarise(days: Map<string, number>): { weeks: WeekCell[]; total: number } {
  const byWeek = new Map<string, number>();
  let total = 0;
  for (const [date, count] of days) {
    const label = isoWeekOf(date);
    byWeek.set(label, (byWeek.get(label) ?? 0) + count);
    total += count;
  }
  const weeks = [...byWeek.entries()]
    .map(([w, c]) => ({ w, c }))
    .sort((a, b) => (a.w < b.w ? -1 : a.w > b.w ? 1 : 0));
  return { weeks, total };
}

/** Streaks computed the way the normalizer computes them: over the day map. */
function computeStreak(
  days: Map<string, number>,
  today: string,
): { current: number; longest: number; lastActiveDate: string } {
  const active = [...days.keys()].sort();
  if (active.length === 0) {
    return { current: 0, longest: 0, lastActiveDate: "1970-01-01" };
  }

  let longest = 1;
  let run = 1;
  for (let i = 1; i < active.length; i += 1) {
    run = daysBetween(active[i - 1]!, active[i]!) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const lastActiveDate = active[active.length - 1]!;
  // A streak stays "current" while it reaches today or yesterday - the day is
  // not yet over for everyone on Earth.
  const gap = daysBetween(lastActiveDate, today);
  let current = 0;
  if (gap <= 1) {
    current = 1;
    for (let i = active.length - 1; i > 0; i -= 1) {
      if (daysBetween(active[i - 1]!, active[i]!) !== 1) break;
      current += 1;
    }
  }
  return { current, longest: Math.max(longest, current), lastActiveDate };
}

function mergedPRs(
  count: number,
  newestOffsetDays: number,
  spacingDays: number,
  buckets: Array<1 | 2 | 3>,
): PRStub[] {
  return Array.from({ length: count }, (_, i) => ({
    mergedAt: addDays(FIXTURE_TODAY, -(newestOffsetDays + i * spacingDays)),
    bucket: buckets[i % buckets.length]!,
  }));
}

/**
 * Repo mixes, authored per persona rather than simulated (v2).
 *
 * The other fields of a fixture are generated from a seeded day walk, but the
 * repo mix has no day-level source to walk - it is a summary of a hundred repo
 * rows the fixtures never contained. So each persona states its own, and each
 * one is chosen to be the mix that persona's story implies: the grinder pours
 * everything into two of his own repos, the maintainer is spread across other
 * people's, the veteran has one long-lived project still ticking over.
 *
 * These are also the inputs the form ladder will be calibrated against (C.5), so
 * a persona whose mix contradicts its silhouette is a fixture bug, not a
 * threshold bug. `NOTHING` is the honest mix for an account with no qualifying
 * repos at all.
 */
const NOTHING: RepoMix = { hhi: 0, ownShare: 0, breadth: 0, orgs: 0, anchor: null };

interface FixtureSpec {
  name: string;
  build(): NormalizedHistory;
}

const specs: FixtureSpec[] = [
  {
    // Zero contributions. Must render as a charming sprout, never an
    // embarrassment (PRD "giants and ghosts").
    name: "ghost",
    build: () => ({
      v: 2,
      login: "ghost",
      fetchedAt: FIXTURE_TODAY,
      createdAt: "2025-11-02",
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
      streak: { current: 0, longest: 0, lastActiveDate: "2025-11-02" },
      recentPRs: [],
      languages: [],
      // No commits anywhere, so nothing to be spread across.
      repoMix: NOTHING,
    }),
  },
  {
    name: "newcomer",
    build: () => {
      const created = addDays(FIXTURE_TODAY, -23);
      const { days, weeks, total } = buildDays(created, FIXTURE_TODAY, 1001, {
        activeRate: 0.55,
        perDay: (rng) => rng.int(1, 4),
      });
      return {
        v: 2,
        login: "newcomer",
        fetchedAt: FIXTURE_TODAY,
        createdAt: created,
        weeks,
        totals: {
          commits: total,
          prsMerged: 1,
          prsOpen: 1,
          reviews: 0,
          issuesClosed: 0,
          discussions: 0,
          starsReceived: 2,
        },
        streak: computeStreak(days, FIXTURE_TODAY),
        recentPRs: mergedPRs(1, 2, 1, [1]),
        languages: [
          { name: "Python", share: 0.71 },
          { name: "Shell", share: 0.19 },
        ],
        // Three weeks in, one repo of her own. Everything she has is in it.
        repoMix: {
          hhi: 1,
          ownShare: 1,
          breadth: 1,
          orgs: 0,
          anchor: { nameWithOwner: "newcomer/first-steps", years: 0, share: 1 },
        },
      };
    },
  },
  {
    name: "grinder",
    build: () => {
      const created = addDays(FIXTURE_TODAY, -365 * 2 - 40);
      const { days, weeks, total } = buildDays(created, FIXTURE_TODAY, 2002, {
        activeRate: 0.93,
        perDay: (rng) => rng.int(3, 14),
      });
      return {
        v: 2,
        login: "grinder",
        fetchedAt: FIXTURE_TODAY,
        createdAt: created,
        weeks,
        totals: {
          commits: total,
          prsMerged: 64,
          prsOpen: 3,
          reviews: 18,
          issuesClosed: 22,
          discussions: 4,
          starsReceived: 140,
        },
        streak: computeStreak(days, FIXTURE_TODAY),
        recentPRs: mergedPRs(10, 1, 3, [1, 2, 1]),
        languages: [
          { name: "TypeScript", share: 0.54 },
          { name: "Rust", share: 0.26 },
          { name: "CSS", share: 0.11 },
        ],
        // Head down in two of his own projects, with one repo of someone
        // else's on the side. Concentrated, and almost entirely his.
        repoMix: {
          hhi: 0.405,
          ownShare: 0.9,
          breadth: 4,
          orgs: 1,
          anchor: { nameWithOwner: "grinder/side-quest", years: 2, share: 0.55 },
        },
      };
    },
  },
  {
    // The maintainer's signature is breadth, not commit volume: lanterns
    // (reviews), fruit (merged PRs), a nesting bird (issues closed).
    name: "maintainer",
    build: () => {
      const created = addDays(FIXTURE_TODAY, -365 * 7 - 120);
      const { days, weeks, total } = buildDays(created, FIXTURE_TODAY, 3003, {
        activeRate: 0.72,
        perDay: (rng) => rng.int(1, 8),
      });
      return {
        v: 2,
        login: "maintainer",
        fetchedAt: FIXTURE_TODAY,
        createdAt: created,
        weeks,
        totals: {
          commits: total,
          prsMerged: 412,
          prsOpen: 6,
          reviews: 2840,
          issuesClosed: 1310,
          discussions: 190,
          starsReceived: 6200,
        },
        streak: computeStreak(days, FIXTURE_TODAY),
        recentPRs: mergedPRs(10, 0, 2, [2, 3, 1]),
        languages: [
          { name: "Go", share: 0.48 },
          { name: "TypeScript", share: 0.22 },
          { name: "Makefile", share: 0.08 },
        ],
        // The mix that actually names a maintainer: scattered across other
        // people's repositories, in half a dozen organisations, owning a
        // minority of the work she commits to.
        repoMix: {
          hhi: 0.09,
          ownShare: 0.35,
          breadth: 34,
          orgs: 6,
          anchor: { nameWithOwner: "maintainer/gopls-helpers", years: 7, share: 0.22 },
        },
      };
    },
  },
  {
    // 300k commits, 10 years. Log buckets must keep this composed.
    name: "whale",
    build: () => {
      const created = addDays(FIXTURE_TODAY, -365 * 10 - 200);
      const { days, weeks, total } = buildDays(created, FIXTURE_TODAY, 4004, {
        activeRate: 0.99,
        perDay: () => DAILY_COMMIT_CAP,
      });
      return {
        v: 2,
        login: "whale",
        fetchedAt: FIXTURE_TODAY,
        createdAt: created,
        weeks,
        totals: {
          commits: total,
          prsMerged: 3100,
          prsOpen: 24,
          reviews: 9800,
          issuesClosed: 4200,
          discussions: 760,
          starsReceived: 128000,
        },
        streak: computeStreak(days, FIXTURE_TODAY),
        recentPRs: mergedPRs(10, 0, 1, [3, 3, 2]),
        languages: [
          { name: "C", share: 0.52 },
          { name: "C++", share: 0.21 },
          { name: "Assembly", share: 0.13 },
        ],
        // One enormous codebase he does not own, plus a few of his own tools.
        // Ten years on the same tree.
        repoMix: {
          hhi: 0.72,
          ownShare: 0.15,
          breadth: 9,
          orgs: 3,
          anchor: { nameWithOwner: "whale/perf-tools", years: 9, share: 0.08 },
        },
      };
    },
  },
  {
    name: "veteran",
    build: () => {
      const created = addDays(FIXTURE_TODAY, -365 * 11 - 30);
      const { days, weeks, total } = buildDays(created, FIXTURE_TODAY, 5005, {
        activeRate: 0.42,
        perDay: (rng) => rng.int(1, 6),
      });
      return {
        v: 2,
        login: "veteran",
        fetchedAt: FIXTURE_TODAY,
        createdAt: created,
        weeks,
        totals: {
          commits: total,
          prsMerged: 118,
          prsOpen: 2,
          reviews: 340,
          issuesClosed: 96,
          discussions: 31,
          starsReceived: 1400,
        },
        streak: computeStreak(days, FIXTURE_TODAY),
        recentPRs: mergedPRs(6, 5, 9, [1, 2]),
        languages: [
          { name: "Java", share: 0.44 },
          { name: "Kotlin", share: 0.3 },
        ],
        // Eleven years, one long-lived project of his own still ticking over.
        // This is the mix root-over-rock is meant to find.
        repoMix: {
          hhi: 0.61,
          ownShare: 0.88,
          breadth: 5,
          orgs: 1,
          anchor: { nameWithOwner: "veteran/legacy-parser", years: 11, share: 0.74 },
        },
      };
    },
  },
  {
    // Streak broken four days ago: petals fall for a week, tree unharmed.
    name: "streak-broken",
    build: () => {
      const created = addDays(FIXTURE_TODAY, -365 * 3);
      const stopped = addDays(FIXTURE_TODAY, -4);
      const { days, weeks, total } = buildDays(created, stopped, 6006, {
        activeRate: 0.97,
        perDay: (rng) => rng.int(2, 9),
      });
      const streak = computeStreak(days, FIXTURE_TODAY);
      return {
        v: 2,
        login: "streak-broken",
        fetchedAt: FIXTURE_TODAY,
        createdAt: created,
        weeks,
        totals: {
          commits: total,
          prsMerged: 88,
          prsOpen: 1,
          reviews: 210,
          issuesClosed: 64,
          discussions: 12,
          starsReceived: 430,
        },
        streak: { ...streak, current: 0, longest: Math.max(streak.longest, 214) },
        recentPRs: mergedPRs(5, 6, 4, [1, 2]),
        languages: [{ name: "Ruby", share: 0.66 }],
        repoMix: {
          hhi: 0.44,
          ownShare: 0.7,
          breadth: 6,
          orgs: 2,
          anchor: { nameWithOwner: "streak-broken/daily-ledger", years: 3, share: 0.6 },
        },
      };
    },
  },
  {
    // Silent for 140 days: mist, sleeping spirit, foliage kept.
    name: "dormant",
    build: () => {
      const created = addDays(FIXTURE_TODAY, -365 * 5);
      const stopped = addDays(FIXTURE_TODAY, -140);
      const { days, weeks, total } = buildDays(created, stopped, 7007, {
        activeRate: 0.6,
        perDay: (rng) => rng.int(1, 7),
      });
      const streak = computeStreak(days, FIXTURE_TODAY);
      return {
        v: 2,
        login: "dormant",
        fetchedAt: FIXTURE_TODAY,
        createdAt: created,
        weeks,
        totals: {
          commits: total,
          prsMerged: 47,
          prsOpen: 0,
          reviews: 88,
          issuesClosed: 30,
          discussions: 5,
          starsReceived: 260,
        },
        streak,
        recentPRs: mergedPRs(4, 150, 12, [1]),
        languages: [{ name: "Elixir", share: 0.58 }, { name: "HTML", share: 0.2 }],
        repoMix: {
          hhi: 0.5,
          ownShare: 0.8,
          breadth: 4,
          orgs: 1,
          anchor: { nameWithOwner: "dormant/phoenix-shop", years: 5, share: 0.68 },
        },
      };
    },
  },
  {
    // Dormant, then came back three days ago: burst shoots, mist lifting.
    name: "awakening",
    build: () => {
      const created = addDays(FIXTURE_TODAY, -365 * 4);
      const stopped = addDays(FIXTURE_TODAY, -160);
      const past = buildDays(created, stopped, 8008, {
        activeRate: 0.58,
        perDay: (rng) => rng.int(1, 6),
      });
      const back = buildDays(addDays(FIXTURE_TODAY, -3), FIXTURE_TODAY, 8009, {
        activeRate: 1,
        perDay: (rng) => rng.int(4, 12),
      });
      const days = new Map([...past.days, ...back.days]);
      const { weeks, total } = summarise(days);
      return {
        v: 2,
        login: "awakening",
        fetchedAt: FIXTURE_TODAY,
        createdAt: created,
        weeks,
        totals: {
          commits: total,
          prsMerged: 39,
          prsOpen: 2,
          reviews: 71,
          issuesClosed: 25,
          discussions: 3,
          starsReceived: 180,
        },
        streak: computeStreak(days, FIXTURE_TODAY),
        recentPRs: mergedPRs(3, 1, 2, [1, 2]),
        languages: [{ name: "Zig", share: 0.61 }],
        repoMix: {
          hhi: 0.38,
          ownShare: 0.75,
          breadth: 5,
          orgs: 1,
          anchor: { nameWithOwner: "awakening/zig-toy", years: 3, share: 0.55 },
        },
      };
    },
  },
  {
    // 5000 commits pushed inside one week. The daily cap must flatten this to
    // roughly one strong week (7 * 30 = 210), not a redwood (D-010).
    name: "spammer",
    build: () => {
      const created = addDays(FIXTURE_TODAY, -420);
      const days = new Map<string, number>();
      for (let i = 0; i < 7; i += 1) {
        // The raw figure would be ~714/day; the cap is what gets stored.
        days.set(addDays(FIXTURE_TODAY, -i), DAILY_COMMIT_CAP);
      }
      const { weeks, total } = summarise(days);
      return {
        v: 2,
        login: "spammer",
        fetchedAt: FIXTURE_TODAY,
        createdAt: created,
        weeks,
        totals: {
          commits: total,
          prsMerged: 0,
          prsOpen: 0,
          reviews: 0,
          issuesClosed: 0,
          discussions: 0,
          starsReceived: 0,
        },
        streak: computeStreak(days, FIXTURE_TODAY),
        recentPRs: [],
        languages: [{ name: "JavaScript", share: 1 }],
        // The other half of the anti-gaming story. He also pushed a commit into
        // forty-nine throwaway repos that week; not one of them clears the
        // qualifying filter, so breadth is 1 and the broom style stays shut.
        repoMix: {
          hhi: 1,
          ownShare: 1,
          breadth: 1,
          orgs: 0,
          anchor: { nameWithOwner: "spammer/commit-loop", years: 1, share: 1 },
        },
      };
    },
  },
];

function main(): void {
  const outDir = resolve(import.meta.dirname, "../fixtures");
  mkdirSync(outDir, { recursive: true });

  const index: string[] = [];
  for (const spec of specs) {
    const history = spec.build();
    const file = resolve(outDir, `${spec.name}.json`);
    writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`, "utf8");
    index.push(spec.name);
    console.log(
      `${spec.name.padEnd(14)} weeks=${String(history.weeks.length).padStart(4)} ` +
        `commits=${String(history.totals.commits).padStart(6)} ` +
        `streak=${String(history.streak.current)}/${String(history.streak.longest)}`,
    );
  }

  writeFileSync(
    resolve(outDir, "index.json"),
    `${JSON.stringify({ anchorDate: FIXTURE_TODAY, fixtures: index }, null, 2)}\n`,
    "utf8",
  );
  console.log(`\nwrote ${String(index.length)} fixtures anchored at ${FIXTURE_TODAY}`);
}

main();
