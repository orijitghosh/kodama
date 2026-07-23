import { describe, expect, it } from "vitest";
import {
  bareBranchRatioFor,
  GU_PER_LEVEL,
  growthUnits,
  isAwakening,
  isDormant,
  maturityFor,
  padDensityFor,
  potTierFor,
  seasonFor,
  seasonalEventsFor,
  spiritFor,
  treeFacts,
  trunkGirthFor,
  visitorsFor,
  weatherFor,
} from "../src/facts.js";
import { addDays, isoWeekOf } from "../src/date.js";
import { KodamaDateError } from "../src/date.js";
import type { NormalizedHistory } from "../src/types.js";
import { allFixtures, FIXTURE_ANCHOR_DATE, loadFixture } from "./helpers/fixtures.js";
import { historyWith, weeksEndingAt } from "./helpers/history.js";

const TODAY = FIXTURE_ANCHOR_DATE;

describe("growth units and maturity", () => {
  it("scores an empty history at zero", () => {
    expect(growthUnits(historyWith({ weeks: [] }))).toBe(0);
  });

  it("gives a week diminishing returns", () => {
    // Ten times the commits is nowhere near ten times the growth: this is the
    // whole defence against the green-wall grind (D-010).
    const small = growthUnits(historyWith({ weeks: [{ w: "2026-W20", c: 10 }] }));
    const large = growthUnits(historyWith({ weeks: [{ w: "2026-W20", c: 100 }] }));
    expect(large / small).toBeLessThan(2);
  });

  it("rewards breadth of weeks over depth in one week", () => {
    const oneBigWeek = growthUnits(historyWith({ weeks: [{ w: "2026-W20", c: 140 }] }));
    const sevenSteadyWeeks = growthUnits(
      historyWith({ weeks: weeksEndingAt("2026-W20", 7, 20) }),
    );
    expect(sevenSteadyWeeks).toBeGreaterThan(oneBigWeek);
  });

  it.each([
    [0, 3],
    [GU_PER_LEVEL - 0.001, 3],
    [GU_PER_LEVEL, 4],
    [GU_PER_LEVEL * 2, 5],
    [GU_PER_LEVEL * 10, 13],
    [GU_PER_LEVEL * 50, 13],
  ])("maps %f growth units to level %i", (gu, level) => {
    expect(maturityFor(gu)).toBe(level);
  });

  it("never leaves the 3..13 range", () => {
    for (let gu = 0; gu < GU_PER_LEVEL * 20; gu += 37) {
      const level = maturityFor(gu);
      expect(level).toBeGreaterThanOrEqual(3);
      expect(level).toBeLessThanOrEqual(13);
    }
  });

  it("never decreases as growth accumulates", () => {
    let previous = 0;
    for (let gu = 0; gu < GU_PER_LEVEL * 15; gu += 13) {
      const level = maturityFor(gu);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });
});

describe("the maturity ladder is actually used (D-016)", () => {
  it("spreads the fixtures across at least four distinct levels", () => {
    // The regression this guards: with the original divisor of 40, every
    // fixture past about eight months pinned to 13 and the ladder was dead.
    const levels = new Set(
      allFixtures().map(([, history]) => treeFacts(history, TODAY).maturity),
    );
    expect(levels.size).toBeGreaterThanOrEqual(4);
  });

  it("keeps the decade whale above the two-year grinder", () => {
    const whale = treeFacts(loadFixture("whale"), TODAY);
    const grinder = treeFacts(loadFixture("grinder"), TODAY);
    expect(whale.maturity).toBeGreaterThan(grinder.maturity);
  });

  it("starts a brand-new account at the floor", () => {
    expect(treeFacts(loadFixture("ghost"), TODAY).maturity).toBe(3);
    expect(treeFacts(loadFixture("newcomer"), TODAY).maturity).toBe(3);
  });
});

describe("pad density", () => {
  it("stays within 4..9", () => {
    for (let gu = 0; gu < GU_PER_LEVEL * 12; gu += 7) {
      const density = padDensityFor(gu, maturityFor(gu));
      expect(density).toBeGreaterThanOrEqual(4);
      expect(density).toBeLessThanOrEqual(9);
    }
  });

  it("rises with growth inside a level", () => {
    const low = padDensityFor(10, 3);
    const high = padDensityFor(GU_PER_LEVEL - 10, 3);
    expect(high).toBeGreaterThan(low);
  });

  it("pins to the maximum once the tree tops out", () => {
    expect(padDensityFor(GU_PER_LEVEL * 10 + 5, 13)).toBe(9);
    expect(padDensityFor(GU_PER_LEVEL * 99, 13)).toBe(9);
  });
});

describe("trunk girth and pot tier", () => {
  it("thickens with age and then stops", () => {
    expect(trunkGirthFor(0)).toBeCloseTo(8, 5);
    expect(trunkGirthFor(1)).toBeCloseTo(12.4, 5);
    expect(trunkGirthFor(100)).toBe(26);
  });

  it("never returns a negative girth for a same-day account", () => {
    expect(trunkGirthFor(-1)).toBe(8);
  });

  it("holds steady between birthdays (D-018)", () => {
    // Girth sets the stroke width of every branch, so a continuously varying
    // age would redraw the whole skeleton daily by an invisible amount and
    // break the day-to-day stability the product promises.
    const created = "2016-03-10";
    const girthOn = (date: string): number =>
      treeFacts(historyWith({ createdAt: created }), date).trunkGirth;
    expect(girthOn("2026-06-01")).toBe(girthOn("2026-06-02"));
    expect(girthOn("2026-03-09")).toBeLessThan(girthOn("2026-03-10"));
  });

  it.each([
    [0, "plastic"],
    [0.99, "plastic"],
    [1, "clay"],
    [2, "clay"],
    [3, "glazed"],
    [5, "glazed"],
    [6, "antique"],
    [9, "antique"],
    [10, "stone"],
    [40, "stone"],
  ])("puts a %f-year account in a %s pot", (years, tier) => {
    expect(potTierFor(Math.floor(years))).toBe(tier);
  });
});

describe("seasons", () => {
  it.each([
    ["2026-03-01", "spring"],
    ["2026-05-31", "spring"],
    ["2026-06-01", "summer"],
    ["2026-08-31", "summer"],
    ["2026-09-01", "autumn"],
    ["2026-11-30", "autumn"],
    ["2026-12-01", "winter"],
    ["2026-02-28", "winter"],
    ["2024-02-29", "winter"],
  ])("puts %s in %s", (date, season) => {
    expect(seasonFor(date)).toBe(season);
  });
});

describe("seasonal events", () => {
  const kinds = (date: string): string[] => seasonalEventsFor(date).map((e) => e.kind);

  it.each([
    ["2026-03-31", []],
    ["2026-04-01", ["hanami"]],
    ["2026-04-07", ["hanami"]],
    ["2026-04-08", []],
    ["2026-10-14", []],
    ["2026-10-15", ["harvest"]],
    ["2026-10-21", ["harvest"]],
    ["2026-10-22", []],
    ["2026-11-30", []],
    ["2026-12-01", ["firstSnow"]],
    ["2026-12-03", ["firstSnow"]],
    ["2026-12-04", ["settledSnow"]],
    ["2026-12-31", ["settledSnow"]],
    ["2026-01-15", ["settledSnow"]],
    ["2026-02-28", ["settledSnow"]],
    ["2026-03-01", []],
  ])("resolves %s to %j", (date, expected) => {
    expect(kinds(date)).toEqual(expected);
  });

  it("thins the canopy only under settled snow", () => {
    expect(bareBranchRatioFor(seasonalEventsFor("2026-01-15"))).toBe(0.4);
    expect(bareBranchRatioFor(seasonalEventsFor("2026-12-02"))).toBe(0);
    expect(bareBranchRatioFor(seasonalEventsFor("2026-07-15"))).toBe(0);
  });
});

describe("weather", () => {
  function indexOf(entries: Array<[string, number]>): Map<string, number> {
    return new Map(entries);
  }

  /** Builds a week index with a given steady rate, then a recent rate. */
  function ramp(baselinePerWeek: number, recentPerWeek: number): Map<string, number> {
    const entries: Array<[string, number]> = [];
    for (let i = 1; i <= 4; i += 1) {
      entries.push([isoWeekOf(addDays(TODAY, -7 * i)), recentPerWeek]);
    }
    for (let i = 5; i <= 30; i += 1) {
      entries.push([isoWeekOf(addDays(TODAY, -7 * i)), baselinePerWeek]);
    }
    return indexOf(entries);
  }

  it("greets a young account with sun regardless of volume", () => {
    expect(weatherFor(ramp(100, 0), TODAY, 30)).toBe("sun");
    expect(weatherFor(ramp(0, 0), TODAY, 89)).toBe("sun");
  });

  it("shines when the user is above their own baseline", () => {
    expect(weatherFor(ramp(10, 40), TODAY, 500)).toBe("sun");
  });

  it("stays calm when the user holds their pace", () => {
    expect(weatherFor(ramp(20, 20), TODAY, 500)).toBe("calm");
  });

  it("clouds over when the user drops well below their pace", () => {
    expect(weatherFor(ramp(40, 4), TODAY, 500)).toBe("overcast");
  });

  it("does not punish a low-volume account with a steady pace", () => {
    // The baseline is personal, so two commits a week is a sunny life if that
    // is the life this account leads.
    expect(weatherFor(ramp(2, 3), TODAY, 900)).toBe("sun");
    expect(weatherFor(ramp(2, 2), TODAY, 900)).toBe("calm");
  });

  it("gives a clear sky to an account with no baseline at all", () => {
    // Overcast means "below your own pace". Someone who never set a pace has
    // not fallen behind it, and greeting an empty account with bad weather is
    // exactly the embarrassment the ghost fixture exists to prevent.
    expect(weatherFor(new Map(), TODAY, 900)).toBe("sun");
  });
});

describe("dormancy and awakening", () => {
  const lastActive = (daysAgo: number): NormalizedHistory =>
    historyWith({
      weeks: weeksEndingAt(isoWeekOf(addDays(TODAY, -daysAgo)), 5, 10),
      streak: { current: 0, longest: 20, lastActiveDate: addDays(TODAY, -daysAgo) },
    });

  it.each([
    [89, false],
    [90, false],
    [91, true],
    [400, true],
  ])("after %i days of silence dormancy is %s", (days, dormant) => {
    expect(isDormant(lastActive(days), TODAY)).toBe(dormant);
  });

  it("never calls a brand-new empty account dormant", () => {
    // A ghost has no activity to be absent from; it is a sprout, not a
    // sleeper.
    expect(isDormant(loadFixture("ghost"), TODAY)).toBe(false);
  });

  it("recognises a return after a long silence", () => {
    expect(isAwakening(loadFixture("awakening"), TODAY)).toBe(true);
  });

  it("does not call a steady committer awakening", () => {
    expect(isAwakening(loadFixture("grinder"), TODAY)).toBe(false);
  });

  it("stops reading as awakening after a week back", () => {
    const history = loadFixture("awakening");
    expect(isAwakening(history, addDays(history.streak.lastActiveDate, 8))).toBe(false);
  });

  it("suppresses weather while the tree rests", () => {
    expect(treeFacts(loadFixture("dormant"), TODAY).weather).toBe("calm");
    expect(treeFacts(loadFixture("dormant"), TODAY).dormant).toBe(true);
  });
});

describe("ornaments", () => {
  const ornamentsOf = (history: NormalizedHistory, date = TODAY) =>
    treeFacts(history, date).ornaments;

  describe("shoots", () => {
    it.each([
      [0, 0],
      [1, 1],
      [3, 2],
      [7, 3],
      [1000, 6],
    ])("shows %i commits this week as %i shoots", (commits, shoots) => {
      const history = historyWith({ weeks: [{ w: isoWeekOf(TODAY), c: commits }] });
      expect(ornamentsOf(history).shoots).toBe(shoots);
    });
  });

  describe("fruit", () => {
    it("ripens over three days and then holds", () => {
      const at = (daysAgo: number): number => {
        const history = historyWith({
          recentPRs: [{ mergedAt: addDays(TODAY, -daysAgo), bucket: 2 }],
        });
        return ornamentsOf(history).fruit[0]!.ripeness;
      };
      expect(at(0)).toBe(0);
      expect(at(1)).toBeCloseTo(1 / 3, 5);
      expect(at(3)).toBe(1);
      expect(at(20)).toBe(1);
    });

    it("drops off the tree after thirty days", () => {
      const history = historyWith({
        recentPRs: [
          { mergedAt: addDays(TODAY, -30), bucket: 1 },
          { mergedAt: addDays(TODAY, -31), bucket: 1 },
        ],
      });
      expect(ornamentsOf(history).fruit).toHaveLength(1);
    });

    it("ignores a pull request merged in the future", () => {
      const history = historyWith({
        recentPRs: [{ mergedAt: addDays(TODAY, 3), bucket: 1 }],
      });
      expect(ornamentsOf(history).fruit).toHaveLength(0);
    });

    it("caps at ten", () => {
      const history = historyWith({
        recentPRs: Array.from({ length: 10 }, (_, i) => ({
          mergedAt: addDays(TODAY, -i),
          bucket: 1 as const,
        })),
      });
      expect(ornamentsOf(history).fruit.length).toBeLessThanOrEqual(10);
    });
  });

  describe("counts and caps", () => {
    it.each([
      [0, 0],
      [1, 1],
      [2, 2],
      [4, 4],
      [99, 4],
    ])("shows %i open PRs as %i unripe fruit", (open, unripe) => {
      expect(ornamentsOf(historyWith({ totals: { prsOpen: open } })).unripeFruit).toBe(unripe);
    });

    it.each([
      [0, 0],
      [1, 1],
      [3, 2],
      [128, 7],
      [100000, 7],
    ])("shows %i reviews as %i lanterns", (reviews, lanterns) => {
      expect(ornamentsOf(historyWith({ totals: { reviews } })).lanterns).toBe(lanterns);
    });

    it.each([
      [0, 0],
      [9, 3],
      [999, 9],
      [128000, 12],
      [10_000_000, 12],
    ])("shows %i stars as %i fireflies", (stars, fireflies) => {
      expect(ornamentsOf(historyWith({ totals: { starsReceived: stars } })).fireflies).toBe(
        fireflies,
      );
    });

    it.each([
      [0, "none"],
      [49, "none"],
      [50, "perched"],
      [249, "perched"],
      [250, "nesting"],
    ])("shows %i closed issues as a %s bird", (issues, bird) => {
      expect(ornamentsOf(historyWith({ totals: { issuesClosed: issues } })).bird).toBe(bird);
    });

    it.each([
      [24, false],
      [25, true],
    ])("shows %i discussions as chime=%s", (discussions, chime) => {
      expect(ornamentsOf(historyWith({ totals: { discussions } })).windChime).toBe(chime);
    });
  });

  describe("blossoms", () => {
    it.each([
      [0, 0],
      [13, 0],
      [14, 1],
      [29, 1],
      [30, 2],
      [60, 3],
      [90, 4],
      [900, 4],
    ])("shows a %i-day streak as %i clusters", (current, clusters) => {
      const history = historyWith({
        streak: { current, longest: Math.max(current, 1), lastActiveDate: TODAY },
      });
      expect(ornamentsOf(history).blossomClusters).toBe(clusters);
    });
  });

  describe("falling petals after a break", () => {
    const broken = (gapDays: number, longest = 214): NormalizedHistory =>
      historyWith({
        streak: { current: 0, longest, lastActiveDate: addDays(TODAY, -gapDays) },
      });

    it.each([
      [1, 0],
      [2, 3],
      [5, 3],
      [8, 3],
      [9, 0],
      [40, 0],
    ])("shows a %i-day gap as %i petals", (gap, petals) => {
      expect(ornamentsOf(broken(gap)).fallingPetals).toBe(petals);
    });

    it("does not mourn a streak that was never meaningful", () => {
      expect(ornamentsOf(broken(3, 5)).fallingPetals).toBe(0);
    });

    it("keeps the tree otherwise intact through a break", () => {
      // Gentle by design: a break costs petals and nothing else.
      const before = treeFacts(historyWith({ streak: { current: 30, longest: 214, lastActiveDate: TODAY } }), TODAY);
      const after = treeFacts(broken(3), TODAY);
      expect(after.maturity).toBe(before.maturity);
      expect(after.ornaments.lanterns).toBe(before.ornaments.lanterns);
      expect(after.potTier).toBe(before.potTier);
    });
  });

  it("presses a record streak into the soil permanently", () => {
    expect(ornamentsOf(historyWith({ streak: { current: 0, longest: 99, lastActiveDate: TODAY } })).soilPetalRing).toBe(false);
    expect(ornamentsOf(historyWith({ streak: { current: 0, longest: 100, lastActiveDate: TODAY } })).soilPetalRing).toBe(true);
  });
});

describe("plaques", () => {
  const kindsOf = (history: NormalizedHistory): string[] =>
    treeFacts(history, TODAY).plaques.map((p) => p.kind);

  it("engraves nothing for a small account", () => {
    expect(kindsOf(historyWith({ totals: { commits: 999, prsMerged: 99 } }))).toEqual([]);
  });

  it.each([
    [1000, ["commits1k"]],
    [10000, ["commits1k", "commits10k"]],
  ])("engraves %i commits as %j", (commits, expected) => {
    const history = historyWith({
      weeks: weeksEndingAt(isoWeekOf(TODAY), 60, Math.ceil(commits / 60)),
      totals: { commits },
    });
    expect(kindsOf(history)).toEqual(expected);
  });

  it("engraves a hundred merged pull requests without inventing a date", () => {
    const history = historyWith({ totals: { prsMerged: 100 } });
    const plaque = treeFacts(history, TODAY).plaques.find((p) => p.kind === "prs100");
    expect(plaque).toBeDefined();
    // v1 keeps ten PRs; the crossing date is unknowable, and saying so is the
    // honest option (D-015).
    expect(plaque?.earnedAt).toBeNull();
  });

  it("dates a commit plaque to the week the threshold was crossed", () => {
    const history = historyWith({
      weeks: weeksEndingAt(isoWeekOf(TODAY), 10, 200),
      totals: { commits: 2000 },
    });
    const plaque = treeFacts(history, TODAY).plaques.find((p) => p.kind === "commits1k");
    expect(plaque?.earnedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("engraves the decade only once the account is ten", () => {
    const nearly = historyWith({ createdAt: addDays(TODAY, -365 * 10 + 30) });
    const decade = historyWith({ createdAt: addDays(TODAY, -365 * 10 - 30) });
    expect(kindsOf(nearly)).not.toContain("decade");
    expect(kindsOf(decade)).toContain("decade");
  });

  it("never shows more than four", () => {
    const history = historyWith({
      createdAt: addDays(TODAY, -365 * 12),
      weeks: weeksEndingAt(isoWeekOf(TODAY), 200, 100),
      totals: { commits: 20000, prsMerged: 500 },
    });
    expect(treeFacts(history, TODAY).plaques.length).toBeLessThanOrEqual(4);
  });

  it("never removes a plaque once earned", () => {
    // The pot is a trophy shelf that never resets (PRD Tier 2).
    const history = historyWith({
      weeks: weeksEndingAt(isoWeekOf(addDays(TODAY, -400)), 60, 30),
      totals: { commits: 1800 },
      streak: { current: 0, longest: 3, lastActiveDate: addDays(TODAY, -400) },
    });
    expect(kindsOf(history)).toContain("commits1k");
    expect(
      treeFacts(history, addDays(TODAY, 900)).plaques.map((p) => p.kind),
    ).toContain("commits1k");
  });
});

describe("the spirit only appears for triggers the schema can prove", () => {
  it("appears on an account anniversary", () => {
    const history = historyWith({ createdAt: "2019-07-15" });
    expect(spiritFor(history, "2026-07-15", 7)).toBe("anniversary");
    expect(spiritFor(history, "2026-07-16", 7)).toBeNull();
  });

  it("does not celebrate an account's first day as an anniversary", () => {
    const history = historyWith({ createdAt: "2026-07-15" });
    expect(spiritFor(history, "2026-07-15", 0)).toBeNull();
  });

  it("appears while a personal record streak stands", () => {
    const record = historyWith({
      streak: { current: 30, longest: 30, lastActiveDate: TODAY },
    });
    expect(spiritFor(record, TODAY, 2)).toBe("streakRecord");
  });

  it("does not appear for a short record or a beaten one", () => {
    expect(
      spiritFor(historyWith({ streak: { current: 29, longest: 29, lastActiveDate: TODAY } }), TODAY, 2),
    ).toBeNull();
    expect(
      spiritFor(historyWith({ streak: { current: 40, longest: 90, lastActiveDate: TODAY } }), TODAY, 2),
    ).toBeNull();
  });

  it("appears the week a commit milestone is crossed, and not after", () => {
    const history = historyWith({
      weeks: weeksEndingAt(isoWeekOf(TODAY), 4, 30),
      totals: { commits: 120 },
      streak: { current: 1, longest: 1, lastActiveDate: TODAY },
    });
    expect(spiritFor(history, TODAY, 2)).toBe("commits100");
    expect(spiritFor(history, addDays(TODAY, 21), 2)).toBeNull();
  });

  it("cannot be summoned by an account that has not earned it", () => {
    expect(spiritFor(loadFixture("newcomer"), TODAY, 0)).toBeNull();
    expect(spiritFor(loadFixture("ghost"), TODAY, 0)).toBeNull();
  });
});

describe("visitors", () => {
  it.each([
    [999, []],
    [1000, ["fox"]],
    [4999, ["fox"]],
    [5000, ["fox", "koi"]],
  ])("brings %i stars as %j", (stars, expected) => {
    const history = historyWith({ totals: { starsReceived: stars } });
    expect(visitorsFor(history, TODAY, 2)).toEqual(expected);
  });

  it("brings the crane only during the anniversary week of a decade account", () => {
    const history = historyWith({ createdAt: "2014-07-15" });
    expect(visitorsFor(history, "2026-07-15", 12)).toContain("crane");
    expect(visitorsFor(history, "2026-07-21", 12)).toContain("crane");
    expect(visitorsFor(history, "2026-07-22", 12)).not.toContain("crane");
    expect(visitorsFor(history, "2026-01-05", 12)).not.toContain("crane");
  });

  it("does not bring the crane to a young account", () => {
    expect(visitorsFor(historyWith({ createdAt: "2024-07-15" }), "2026-07-15", 2)).not.toContain(
      "crane",
    );
  });
});

describe("treeFacts as a whole", () => {
  it("is pure: the same inputs give a deeply equal result", () => {
    for (const [, history] of allFixtures()) {
      expect(treeFacts(history, TODAY)).toEqual(treeFacts(history, TODAY));
    }
  });

  it("rejects a malformed date rather than producing NaN geometry", () => {
    expect(() => treeFacts(loadFixture("grinder"), "not-a-date")).toThrow(KodamaDateError);
    expect(() => treeFacts(loadFixture("grinder"), "2026-02-30")).toThrow(KodamaDateError);
  });

  it("produces no NaN or Infinity anywhere, for any fixture", () => {
    for (const [name, history] of allFixtures()) {
      const json = JSON.stringify(treeFacts(history, TODAY));
      expect(json, name).not.toMatch(/NaN|Infinity|null,"maturity"/);
    }
  });

  it("gives the ghost a dignified, non-empty biography", () => {
    // "Zero-contribution account gets a charming sprout, not an embarrassment."
    const facts = treeFacts(loadFixture("ghost"), TODAY);
    expect(facts.maturity).toBe(3);
    expect(facts.potTier).toBe("plastic");
    expect(facts.dormant).toBe(false);
    expect(facts.weather).toBe("sun");
  });

  it("keeps the whale composed rather than off the chart", () => {
    const facts = treeFacts(loadFixture("whale"), TODAY);
    expect(facts.maturity).toBe(13);
    expect(facts.trunkGirth).toBeLessThanOrEqual(26);
    expect(facts.ornaments.fireflies).toBeLessThanOrEqual(12);
    expect(facts.ornaments.lanterns).toBeLessThanOrEqual(7);
  });

  it("reads a burst of 5 000 commits as one strong week", () => {
    const spammer = treeFacts(loadFixture("spammer"), TODAY);
    const grinder = treeFacts(loadFixture("grinder"), TODAY);
    expect(spammer.maturity).toBeLessThanOrEqual(grinder.maturity);
  });
});

describe("element monotonicity (D-005)", () => {
  it("never shrinks pads or ornaments when activity is appended", () => {
    const base = loadFixture("grinder");
    const before = treeFacts(base, TODAY);

    const grown = historyWith({
      ...base,
      weeks: [...base.weeks],
      totals: {
        ...base.totals,
        commits: base.totals.commits + 500,
        reviews: base.totals.reviews + 40,
        issuesClosed: base.totals.issuesClosed + 300,
        starsReceived: base.totals.starsReceived + 5000,
        prsOpen: base.totals.prsOpen + 2,
      },
    });
    const after = treeFacts(grown, TODAY);

    expect(after.maturity).toBeGreaterThanOrEqual(before.maturity);
    expect(after.ornaments.lanterns).toBeGreaterThanOrEqual(before.ornaments.lanterns);
    expect(after.ornaments.fireflies).toBeGreaterThanOrEqual(before.ornaments.fireflies);
    expect(after.ornaments.unripeFruit).toBeGreaterThanOrEqual(before.ornaments.unripeFruit);
    expect(after.plaques.length).toBeGreaterThanOrEqual(before.plaques.length);
  });

  it("never shrinks maturity as weeks accumulate", () => {
    let previous = 0;
    const weeks = [];
    for (let i = 0; i < 300; i += 1) {
      weeks.push({ w: isoWeekOf(addDays("2018-01-01", i * 7)), c: 40 });
      const level = treeFacts(historyWith({ weeks: [...weeks] }), TODAY).maturity;
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });
});
