/**
 * Hand-built GraphQL responses shaped to `src/github/query.ts`.
 *
 * These are a stand-in. Step 4.2 (SPIKE-GRAPHQL) runs the real documents
 * against the live API and commits recorded responses; when it does, these
 * builders keep their shape or the spike has found a spec bug, which is
 * precisely what the spike is for.
 */

import { addDays } from "@kodama/engine";

export interface DayInput {
  date: string;
  contributionCount: number;
}

/** Wraps loose days in the weeks-of-days envelope the calendar uses. */
export function calendar(days: DayInput[]): {
  weeks: { contributionDays: DayInput[] }[];
} {
  const weeks: { contributionDays: DayInput[] }[] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push({ contributionDays: days.slice(i, i + 7) });
  }
  return { weeks };
}

/** `count` consecutive days ending on `lastDate`, each with `perDay`. */
export function runOfDays(lastDate: string, count: number, perDay: number): DayInput[] {
  const days: DayInput[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    days.push({ date: addDays(lastDate, -i), contributionCount: perDay });
  }
  return days;
}

export interface ProfileOverrides {
  login?: string;
  createdAt?: string;
  reviews?: number;
  days?: DayInput[];
  mergedTotal?: number;
  mergedNodes?: ({ mergedAt: string | null; additions: number } | null)[];
  openPRs?: number;
  closedIssues?: number;
  answers?: number;
  repos?: {
    stargazerCount: number;
    languages?: { edges: ({ size: number; node: { name: string } } | null)[] } | null;
  }[];
}

export function profileResponse(overrides: ProfileOverrides = {}): unknown {
  return {
    user: {
      login: overrides.login ?? "hana",
      createdAt: `${overrides.createdAt ?? "2019-03-04"}T09:12:44Z`,
      contributionsCollection: {
        totalPullRequestReviewContributions: overrides.reviews ?? 0,
        contributionCalendar: calendar(overrides.days ?? []),
      },
      mergedPRs: {
        totalCount: overrides.mergedTotal ?? 0,
        nodes: overrides.mergedNodes ?? [],
      },
      openPRs: { totalCount: overrides.openPRs ?? 0 },
      closedIssues: { totalCount: overrides.closedIssues ?? 0 },
      answers: { totalCount: overrides.answers ?? 0 },
      repositories: { nodes: overrides.repos ?? [] },
    },
    rateLimit: { remaining: 4987, resetAt: "2026-07-21T18:00:00Z" },
  };
}

export function yearResponse(days: DayInput[], reviews = 0): unknown {
  return {
    user: {
      contributionsCollection: {
        totalPullRequestReviewContributions: reviews,
        contributionCalendar: calendar(days),
      },
    },
  };
}
