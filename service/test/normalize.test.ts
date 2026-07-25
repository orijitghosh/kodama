import { assertHistory, isoWeekOf, treeFacts } from "@kodama/engine";
import { describe, expect, it } from "vitest";

import {
  DAILY_COMMIT_CAP,
  KodamaShapeError,
  normalize,
  REPO_MIN_COMMITS,
  REPO_SUSTAINED_COMMITS,
} from "../src/normalize.js";
import { profileResponse, runOfDays, yearResponse } from "./helpers/responses.js";
import type { RepoInput } from "./helpers/responses.js";

const FETCHED_AT = "2026-07-21";

describe("normalize", () => {
  it("produces a history the engine accepts", () => {
    const history = normalize({
      profile: profileResponse({
        login: "Hana",
        days: runOfDays(FETCHED_AT, 14, 3),
        reviews: 41,
        mergedTotal: 87,
        mergedNodes: [
          { mergedAt: "2026-06-02T10:00:00Z", additions: 12 },
          { mergedAt: "2026-07-19T10:00:00Z", additions: 4200 },
        ],
        openPRs: 3,
        closedIssues: 19,
        answers: 5,
        repos: [
          { stargazerCount: 120, languages: { edges: [{ size: 800, node: { name: "Rust" } }] } },
          { stargazerCount: 8, languages: { edges: [{ size: 200, node: { name: "Go" } }] } },
        ],
      }),
      fetchedAt: FETCHED_AT,
    });

    expect(() => {
      assertHistory(history);
    }).not.toThrow();
    expect(history.v).toBe(2);
    expect(history.login).toBe("Hana");
    expect(history.fetchedAt).toBe(FETCHED_AT);
    expect(history.createdAt).toBe("2019-03-04");
    expect(history.totals).toEqual({
      commits: 42,
      prsMerged: 87,
      prsOpen: 3,
      reviews: 41,
      issuesClosed: 19,
      discussions: 5,
      starsReceived: 128,
    });
  });

  it("feeds treeFacts without a second normalization step", () => {
    const history = normalize({
      profile: profileResponse({ days: runOfDays(FETCHED_AT, 400, 4) }),
      fetchedAt: FETCHED_AT,
    });
    const facts = treeFacts(history, FETCHED_AT);
    expect(facts.maturity).toBeGreaterThanOrEqual(3);
    expect(facts.streak.current).toBe(400);
  });
});

describe("anti-gaming caps (SPEC-ENGINE §3.1)", () => {
  it("caps each day at 30 before any summation", () => {
    const history = normalize({
      profile: profileResponse({
        days: [
          { date: "2026-07-20", contributionCount: 900 },
          { date: "2026-07-21", contributionCount: 31 },
        ],
      }),
      fetchedAt: FETCHED_AT,
    });
    expect(history.totals.commits).toBe(DAILY_COMMIT_CAP * 2);
    expect(history.weeks).toEqual([{ w: "2026-W30", c: 60 }]);
  });

  it("leaves a spammer no better off than a steady 30-a-day committer", () => {
    const days = runOfDays(FETCHED_AT, 70, 400);
    const spammer = normalize({ profile: profileResponse({ days }), fetchedAt: FETCHED_AT });
    const steady = normalize({
      profile: profileResponse({ days: runOfDays(FETCHED_AT, 70, DAILY_COMMIT_CAP) }),
      fetchedAt: FETCHED_AT,
    });
    expect(spammer.weeks).toEqual(steady.weeks);
    expect(treeFacts(spammer, FETCHED_AT).maturity).toBe(
      treeFacts(steady, FETCHED_AT).maturity,
    );
  });
});

describe("weeks", () => {
  it("omits weeks with no activity and sums the rest into ISO weeks", () => {
    const history = normalize({
      profile: profileResponse({
        days: [
          { date: "2026-07-06", contributionCount: 2 },
          { date: "2026-07-07", contributionCount: 5 },
          { date: "2026-07-13", contributionCount: 0 },
          { date: "2026-07-20", contributionCount: 1 },
        ],
      }),
      fetchedAt: FETCHED_AT,
    });
    expect(history.weeks).toEqual([
      { w: "2026-W28", c: 7 },
      { w: "2026-W30", c: 1 },
    ]);
  });

  it("groups by ISO week, not by the Sunday-based week the calendar ships", () => {
    // 2026-07-05 is a Sunday: GitHub opens a calendar week with it, ISO closes
    // the previous week with it.
    expect(isoWeekOf("2026-07-05")).toBe("2026-W27");
    expect(isoWeekOf("2026-07-06")).toBe("2026-W28");
    const history = normalize({
      profile: profileResponse({
        days: [
          { date: "2026-07-05", contributionCount: 4 },
          { date: "2026-07-06", contributionCount: 6 },
        ],
      }),
      fetchedAt: FETCHED_AT,
    });
    expect(history.weeks).toEqual([
      { w: "2026-W27", c: 4 },
      { w: "2026-W28", c: 6 },
    ]);
  });

  it("keeps weeks ascending across a year boundary", () => {
    const history = normalize({
      profile: profileResponse({
        days: [
          { date: "2025-12-30", contributionCount: 1 },
          { date: "2026-01-06", contributionCount: 1 },
        ],
      }),
      fetchedAt: FETCHED_AT,
    });
    expect(history.weeks.map((w) => w.w)).toEqual(["2026-W01", "2026-W02"]);
  });
});

describe("per-year stitching", () => {
  it("merges year responses with the profile calendar", () => {
    const history = normalize({
      profile: profileResponse({ days: runOfDays(FETCHED_AT, 3, 1), reviews: 9 }),
      years: [
        yearResponse([{ date: "2024-05-01", contributionCount: 4 }], 12),
        yearResponse([{ date: "2025-05-01", contributionCount: 6 }], 7),
      ],
      fetchedAt: FETCHED_AT,
    });
    expect(history.totals.commits).toBe(4 + 6 + 3);
    expect(history.weeks[0]!.w).toBe("2024-W18");
    // Year windows tile the account; the profile's trailing year would double
    // count if it were added on top.
    expect(history.totals.reviews).toBe(19);
  });

  it("deduplicates the days that overlapping windows report twice", () => {
    const day = { date: "2026-07-20", contributionCount: 5 };
    const history = normalize({
      profile: profileResponse({ days: [day] }),
      years: [yearResponse([day]), yearResponse([day])],
      fetchedAt: FETCHED_AT,
    });
    expect(history.totals.commits).toBe(5);
  });
});

describe("streaks", () => {
  it("counts a run that ends today", () => {
    const history = normalize({
      profile: profileResponse({ days: runOfDays(FETCHED_AT, 12, 2) }),
      fetchedAt: FETCHED_AT,
    });
    expect(history.streak).toEqual({
      current: 12,
      longest: 12,
      lastActiveDate: FETCHED_AT,
    });
  });

  it("does not break the streak on an empty today", () => {
    const days = runOfDays("2026-07-20", 5, 2);
    days.push({ date: FETCHED_AT, contributionCount: 0 });
    const history = normalize({ profile: profileResponse({ days }), fetchedAt: FETCHED_AT });
    expect(history.streak.current).toBe(5);
    expect(history.streak.lastActiveDate).toBe("2026-07-20");
  });

  it("breaks the streak once two days are empty", () => {
    const history = normalize({
      profile: profileResponse({ days: runOfDays("2026-07-19", 5, 2) }),
      fetchedAt: FETCHED_AT,
    });
    expect(history.streak.current).toBe(0);
    expect(history.streak.longest).toBe(5);
  });

  it("remembers the longest run from years ago", () => {
    const history = normalize({
      profile: profileResponse({ days: runOfDays(FETCHED_AT, 3, 1) }),
      years: [yearResponse(runOfDays("2021-09-30", 40, 1))],
      fetchedAt: FETCHED_AT,
    });
    expect(history.streak).toEqual({
      current: 3,
      longest: 40,
      lastActiveDate: FETCHED_AT,
    });
  });

  it("falls back to the creation date when the account never contributed", () => {
    const history = normalize({
      profile: profileResponse({ createdAt: "2023-01-09", days: [] }),
      fetchedAt: FETCHED_AT,
    });
    expect(history.streak).toEqual({
      current: 0,
      longest: 0,
      lastActiveDate: "2023-01-09",
    });
    expect(history.weeks).toEqual([]);
  });
});

describe("recent pull requests", () => {
  it("buckets additions and orders newest first", () => {
    const history = normalize({
      profile: profileResponse({
        mergedNodes: [
          { mergedAt: "2026-01-02T00:00:00Z", additions: 99 },
          { mergedAt: "2026-03-02T00:00:00Z", additions: 100 },
          { mergedAt: "2026-05-02T00:00:00Z", additions: 999 },
          { mergedAt: "2026-06-02T00:00:00Z", additions: 1000 },
        ],
      }),
      fetchedAt: FETCHED_AT,
    });
    expect(history.recentPRs).toEqual([
      { mergedAt: "2026-06-02", bucket: 3 },
      { mergedAt: "2026-05-02", bucket: 2 },
      { mergedAt: "2026-03-02", bucket: 2 },
      { mergedAt: "2026-01-02", bucket: 1 },
    ]);
  });

  it("drops null nodes and unmerged rows without failing the fetch", () => {
    const history = normalize({
      profile: profileResponse({
        mergedNodes: [null, { mergedAt: null, additions: 5 }, { mergedAt: "2026-06-02T00:00:00Z", additions: 5 }],
      }),
      fetchedAt: FETCHED_AT,
    });
    expect(history.recentPRs).toEqual([{ mergedAt: "2026-06-02", bucket: 1 }]);
  });

  it("keeps at most ten", () => {
    const nodes = Array.from({ length: 14 }, (_, i) => ({
      mergedAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      additions: 1,
    }));
    const history = normalize({
      profile: profileResponse({ mergedNodes: nodes }),
      fetchedAt: FETCHED_AT,
    });
    expect(history.recentPRs).toHaveLength(10);
    expect(history.recentPRs[0]!.mergedAt).toBe("2026-01-14");
  });
});

describe("languages", () => {
  it("sums bytes across repos and keeps the top five", () => {
    const lang = (name: string, size: number) => ({ size, node: { name } });
    const history = normalize({
      profile: profileResponse({
        repos: [
          { stargazerCount: 0, languages: { edges: [lang("TypeScript", 600), lang("CSS", 50)] } },
          { stargazerCount: 0, languages: { edges: [lang("TypeScript", 400), lang("Go", 300)] } },
          { stargazerCount: 0, languages: { edges: [lang("Rust", 200), lang("Nix", 100)] } },
          { stargazerCount: 0, languages: { edges: [lang("Zig", 90), lang("Awk", 10)] } },
        ],
      }),
      fetchedAt: FETCHED_AT,
    });
    expect(history.languages.map((l) => l.name)).toEqual([
      "TypeScript",
      "Go",
      "Rust",
      "Nix",
      "Zig",
    ]);
    // 1000 TypeScript bytes of 1750 counted, floored to four places.
    expect(history.languages[0]!.share).toBe(0.5714);
    expect(history.languages.reduce((sum, l) => sum + l.share, 0)).toBeLessThanOrEqual(1);
  });

  it("returns nothing when no repository reports a language", () => {
    const history = normalize({
      profile: profileResponse({ repos: [{ stargazerCount: 4, languages: null }] }),
      fetchedAt: FETCHED_AT,
    });
    expect(history.languages).toEqual([]);
    expect(history.totals.starsReceived).toBe(4);
  });
});

describe("bad input", () => {
  it("rejects a response missing a field the grammar reads", () => {
    expect(() => normalize({ profile: { user: { login: "x" } }, fetchedAt: FETCHED_AT })).toThrow(
      KodamaShapeError,
    );
  });

  it("rejects a fetchedAt that is not a civil date", () => {
    expect(() => normalize({ profile: profileResponse(), fetchedAt: "2026-07-21T00:00:00Z" })).toThrow(
      KodamaShapeError,
    );
  });

  it("rejects a calendar day that is not a real date", () => {
    expect(() =>
      normalize({
        profile: profileResponse({ days: [{ date: "2026-02-30", contributionCount: 1 }] }),
        fetchedAt: FETCHED_AT,
      }),
    ).toThrow(KodamaShapeError);
  });

  it("names the offending year response", () => {
    expect(() =>
      normalize({ profile: profileResponse(), years: [{}], fetchedAt: FETCHED_AT }),
    ).toThrow(/year response 0/);
  });
});

describe("the repo mix (v2)", () => {
  const mixOf = (repos: RepoInput[], login = "hana"): ReturnType<typeof normalize>["repoMix"] =>
    normalize({
      profile: profileResponse({ login, days: runOfDays(FETCHED_AT, 14, 2), repoMix: repos }),
      fetchedAt: FETCHED_AT,
    }).repoMix;

  it("reports nothing for an account with no commits anywhere", () => {
    expect(mixOf([])).toEqual({ hhi: 0, ownShare: 0, breadth: 0, orgs: 0, anchor: null });
  });

  it("scores a single repo as total concentration", () => {
    const mix = mixOf([{ nameWithOwner: "hana/only", commits: 40 }]);
    expect(mix.hhi).toBe(1);
    expect(mix.breadth).toBe(1);
    expect(mix.ownShare).toBe(1);
    expect(mix.orgs).toBe(0);
  });

  it("falls toward zero as commits scatter", () => {
    const scattered = Array.from({ length: 20 }, (_, i) => ({
      nameWithOwner: `org${String(i)}/repo`,
      commits: 30,
    }));
    const mix = mixOf(scattered);
    expect(mix.breadth).toBe(20);
    expect(mix.hhi).toBeCloseTo(1 / 20, 3);
    expect(mix.orgs).toBe(20);
    expect(mix.ownShare).toBe(0);
  });

  it("separates what the account owns from what it visits", () => {
    const mix = mixOf([
      { nameWithOwner: "hana/mine", commits: 75 },
      { nameWithOwner: "acme/theirs", commits: 25 },
    ]);
    expect(mix.ownShare).toBe(0.75);
    expect(mix.orgs).toBe(1);
    expect(mix.breadth).toBe(2);
  });

  it("matches ownership case-insensitively, as GitHub logins are", () => {
    expect(mixOf([{ nameWithOwner: "Hana/mine", commits: 40, owner: "HANA" }], "hana").ownShare).toBe(1);
  });

  describe("the anti-gaming filter (§7.4)", () => {
    it("ignores fifty repos with one commit each", () => {
      // The attack the filter exists for: an afternoon with a shell loop would
      // otherwise buy the broom silhouette outright.
      const drive_bys = Array.from({ length: 50 }, (_, i) => ({
        nameWithOwner: `hana/throwaway-${String(i)}`,
        commits: 1,
      }));
      const mix = mixOf([{ nameWithOwner: "hana/real", commits: 200 }, ...drive_bys]);
      expect(mix.breadth).toBe(1);
      expect(mix.hhi).toBe(1);
    });

    it("ignores forks, so clicking fork fifty times is the same non-event", () => {
      const mix = mixOf([
        { nameWithOwner: "hana/real", commits: 60 },
        { nameWithOwner: "hana/forked", commits: 900, isFork: true },
      ]);
      expect(mix.breadth).toBe(1);
      expect(mix.anchor?.nameWithOwner).toBe("hana/real");
    });

    it("counts a repo with volume in a single window", () => {
      expect(mixOf([{ nameWithOwner: "hana/a", commits: REPO_SUSTAINED_COMMITS }]).breadth).toBe(1);
    });

    it("does not count a repo that is under the commit floor", () => {
      expect(mixOf([{ nameWithOwner: "hana/a", commits: REPO_MIN_COMMITS - 1 }]).breadth).toBe(0);
    });

    it("counts a modest repo that shows up across two account years", () => {
      // Under the single-window volume bar, but sustained - which is the signal
      // the weekly-spread test would have caught if weekly data existed.
      const modest = [{ nameWithOwner: "acme/steady", commits: REPO_MIN_COMMITS }];
      const history = normalize({
        profile: profileResponse({ login: "hana", days: runOfDays("2025-01-10", 5, 1) }),
        years: [
          yearResponse(runOfDays("2025-01-10", 5, 1), 0, modest),
          yearResponse(runOfDays(FETCHED_AT, 5, 1), 0, modest),
        ],
        fetchedAt: FETCHED_AT,
      });
      expect(history.repoMix.breadth).toBe(1);
      expect(history.repoMix.orgs).toBe(1);
    });
  });

  describe("the anchor repo", () => {
    it("names the oldest owned repo still taking commits", () => {
      const mix = mixOf([
        { nameWithOwner: "hana/old", commits: 60, createdAt: "2015-06-01" },
        { nameWithOwner: "hana/newer", commits: 90, createdAt: "2023-06-01" },
      ]);
      expect(mix.anchor?.nameWithOwner).toBe("hana/old");
      expect(mix.anchor?.years).toBe(11);
      expect(mix.anchor?.share).toBe(0.4);
    });

    it("never names a repo the account does not own", () => {
      expect(mixOf([{ nameWithOwner: "acme/theirs", commits: 90, createdAt: "2010-01-01" }]).anchor).toBeNull();
    });

    it("never names a repo that has gone quiet", () => {
      // Commits only in the first of two windows: long-lived, but no longer a
      // living project, so there is no stone to grow over.
      const history = normalize({
        profile: profileResponse({ login: "hana", days: runOfDays("2025-01-10", 5, 1) }),
        years: [
          yearResponse(runOfDays("2025-01-10", 20, 3), 0, [
            { nameWithOwner: "hana/abandoned", commits: 60, createdAt: "2012-01-01" },
          ]),
          yearResponse(runOfDays(FETCHED_AT, 20, 3), 0, [
            { nameWithOwner: "hana/current", commits: 60, createdAt: "2024-01-01" },
          ]),
        ],
        fetchedAt: FETCHED_AT,
      });
      expect(history.repoMix.anchor?.nameWithOwner).toBe("hana/current");
    });
  });

  it("does not depend on the order the year windows arrive in", () => {
    // The contract on NormalizeInput says order does not matter, and `anchor`
    // reads recency from the calendar rather than from the array to keep it true.
    const early = yearResponse(runOfDays("2025-01-10", 20, 3), 0, [
      { nameWithOwner: "hana/older", commits: 60, createdAt: "2012-01-01" },
    ]);
    const late = yearResponse(runOfDays(FETCHED_AT, 20, 3), 0, [
      { nameWithOwner: "hana/newer", commits: 60, createdAt: "2024-01-01" },
    ]);
    const profile = profileResponse({ login: "hana", days: [] });

    const forwards = normalize({ profile, years: [early, late], fetchedAt: FETCHED_AT });
    const backwards = normalize({ profile, years: [late, early], fetchedAt: FETCHED_AT });
    expect(backwards.repoMix).toEqual(forwards.repoMix);
    expect(forwards.repoMix.anchor?.nameWithOwner).toBe("hana/newer");
  });

  it("holds the mathematical floor a Herfindahl index has to obey", () => {
    // hhi below 1/breadth would mean shares and breadth were counted over
    // different sets - the likeliest bug in this file.
    for (const count of [1, 2, 5, 17]) {
      const repos = Array.from({ length: count }, (_, i) => ({
        nameWithOwner: `hana/r${String(i)}`,
        // Every one clears the single-window volume bar, so breadth is the
        // count and the floor is being tested rather than the filter.
        commits: REPO_SUSTAINED_COMMITS + i * 7,
      }));
      const mix = mixOf(repos);
      expect(mix.breadth).toBe(count);
      expect(mix.hhi).toBeGreaterThanOrEqual(1 / count - 1e-3);
    }
  });
});
