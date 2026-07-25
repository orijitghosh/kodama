/**
 * The ornament rule table (SPEC-ENGINE §3.4), asserted at its boundaries.
 *
 * These tests deliberately count shapes in the emitted markup rather than
 * trusting the fact layer twice: facts.test.ts already proves the *numbers* are
 * right, so what is left to prove is that the drawing honours them - including
 * at the caps, where an off-by-one is a tree with eleven persimmons on it.
 */

import { describe, expect, it } from "vitest";
import { drawOrnaments } from "../src/biomes/bonsai.js";
import { treeFacts } from "../src/facts.js";
import { render } from "../src/render.js";
import { seedFromLogin } from "../src/rng.js";
import { buildSkeleton } from "../src/skeleton.js";
import { speciesByName } from "../src/species.js";
import { themeByName } from "../src/themes.js";
import type { Detail } from "../src/biomes/bonsai.js";
import type { NormalizedHistory, PRStub, ThemeName } from "../src/types.js";
import { FIXTURE_ANCHOR_DATE } from "./helpers/fixtures.js";
import { historyWith, weeksEndingAt } from "./helpers/history.js";
import { isoWeekOf } from "../src/date.js";

const DATE = FIXTURE_ANCHOR_DATE;

function ornamentsFor(
  history: NormalizedHistory,
  { theme = "ink", detail = "full" }: { theme?: ThemeName; detail?: Detail } = {},
): string {
  const facts = treeFacts(history, DATE);
  const seed = seedFromLogin(facts.login);
  const skeleton = buildSkeleton(seed, facts.maturity);
  return drawOrnaments(skeleton, facts, themeByName(theme), speciesByName("classic"), seed, detail);
}

/** Counts occurrences of a class, which is one element each by construction. */
function countClass(svg: string, className: string): number {
  return svg.split(`class="${className}"`).length - 1;
}

// ---------------------------------------------------------------------------
// Shoots: ceil(log2(1 + commitsThisWeek)), cap 6
// ---------------------------------------------------------------------------

describe("shoots", () => {
  /** Commits placed in the ISO week containing the render date. */
  function withCommitsThisWeek(commits: number): NormalizedHistory {
    return historyWith({ weeks: weeksEndingAt(isoWeekOf(DATE), 1, commits) });
  }

  it("draws none for a silent week", () => {
    const svg = ornamentsFor(withCommitsThisWeek(0));
    expect(countClass(svg, "kd-shoots")).toBe(0);
  });

  it.each([
    [1, 1],
    [3, 2],
    [7, 3],
    [15, 4],
  ])("draws ceil(log2(1 + %i)) = %i shoots", (commits, expected) => {
    const facts = treeFacts(withCommitsThisWeek(commits), DATE);
    expect(facts.ornaments.shoots).toBe(expected);
  });

  it("caps at 6 however loud the week was", () => {
    // The daily cap of 30 (D-010) bounds a week at 210, which is already past
    // the point where log2 would exceed the cap; assert the cap anyway, because
    // the cap is the contract and the daily cap is a separate rule that could
    // move.
    const facts = treeFacts(withCommitsThisWeek(210), DATE);
    expect(facts.ornaments.shoots).toBe(6);

    const svg = ornamentsFor(withCommitsThisWeek(210));
    // Two circles per shoot: body and bright centre.
    const shoots = svg.slice(svg.indexOf('class="kd-shoots"'));
    expect(shoots.split("<circle").length - 1).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Fruit: merged PRs within 30 days, ripeness = clamp(days / 3), cap 10
// ---------------------------------------------------------------------------

describe("fruit", () => {
  function prs(...mergedAt: string[]): PRStub[] {
    return mergedAt.map((d) => ({ mergedAt: d, bucket: 1 as const }));
  }

  it("ignores merges older than thirty days", () => {
    // 2026-06-15 is exactly 30 days before the anchor; 2026-06-14 is 31.
    const inside = treeFacts(historyWith({ recentPRs: prs("2026-06-15") }), DATE);
    const outside = treeFacts(historyWith({ recentPRs: prs("2026-06-14") }), DATE);
    expect(inside.ornaments.fruit).toHaveLength(1);
    expect(outside.ornaments.fruit).toHaveLength(0);
  });

  it("ripens green to persimmon over three days", () => {
    const facts = treeFacts(
      historyWith({ recentPRs: prs(DATE, "2026-07-14", "2026-07-13", "2026-07-12") }),
      DATE,
    );
    expect(facts.ornaments.fruit.map((f) => f.ripeness)).toEqual([0, 1 / 3, 2 / 3, 1]);
  });

  it("fades the unripe disc off in proportion to ripeness", () => {
    const justMerged = ornamentsFor(historyWith({ recentPRs: prs(DATE) }));
    // Ripeness 0: the green disc is fully opaque over the persimmon one.
    expect(justMerged).toContain('opacity="1"');

    const fullyRipe = ornamentsFor(historyWith({ recentPRs: prs("2026-07-12") }));
    const fruitLayer = fullyRipe.slice(fullyRipe.indexOf('class="kd-fruits"'));
    // Ripeness 1: no overlay at all, rather than one at zero opacity.
    expect(fruitLayer).not.toContain("foliage3");
  });

  it("sizes fruit by additions bucket", () => {
    for (const [bucket, radius] of [
      [1, 4],
      [2, 6],
      [3, 8],
    ] as const) {
      const svg = ornamentsFor(
        historyWith({ recentPRs: [{ mergedAt: "2026-07-12", bucket }] }),
      );
      expect(svg).toContain(`r="${String(radius)}"`);
    }
  });

  it("caps at 10 even when more merged inside the window", () => {
    const many = Array.from({ length: 14 }, () => "2026-07-10");
    const facts = treeFacts(historyWith({ recentPRs: prs(...many) }), DATE);
    expect(facts.ornaments.fruit).toHaveLength(10);
    expect(countClass(ornamentsFor(historyWith({ recentPRs: prs(...many) })), "kd-fruit")).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Unripe fruit: min(prsOpen, 4). Lanterns: floor(log2(1 + reviews)), cap 7
// ---------------------------------------------------------------------------

describe("unripe fruit", () => {
  it.each([
    [0, 0],
    [1, 1],
    [4, 4],
    [9, 4],
  ])("draws min(%i, 4) = %i", (prsOpen, expected) => {
    const history = historyWith({ totals: { prsOpen } });
    expect(treeFacts(history, DATE).ornaments.unripeFruit).toBe(expected);

    const svg = ornamentsFor(history);
    const layer = expected === 0 ? "" : svg.slice(svg.indexOf('class="kd-unripe"'));
    expect(layer === "" ? 0 : layer.split("<circle").length - 1).toBe(expected);
  });
});

describe("lanterns", () => {
  it.each([
    [0, 0],
    [1, 1],
    [3, 2],
    [127, 7],
    [4095, 7],
  ])("draws floor(log2(1 + %i)) = %i, capped at 7", (reviews, expected) => {
    const history = historyWith({ totals: { reviews } });
    expect(treeFacts(history, DATE).ornaments.lanterns).toBe(expected);
    expect(countClass(ornamentsFor(history), "kd-lantern")).toBe(expected);
  });

  it("lights only on night themes", () => {
    const history = historyWith({ totals: { reviews: 31 } });
    const night = ornamentsFor(history, { theme: "ink" });
    const day = ornamentsFor(history, { theme: "paper" });

    expect(themeByName("ink").night).toBe(true);
    expect(themeByName("paper").night).toBe(false);
    expect(night).toContain('opacity="0.14"');
    expect(day).not.toContain('opacity="0.14"');
    // The lantern itself is present either way - only the halo is conditional.
    expect(countClass(day, "kd-lantern")).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Detail levels and determinism
// ---------------------------------------------------------------------------

describe("ornaments across detail levels", () => {
  const busy = historyWith({
    totals: { reviews: 127, prsOpen: 4 },
    recentPRs: Array.from({ length: 6 }, () => ({ mergedAt: "2026-07-12", bucket: 2 as const })),
    weeks: weeksEndingAt(isoWeekOf(DATE), 1, 15),
  });

  it("halves the count at reduced detail", () => {
    expect(countClass(ornamentsFor(busy, { detail: "reduced" }), "kd-lantern")).toBe(4);
    expect(countClass(ornamentsFor(busy, { detail: "full" }), "kd-lantern")).toBe(7);
  });

  it("draws nothing at silhouette or glyph", () => {
    expect(ornamentsFor(busy, { detail: "silhouette" })).toBe("");
    expect(ornamentsFor(busy, { detail: "glyph" })).toBe("");
  });

  it("emits nothing at all for a tree with no ornaments", () => {
    expect(ornamentsFor(historyWith())).toBe("");
  });
});

describe("ornament determinism", () => {
  const history = historyWith({
    totals: { reviews: 31, prsOpen: 3 },
    recentPRs: [{ mergedAt: "2026-07-13", bucket: 3 }],
    weeks: weeksEndingAt(isoWeekOf(DATE), 1, 9),
  });

  it("is byte-identical across repeated draws", () => {
    expect(ornamentsFor(history)).toBe(ornamentsFor(history));
  });

  it("keeps each ornament kind on its own RNG substream", () => {
    // The point of labelled substreams: gaining a review must not relocate
    // this week's shoots. Without them, one extra draw shifts every later
    // ornament and the tree reshuffles for an unrelated reason.
    const shootsOf = (svg: string): string => svg.slice(svg.indexOf('class="kd-shoots"'));

    const before = ornamentsFor(history);
    const after = ornamentsFor(
      historyWith({
        totals: { reviews: 63, prsOpen: 3 },
        recentPRs: [{ mergedAt: "2026-07-13", bucket: 3 }],
        weeks: weeksEndingAt(isoWeekOf(DATE), 1, 9),
      }),
    );

    expect(countClass(after, "kd-lantern")).not.toBe(countClass(before, "kd-lantern"));
    expect(shootsOf(after)).toBe(shootsOf(before));
  });
});

describe("ornaments in a full render", () => {
  it("draws the fruit and lanterns the legend promises", () => {
    const svg = render(
      historyWith({
        totals: { reviews: 31, prsOpen: 2 },
        recentPRs: [{ mergedAt: "2026-07-12", bucket: 2 }],
      }),
      DATE,
      {
        biome: "bonsai",
        theme: "ink",
        scale: "full",
        animate: false,
        tint: "none",
        species: "classic",
        locale: "en",
      },
    );

    expect(svg).toContain("kd-ornaments");
    expect(svg).toContain("kd-fruits");
    expect(svg).toContain("kd-lanterns");
  });
});
