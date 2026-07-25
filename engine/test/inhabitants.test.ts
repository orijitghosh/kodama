/**
 * The inhabitant rule table (SPEC-ENGINE §3.4) at its boundaries.
 *
 * Inhabitants carry more product weight than their size suggests: the bird is
 * the only element that rewards triage, the wind chime the only one that
 * rewards discussion, and falling petals the only element in the whole grammar
 * that responds to absence. Each threshold is asserted on both sides.
 */

import { describe, expect, it } from "vitest";
import { drawInhabitants } from "../src/biomes/bonsai.js";
import { treeFacts } from "../src/facts.js";
import { seedFromLogin } from "../src/rng.js";
import { buildSkeleton } from "../src/skeleton.js";
import { speciesByName } from "../src/species.js";
import { themeByName } from "../src/themes.js";
import type { Detail } from "../src/biomes/bonsai.js";
import type { NormalizedHistory, ThemeName } from "../src/types.js";
import { addDays } from "../src/date.js";
import { FIXTURE_ANCHOR_DATE } from "./helpers/fixtures.js";
import { historyWith } from "./helpers/history.js";

const DATE = FIXTURE_ANCHOR_DATE;

function inhabitantsFor(
  history: NormalizedHistory,
  { theme = "ink", detail = "full" }: { theme?: ThemeName; detail?: Detail } = {},
): string {
  const facts = treeFacts(history, DATE);
  const seed = seedFromLogin(facts.login);
  const skeleton = buildSkeleton(seed, facts.maturity);
  return drawInhabitants(skeleton, facts, themeByName(theme), speciesByName("classic"), seed, detail);
}

function countClass(svg: string, className: string): number {
  return svg.split(`class="${className}"`).length - 1;
}

// ---------------------------------------------------------------------------
// Bird: perched at issuesClosed >= 50, nesting at >= 250
// ---------------------------------------------------------------------------

describe("bird", () => {
  it.each([
    [49, "none"],
    [50, "perched"],
    [249, "perched"],
    [250, "nesting"],
  ])("at %i closed issues is %s", (issuesClosed, expected) => {
    expect(treeFacts(historyWith({ totals: { issuesClosed } }), DATE).ornaments.bird).toBe(expected);
  });

  it("draws at most one, whatever the count", () => {
    const svg = inhabitantsFor(historyWith({ totals: { issuesClosed: 5000 } }));
    expect(countClass(svg, "kd-bird kd-bird-nesting")).toBe(1);
    // One group, not one mention: the class itself names "kd-bird" twice.
    expect(svg.split('<g class="kd-bird').length - 1).toBe(1);
  });

  it("adds a nest only for the nesting variant", () => {
    expect(inhabitantsFor(historyWith({ totals: { issuesClosed: 50 } }))).toContain("kd-bird-perched");
    expect(inhabitantsFor(historyWith({ totals: { issuesClosed: 250 } }))).toContain("kd-bird-nesting");
  });

  it("is absent below the threshold", () => {
    expect(inhabitantsFor(historyWith({ totals: { issuesClosed: 49 } }))).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Fireflies: round(3 * log10(1 + stars)), cap 12, night themes only
// ---------------------------------------------------------------------------

describe("fireflies", () => {
  it.each([
    [0, 0],
    [9, 3],
    [99, 6],
    [999, 9],
    [9999, 12],
    [10 ** 8, 12],
  ])("at %i stars draws %i", (starsReceived, expected) => {
    expect(treeFacts(historyWith({ totals: { starsReceived } }), DATE).ornaments.fireflies).toBe(
      expected,
    );
  });

  it("appears only on night themes", () => {
    const history = historyWith({ totals: { starsReceived: 999 } });
    expect(inhabitantsFor(history, { theme: "ink" })).toContain("kd-fireflies");
    expect(inhabitantsFor(history, { theme: "yozakura" })).toContain("kd-fireflies");
    expect(inhabitantsFor(history, { theme: "paper" })).not.toContain("kd-fireflies");
    expect(inhabitantsFor(history, { theme: "shore" })).not.toContain("kd-fireflies");
  });

  it("draws a glow and a core for each", () => {
    const svg = inhabitantsFor(historyWith({ totals: { starsReceived: 9999 } }));
    const layer = svg.slice(svg.indexOf('class="kd-fireflies"'));
    expect(layer.split("<circle").length - 1).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// Wind chime: discussions >= 25
// ---------------------------------------------------------------------------

describe("wind chime", () => {
  it.each([
    [24, false],
    [25, true],
  ])("at %i discussions is %s", (discussions, expected) => {
    expect(treeFacts(historyWith({ totals: { discussions } }), DATE).ornaments.windChime).toBe(
      expected,
    );
    expect(inhabitantsFor(historyWith({ totals: { discussions } })).includes("kd-chime")).toBe(
      expected,
    );
  });

  it("hangs opposite the bird so the two never collide", () => {
    const svg = inhabitantsFor(
      historyWith({ totals: { discussions: 25, issuesClosed: 50 } }),
    );
    const chimeX = Number(/class="kd-chime"><line x1="([\d.]+)"/.exec(svg)?.[1]);
    const birdX = Number(/kd-bird[^"]*"><ellipse cx="([\d.]+)"/.exec(svg)?.[1]);

    expect(Number.isFinite(chimeX)).toBe(true);
    expect(Number.isFinite(birdX)).toBe(true);
    expect(chimeX).toBeLessThan(birdX);
  });
});

// ---------------------------------------------------------------------------
// Blossoms: streak >= 14, clusters = min(4, floor(streak / 30) + 1)
// ---------------------------------------------------------------------------

describe("blossoms", () => {
  it.each([
    [13, 0],
    [14, 1],
    [29, 1],
    [30, 2],
    [60, 3],
    [90, 4],
    [900, 4],
  ])("at a %i-day streak draws %i clusters", (current, expected) => {
    const history = historyWith({ streak: { current, longest: current } });
    expect(treeFacts(history, DATE).ornaments.blossomClusters).toBe(expected);
    expect(countClass(inhabitantsFor(history), "kd-blossoms")).toBe(expected === 0 ? 0 : 1);
    expect(countClass(inhabitantsFor(history), "kd-blossom")).toBe(expected * 3);
  });

  it("thins to one flower per cluster at reduced detail", () => {
    const history = historyWith({ streak: { current: 90, longest: 90 } });
    expect(countClass(inhabitantsFor(history, { detail: "reduced" }), "kd-blossom")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Falling petals and the soil ring: the grammar's response to absence
// ---------------------------------------------------------------------------

describe("falling petals", () => {
  function broken(gapDays: number, longest: number): NormalizedHistory {
    // The anchor minus the gap, as the last day anything happened. Computed
    // rather than tabulated: a lookup table with a missing key silently yields
    // a zero gap, which is a test that passes for the wrong reason.
    return historyWith({
      streak: { current: 0, longest, lastActiveDate: addDays(DATE, -gapDays) },
    });
  }

  it("says nothing on the first quiet day", () => {
    // Day one is "hasn't committed yet today", which is not a broken streak and
    // must never be drawn as one.
    expect(treeFacts(broken(1, 30), DATE).ornaments.fallingPetals).toBe(0);
  });

  it("falls from day two through day eight, then stops", () => {
    expect(treeFacts(broken(2, 30), DATE).ornaments.fallingPetals).toBe(3);
    expect(treeFacts(broken(8, 30), DATE).ornaments.fallingPetals).toBe(3);
    expect(treeFacts(broken(9, 30), DATE).ornaments.fallingPetals).toBe(0);
  });

  it("stays silent for a streak that was never established", () => {
    expect(treeFacts(broken(3, 13), DATE).ornaments.fallingPetals).toBe(0);
  });

  it("draws three petals and nothing else changes", () => {
    const svg = inhabitantsFor(broken(3, 30));
    const layer = svg.slice(svg.indexOf('class="kd-petals"'));
    expect(layer.split("<ellipse").length - 1).toBe(3);
    // Nothing wilts, nothing greys: absence costs three petals, no more.
    expect(svg).not.toContain("kd-bird");
  });
});

describe("soil petal ring", () => {
  it.each([
    [99, false],
    [100, true],
  ])("at a longest streak of %i is %s", (longest, expected) => {
    expect(treeFacts(historyWith({ streak: { longest } }), DATE).ornaments.soilPetalRing).toBe(
      expected,
    );
  });

  it("is permanent - it survives the streak being long broken", () => {
    const facts = treeFacts(
      historyWith({ streak: { current: 0, longest: 400, lastActiveDate: "2025-01-01" } }),
      DATE,
    );
    expect(facts.ornaments.soilPetalRing).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Detail levels and determinism
// ---------------------------------------------------------------------------

describe("inhabitants across detail levels", () => {
  const populated = historyWith({
    totals: { issuesClosed: 250, discussions: 25, starsReceived: 999 },
    streak: { current: 90, longest: 120 },
  });

  it("draws nothing at silhouette or glyph", () => {
    expect(inhabitantsFor(populated, { detail: "silhouette" })).toBe("");
    expect(inhabitantsFor(populated, { detail: "glyph" })).toBe("");
  });

  it("drops the wind chime at reduced detail but keeps the bird", () => {
    const reduced = inhabitantsFor(populated, { detail: "reduced" });
    expect(reduced).not.toContain("kd-chime");
    expect(reduced).toContain("kd-bird");
  });

  it("emits nothing for a tree nobody visited", () => {
    expect(inhabitantsFor(historyWith())).toBe("");
  });

  it("is byte-identical across repeated draws", () => {
    expect(inhabitantsFor(populated)).toBe(inhabitantsFor(populated));
  });

  it("keeps each inhabitant on its own RNG substream", () => {
    // Gaining a star must not move the blossoms.
    const blossomsOf = (svg: string): string => {
      const start = svg.indexOf('class="kd-blossoms"');
      return svg.slice(start, svg.indexOf('class="kd-petals"', start));
    };

    const before = inhabitantsFor(populated);
    const after = inhabitantsFor(
      historyWith({
        totals: { issuesClosed: 250, discussions: 25, starsReceived: 9999 },
        streak: { current: 90, longest: 120 },
      }),
    );

    expect(after).not.toBe(before);
    expect(blossomsOf(after)).toBe(blossomsOf(before));
  });
});
