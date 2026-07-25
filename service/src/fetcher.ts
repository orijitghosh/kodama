/**
 * The cache-and-fetch layer (SPEC-SERVICE §2-3, D-029, D-030).
 *
 * The common case is one KV read. A cold or day-old login takes the two-phase
 * fan-out sized by SPIKE-GRAPHQL: identity first, because the year windows need
 * `createdAt`, then every remaining query at once.
 *
 * Contract with the route above: return a history plus how fresh it is, or
 * throw something carrying a `kind` the error-SVG table recognises.
 */

import { addDays, assertHistory } from "@kodama/engine";
import type { NormalizedHistory } from "@kodama/engine";

import { GitHubError } from "./github/client.js";
import type { GitHubClient } from "./github/client.js";
import {
  COUNTS_QUERY,
  IDENTITY_QUERY,
  LANGUAGES_QUERY,
  STARS_QUERY,
  YEAR_QUERY,
} from "./github/query.js";
import {
  countsResponseSchema,
  identityResponseSchema,
  languagesResponseSchema,
  starsResponseSchema,
  yearResponseSchema,
} from "./github/shape.js";
import type {
  CountsResponse,
  IdentityResponse,
  LanguagesResponse,
  StarsResponse,
  YearResponse,
} from "./github/shape.js";
import type { ColdGuard } from "./guard.js";
import {
  historyKey,
  HISTORY_TTL_S,
  isFresh,
  missKey,
  NOT_FOUND_TTL_S,
  yearKey,
  YEAR_TTL_S,
} from "./kv/index.js";
import type { KV } from "./kv/index.js";
import { warn } from "./log.js";
import { normalize } from "./normalize.js";
import { SingleFlight } from "./singleflight.js";

export type HistorySource = "fresh" | "refreshed" | "stale";

export interface FetchResult {
  history: NormalizedHistory;
  /**
   * `fresh` - KV had today's copy. `refreshed` - we went to GitHub.
   * `stale` - GitHub failed and KV had an older copy, which the route marks
   * with the "cached" leaf (SPEC-SERVICE §4).
   */
  source: HistorySource;
}

export interface FetcherOptions {
  kv: KV;
  client: GitHubClient;
  /** Shared across requests in one instance; the stampede guard. */
  singleFlight?: SingleFlight<FetchResult>;
  /**
   * The per-client cold-fetch cap. Optional so the unit suites can drive the
   * fetcher without one; production always passes the container's (guard.ts).
   */
  guard?: ColdGuard;
}

export class Fetcher {
  readonly #kv: KV;
  readonly #client: GitHubClient;
  readonly #single: SingleFlight<FetchResult>;
  readonly #guard: ColdGuard | null;

  constructor(options: FetcherOptions) {
    this.#kv = options.kv;
    this.#client = options.client;
    this.#single = options.singleFlight ?? new SingleFlight<FetchResult>();
    this.#guard = options.guard ?? null;
  }

  /**
   * `today` is the request's UTC date - the caller's only clock. `client` is who
   * to charge a cold fetch to (guard.ts); null is uncharged.
   */
  async fetch(login: string, today: string, client: string | null = null): Promise<FetchResult> {
    const cached = await this.#readHistory(login);
    if (cached !== null && isFresh(cached.fetchedAt, today)) {
      return { history: cached, source: "fresh" };
    }

    // A login GitHub has already denied costs a KV read instead of a query. Only
    // consulted with nothing cached: a login we hold a history for has existed,
    // and a rename or deletion should reach the stale path below, not this one.
    if (cached === null && (await this.#kv.get(missKey(login))) !== null) {
      throw new GitHubError("notFound", "user not found (cached)", 404);
    }

    // Keyed by login, not by login+date: two requests either side of midnight
    // want the same fetch, and the loser re-reads a cache that is now warm.
    return this.#single.run(login.toLowerCase(), async () => {
      try {
        // Inside the flight, so the request that waits on someone else's fetch
        // is not charged for it, and after the caches, so a warm badge is free.
        await this.#guard?.charge(client);
        const history = await this.#refresh(login, today);
        return { history, source: "refreshed" };
      } catch (err) {
        if (cached !== null) {
          warn("serving stale history", {
            login,
            fetchedAt: cached.fetchedAt,
            reason: err instanceof Error ? err.name : "unknown",
          });
          return { history: cached, source: "stale" };
        }
        if (err instanceof GitHubError && err.kind === "notFound") {
          await this.#kv.set(missKey(login), today, NOT_FOUND_TTL_S);
        }
        throw err;
      }
    });
  }

  // -------------------------------------------------------------------------

  async #readHistory(login: string): Promise<NormalizedHistory | null> {
    const raw = await this.#kv.get(historyKey(login));
    if (raw === null) return null;
    try {
      return assertHistory(JSON.parse(raw));
    } catch (err) {
      // A corrupt or version-bumped entry is a cache miss, not an outage. Drop
      // it so the next request does not pay to rediscover the same problem.
      warn("discarding unusable cache entry", {
        login,
        reason: err instanceof Error ? err.message : "unknown",
      });
      await this.#kv.del(historyKey(login));
      return null;
    }
  }

  async #refresh(login: string, today: string): Promise<NormalizedHistory> {
    // Phase one: 115 ms, and the only thing the year windows depend on.
    const identity = identityResponseSchema.parse(
      await this.#client.query<IdentityResponse>(IDENTITY_QUERY, { login }),
    );
    const canonical = identity.user.login;
    const createdAt = identity.user.createdAt.slice(0, 10);
    const windows = yearWindows(createdAt, today);

    // Phase two: everything at once. Wall clock is the slowest branch rather
    // than the sum - 16 s of sequential year queries became 1.6 s.
    const [counts, stars, languages, years] = await Promise.all([
      this.#client
        .query<CountsResponse>(COUNTS_QUERY, { login: canonical })
        .then((r) => countsResponseSchema.parse(r)),
      this.#client
        .query<StarsResponse>(STARS_QUERY, { login: canonical })
        .then((r) => starsResponseSchema.parse(r)),
      this.#client
        .query<LanguagesResponse>(LANGUAGES_QUERY, { login: canonical })
        .then((r) => languagesResponseSchema.parse(r)),
      Promise.all(windows.map((w) => this.#year(canonical, w, today))),
    ]);

    const history = normalize({
      profile: assemble(identity, counts, stars, languages),
      years: years.map((y) => y.response),
      fetchedAt: today,
    });

    await this.#writeBack(canonical, history, years);
    return history;
  }

  /** A past year is immutable, so it is read from KV and written back once. */
  async #year(
    login: string,
    window: YearWindow,
    today: string,
  ): Promise<{ response: YearResponse; cacheable: boolean; year: number }> {
    const cacheable = window.to.slice(0, 10) < today;
    if (cacheable) {
      const raw = await this.#kv.get(yearKey(login, window.year));
      if (raw !== null) {
        const parsed = yearResponseSchema.safeParse(JSON.parse(raw));
        if (parsed.success) return { response: parsed.data, cacheable, year: window.year };
      }
    }
    const fresh = yearResponseSchema.parse(
      await this.#client.query<YearResponse>(YEAR_QUERY, {
        login,
        from: window.from,
        to: window.to,
      }),
    );
    return { response: fresh, cacheable, year: window.year };
  }

  async #writeBack(
    login: string,
    history: NormalizedHistory,
    years: { response: YearResponse; cacheable: boolean; year: number }[],
  ): Promise<void> {
    // Writes are best-effort by construction: `guarded()` turns a failing store
    // into a silent no-op, and a dropped write costs one re-fetch tomorrow.
    await Promise.all([
      this.#kv.set(historyKey(login), JSON.stringify(history), HISTORY_TTL_S),
      ...years
        .filter((y) => y.cacheable)
        .map((y) => this.#kv.set(yearKey(login, y.year), JSON.stringify(y.response), YEAR_TTL_S)),
    ]);
  }
}

// ---------------------------------------------------------------------------

export interface YearWindow {
  year: number;
  /** ISO 8601 datetimes - `contributionsCollection` takes `DateTime`. */
  from: string;
  to: string;
}

/**
 * Account-year windows from creation to today.
 *
 * Anniversary-aligned rather than calendar-aligned, so a 2009-12-20 account
 * costs 17 queries rather than 18 - GitHub caps a single collection at one
 * year, and aligning to the account start wastes no window.
 */
export function yearWindows(createdAt: string, today: string): YearWindow[] {
  const windows: YearWindow[] = [];
  let from = createdAt;
  let year = 0;
  while (from <= today) {
    const nextAnniversary = `${String(Number(from.slice(0, 4)) + 1)}${from.slice(4)}`;
    const to = nextAnniversary <= today ? addDays(nextAnniversary, -1) : today;
    windows.push({ year, from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` });
    if (to >= today) break;
    from = nextAnniversary;
    year += 1;
  }
  return windows;
}

/**
 * The four split responses, reassembled into the single-document shape the
 * normalizer is written against (SPIKE-GRAPHQL §4).
 *
 * Stars and languages come from different queries over different repository
 * counts, so they cannot share nodes. The language nodes are given zero stars
 * - the star total is the sum over all nodes, and counting the top 25 twice
 * would inflate it by roughly the amount that matters most.
 */
function assemble(
  identity: IdentityResponse,
  counts: CountsResponse,
  stars: StarsResponse,
  languages: LanguagesResponse,
): unknown {
  return {
    user: {
      login: identity.user.login,
      createdAt: identity.user.createdAt,
      // The calendar, review counts and repository rows all arrive with the
      // year windows, which tile the whole account; this slot exists to satisfy
      // the shape. Empty here means the repo mix is computed from the years
      // alone, which is where every row lives in production.
      contributionsCollection: {
        totalPullRequestReviewContributions: 0,
        contributionCalendar: { weeks: [] },
        commitContributionsByRepository: [],
      },
      mergedPRs: counts.user.mergedPRs,
      openPRs: counts.user.openPRs,
      closedIssues: counts.user.closedIssues,
      answers: counts.user.answers,
      repositories: {
        nodes: [
          ...(stars.user.repositories.nodes ?? [])
            .filter((n): n is { stargazerCount: number } => n !== null)
            .map((n) => ({ stargazerCount: n.stargazerCount })),
          ...(languages.user.repositories.nodes ?? [])
            .filter((n): n is NonNullable<typeof n> => n !== null)
            .map((n) => ({ stargazerCount: 0, languages: n.languages })),
        ],
      },
    },
  };
}

export { GitHubError };
