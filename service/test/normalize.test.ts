import { assertHistoryV1, isoWeekOf, treeFacts } from "@kodama/engine";
import { describe, expect, it } from "vitest";

import { DAILY_COMMIT_CAP, KodamaShapeError, normalize } from "../src/normalize.js";
import { profileResponse, runOfDays, yearResponse } from "./helpers/responses.js";

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
      assertHistoryV1(history);
    }).not.toThrow();
    expect(history.v).toBe(1);
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
