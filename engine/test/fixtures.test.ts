import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizedHistorySchema } from "./history-schema.js";
import { assertHistory, KodamaSchemaError } from "../src/validate.js";
import { daysBetween, isoWeekOf, isoWeekStart } from "../src/date.js";
import { loadFixture, FIXTURE_NAMES, FIXTURE_ANCHOR_DATE } from "./helpers/fixtures.js";

describe("committed fixtures", () => {
  it("covers every fixture named in SPEC-ENGINE §7", () => {
    expect([...FIXTURE_NAMES].sort()).toEqual(
      [
        "awakening",
        "dormant",
        "ghost",
        "grinder",
        "maintainer",
        "newcomer",
        "spammer",
        "streak-broken",
        "veteran",
        "whale",
      ].sort(),
    );
  });

  for (const name of FIXTURE_NAMES) {
    describe(name, () => {
      const raw: unknown = JSON.parse(
        readFileSync(resolve(import.meta.dirname, `../fixtures/${name}.json`), "utf8"),
      );

      it("validates against the zod schema", () => {
        const result = normalizedHistorySchema.safeParse(raw);
        expect(result.error?.issues ?? []).toEqual([]);
        expect(result.success).toBe(true);
      });

      it("round-trips through the runtime guard byte-identically", () => {
        const guarded = assertHistory(raw);
        const reguarded = assertHistory(JSON.parse(JSON.stringify(guarded)));
        expect(reguarded).toEqual(guarded);
      });

      it("agrees with the zod schema on acceptance", () => {
        // The two validators are independent implementations of §2; if they
        // ever disagree, one of them has drifted from the spec.
        expect(() => assertHistory(raw)).not.toThrow();
        expect(normalizedHistorySchema.safeParse(raw).success).toBe(true);
      });

      it("has no activity dated after the anchor date", () => {
        const history = loadFixture(name);
        for (const week of history.weeks) {
          expect(daysBetween(isoWeekStart(week.w), FIXTURE_ANCHOR_DATE)).toBeGreaterThanOrEqual(-6);
        }
        for (const pr of history.recentPRs) {
          expect(daysBetween(pr.mergedAt, FIXTURE_ANCHOR_DATE)).toBeGreaterThanOrEqual(0);
        }
      });

      it("has weeks consistent with its own commit total", () => {
        const history = loadFixture(name);
        const summed = history.weeks.reduce((total, week) => total + week.c, 0);
        expect(summed).toBe(history.totals.commits);
      });
    });
  }
});

describe("the spammer fixture proves the daily cap contract (D-010)", () => {
  const spammer = loadFixture("spammer");

  it("stores a capped total, not the raw 5 000 commits", () => {
    // 5 000 commits pushed across seven days normalizes to 7 x 30 = 210.
    expect(spammer.totals.commits).toBe(210);
  });

  it("never records a week above seven capped days", () => {
    for (const week of spammer.weeks) {
      expect(week.c).toBeLessThanOrEqual(7 * 30);
    }
  });

  it("reads as roughly one strong week, not a decade of work", () => {
    const grinder = loadFixture("grinder");
    // The point of the cap: a burst cannot out-grow sustained activity.
    expect(spammer.totals.commits).toBeLessThan(grinder.totals.commits);
  });
});

describe("the whale fixture stays inside the cap ceiling", () => {
  const whale = loadFixture("whale");

  it("cannot exceed 30 commits per elapsed day", () => {
    const span = daysBetween(whale.createdAt, whale.fetchedAt) + 1;
    expect(whale.totals.commits).toBeLessThanOrEqual(span * 30);
  });

  it("still represents a decade of dense activity", () => {
    expect(whale.weeks.length).toBeGreaterThan(500);
    expect(whale.totals.commits).toBeGreaterThan(100_000);
  });
});

describe("the guard rejects what the renderer cannot index", () => {
  const base = loadFixture("newcomer");

  it.each([1, 3])("refuses version %i and reports which it was", (version) => {
    // v1 is not a historical curiosity: it is every history cached before form
    // shipped. Reporting the version is what lets the service purge the entry
    // and refetch, rather than render a tree from a repo mix nobody measured.
    const error = (() => {
      try {
        assertHistory({ ...base, v: version });
        return null;
      } catch (e) {
        return e as KodamaSchemaError;
      }
    })();
    expect(error).toBeInstanceOf(KodamaSchemaError);
    expect(error?.version).toBe(version);
  });

  it.each([
    ["a missing repo mix", { ...base, repoMix: undefined }],
    ["a non-object repo mix", { ...base, repoMix: 3 }],
    ["an hhi above 1", { ...base, repoMix: { ...base.repoMix, hhi: 1.2 } }],
    ["a negative own share", { ...base, repoMix: { ...base.repoMix, ownShare: -0.1 } }],
    ["a fractional breadth", { ...base, repoMix: { ...base.repoMix, breadth: 2.5 } }],
    ["more owners than repos", { ...base, repoMix: { ...base.repoMix, breadth: 1, orgs: 2 } }],
    [
      "an anchor without an owner",
      { ...base, repoMix: { ...base.repoMix, anchor: { nameWithOwner: "solo", years: 1, share: 1 } } },
    ],
    [
      "an anchor share above 1",
      {
        ...base,
        repoMix: {
          ...base.repoMix,
          anchor: { nameWithOwner: "a/b", years: 1, share: 1.5 },
        },
      },
    ],
  ])("rejects %s", (_label, payload) => {
    expect(() => assertHistory(payload)).toThrow(KodamaSchemaError);
  });

  it.each([
    ["a missing version", { ...base, v: undefined }],
    ["a non-object payload", "not a history"],
    ["a malformed date", { ...base, createdAt: "2026-13-45" }],
    ["a malformed week label", { ...base, weeks: [{ w: "2026-29", c: 3 }] }],
    ["a negative total", { ...base, totals: { ...base.totals, commits: -1 } }],
    ["a fractional total", { ...base, totals: { ...base.totals, reviews: 1.5 } }],
    ["a bad PR bucket", { ...base, recentPRs: [{ mergedAt: "2026-07-01", bucket: 4 }] }],
    ["language shares above 1", { ...base, languages: [{ name: "C", share: 0.8 }, { name: "D", share: 0.8 }] }],
    ["a current streak beyond the longest", { ...base, streak: { ...base.streak, current: 999, longest: 5 } }],
  ])("rejects %s", (_label, payload) => {
    expect(() => assertHistory(payload)).toThrow(KodamaSchemaError);
  });

  it.each([
    ["an empty login", { ...base, login: "" }],
    ["a non-string login", { ...base, login: 42 }],
    ["a non-array weeks list", { ...base, weeks: "many" }],
    ["a non-object week", { ...base, weeks: ["2026-W29"] }],
    ["a non-object totals", { ...base, totals: 7 }],
    ["a non-object streak", { ...base, streak: null }],
    ["a non-array recentPRs", { ...base, recentPRs: {} }],
    ["a non-object PR", { ...base, recentPRs: ["yesterday"] }],
    ["a non-array languages", { ...base, languages: "TypeScript" }],
    ["a non-object language", { ...base, languages: ["TypeScript"] }],
    ["a negative language share", { ...base, languages: [{ name: "C", share: -0.2 }] }],
    ["a NaN total", { ...base, totals: { ...base.totals, commits: Number.NaN } }],
    ["an infinite total", { ...base, totals: { ...base.totals, commits: Number.POSITIVE_INFINITY } }],
    ["an array payload", [1, 2, 3]],
    ["null", null],
  ])("rejects %s", (_label, payload) => {
    expect(() => assertHistory(payload)).toThrow(KodamaSchemaError);
  });

  it("reports no version for an unrecognisable payload", () => {
    try {
      assertHistory({ v: "one" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as KodamaSchemaError).version).toBeUndefined();
    }
  });
});

describe("week labels round-trip through the date layer", () => {
  it("maps every fixture week back to its own label", () => {
    for (const name of FIXTURE_NAMES) {
      for (const week of loadFixture(name).weeks) {
        expect(isoWeekOf(isoWeekStart(week.w))).toBe(week.w);
      }
    }
  });
});
