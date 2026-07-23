/**
 * GraphQL responses → NormalizedHistory v1 (SPEC-ENGINE §2, SPEC-SERVICE §3).
 *
 * The only place anti-gaming normalization happens (SPEC-ENGINE §3.1): the
 * engine renders whatever it is handed, so a day capped here stays capped.
 *
 * Pure by construction - `fetchedAt` is an argument, never a clock - which is
 * what makes it testable against recorded responses.
 */

import { addDays, assertHistoryV1, isoWeekOf, isValidDate } from "@kodama/engine";
import type { LangShare, NormalizedHistory, PRStub, WeekCell } from "@kodama/engine";

import { profileResponseSchema, yearResponseSchema } from "./github/shape.js";
import type { ProfileResponse, YearResponse } from "./github/shape.js";

/**
 * Days above this are spam, not work (SPEC-ENGINE §3.1). Applied per day
 * before any summation, so neither weekly growth nor lifetime totals can be
 * inflated by a commit loop.
 */
export const DAILY_COMMIT_CAP = 30;

/** Any response that does not match `github/shape.ts`. */
export class KodamaShapeError extends Error {
  override readonly name = "KodamaShapeError";
}

export interface NormalizeInput {
  profile: unknown;
  /** One entry per account year fetched; order and overlap do not matter. */
  years?: readonly unknown[];
  /** "YYYY-MM-DD" UTC - the day the fetch happened. */
  fetchedAt: string;
}

// ---------------------------------------------------------------------------

/** ISO 8601 datetime → "YYYY-MM-DD". GitHub timestamps are already UTC. */
function toCivilDate(value: string): string {
  const date = value.slice(0, 10);
  if (!isValidDate(date)) {
    throw new KodamaShapeError(`expected an ISO timestamp, got ${value}`);
  }
  return date;
}

function parse<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
  value: unknown,
  what: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) {
    const message = result.error instanceof Error ? result.error.message : "unknown";
    throw new KodamaShapeError(`${what} did not match the expected shape: ${message}`);
  }
  return result.data;
}

/**
 * Every calendar day across every response, capped and deduplicated.
 *
 * Year windows overlap at their edges and the profile query re-reports the
 * trailing year, so the same date arrives more than once. Later responses win;
 * they agree in practice, and picking a rule beats depending on iteration
 * order.
 */
function collectDays(
  profile: ProfileResponse,
  years: readonly YearResponse[],
): Map<string, number> {
  const days = new Map<string, number>();
  const calendars = [
    profile.user.contributionsCollection.contributionCalendar,
    ...years.map((y) => y.user.contributionsCollection.contributionCalendar),
  ];
  for (const calendar of calendars) {
    for (const week of calendar.weeks) {
      for (const day of week.contributionDays) {
        if (!isValidDate(day.date)) {
          throw new KodamaShapeError(`calendar day ${day.date} is not a real date`);
        }
        days.set(day.date, Math.min(DAILY_COMMIT_CAP, day.contributionCount));
      }
    }
  }
  return days;
}

/** Capped days folded into ISO weeks; weeks with no activity are omitted. */
function toWeeks(days: Map<string, number>): WeekCell[] {
  const byWeek = new Map<string, number>();
  for (const [date, count] of days) {
    if (count === 0) continue;
    const label = isoWeekOf(date);
    byWeek.set(label, (byWeek.get(label) ?? 0) + count);
  }
  return [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([w, c]): WeekCell => ({ w, c }));
}

interface Streaks {
  current: number;
  longest: number;
  lastActiveDate: string;
}

/**
 * Streaks over the stitched calendar, in UTC days.
 *
 * The current streak is allowed to end yesterday: a fetch at 02:00 UTC sees an
 * empty today, and calling that a broken streak would be wrong every morning.
 * GitHub's own profile behaves the same way.
 */
function computeStreaks(days: Map<string, number>, fetchedAt: string, createdAt: string): Streaks {
  const active = [...days.entries()].filter(([, count]) => count > 0).map(([date]) => date);
  if (active.length === 0) {
    return { current: 0, longest: 0, lastActiveDate: createdAt };
  }
  active.sort();
  const lastActiveDate = active[active.length - 1]!;

  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of active) {
    run = previous !== null && addDays(previous, 1) === date ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = date;
  }

  const activeSet = new Set(active);
  let cursor = activeSet.has(fetchedAt) ? fetchedAt : addDays(fetchedAt, -1);
  let current = 0;
  while (activeSet.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  return { current, longest, lastActiveDate };
}

/** additions → the three buckets the fruit grammar reads (SPEC-ENGINE §2). */
function bucketFor(additions: number): 1 | 2 | 3 {
  if (additions < 100) return 1;
  if (additions < 1000) return 2;
  return 3;
}

function toRecentPRs(profile: ProfileResponse): PRStub[] {
  const nodes = profile.user.mergedPRs.nodes ?? [];
  return nodes
    .flatMap((node) =>
      node === null || node.mergedAt === null
        ? []
        : [{ mergedAt: toCivilDate(node.mergedAt), bucket: bucketFor(node.additions) }],
    )
    .sort((a, b) => (a.mergedAt < b.mergedAt ? 1 : a.mergedAt > b.mergedAt ? -1 : 0))
    .slice(0, 10);
}

/**
 * Top five languages by bytes summed across owned repos.
 *
 * Shares are of *all* bytes counted, not of the top five, so a polyglot's
 * shares sum to well under 1 - which is true, and which the tint reads as
 * "no dominant language". Rounded to four places and floored, because the
 * schema's `sum <= 1` invariant must not lose to float drift.
 */
function toLanguages(profile: ProfileResponse): LangShare[] {
  const bytes = new Map<string, number>();
  for (const repo of profile.user.repositories.nodes ?? []) {
    if (repo === null) continue;
    for (const edge of repo.languages?.edges ?? []) {
      if (edge === null) continue;
      bytes.set(edge.node.name, (bytes.get(edge.node.name) ?? 0) + edge.size);
    }
  }
  const total = [...bytes.values()].reduce((sum, n) => sum + n, 0);
  if (total === 0) return [];

  return [...bytes.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 5)
    .map(([name, size]): LangShare => ({ name, share: Math.floor((size / total) * 1e4) / 1e4 }));
}

function starsOf(profile: ProfileResponse): number {
  return (profile.user.repositories.nodes ?? []).reduce(
    (sum, repo) => sum + (repo?.stargazerCount ?? 0),
    0,
  );
}

// ---------------------------------------------------------------------------

/**
 * The one exported entry point. Throws `KodamaShapeError` on a response the
 * schema does not recognise and `KodamaSchemaError` if the result it built
 * somehow fails the engine's own guard - the second is a bug in this file, and
 * asserting it here means it surfaces in tests rather than as a broken image.
 */
export function normalize(input: NormalizeInput): NormalizedHistory {
  if (!isValidDate(input.fetchedAt)) {
    throw new KodamaShapeError(`fetchedAt must be YYYY-MM-DD, got ${input.fetchedAt}`);
  }
  const profile = parse(profileResponseSchema, input.profile, "profile response");
  const years = (input.years ?? []).map((year, i) =>
    parse(yearResponseSchema, year, `year response ${String(i)}`),
  );

  const createdAt = toCivilDate(profile.user.createdAt);
  const days = collectDays(profile, years);
  const weeks = toWeeks(days);

  // Review counts are per contributions-collection window. The year responses
  // tile the whole account when they are present; without them the profile
  // query's trailing year is all there is, and undercounting is the honest
  // failure mode.
  const reviews =
    years.length === 0
      ? profile.user.contributionsCollection.totalPullRequestReviewContributions
      : years.reduce(
          (sum, year) =>
            sum + year.user.contributionsCollection.totalPullRequestReviewContributions,
          0,
        );

  const history: NormalizedHistory = {
    v: 1,
    login: profile.user.login,
    fetchedAt: input.fetchedAt,
    createdAt,
    weeks,
    totals: {
      commits: weeks.reduce((sum, week) => sum + week.c, 0),
      prsMerged: profile.user.mergedPRs.totalCount,
      prsOpen: profile.user.openPRs.totalCount,
      reviews,
      issuesClosed: profile.user.closedIssues.totalCount,
      discussions: profile.user.answers.totalCount,
      starsReceived: starsOf(profile),
    },
    streak: computeStreaks(days, input.fetchedAt, createdAt),
    recentPRs: toRecentPRs(profile),
    languages: toLanguages(profile),
  };

  assertHistoryV1(history);
  return history;
}
