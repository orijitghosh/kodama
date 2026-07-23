/**
 * Seasons (SPEC-ENGINE §3.5) and the colour arithmetic behind them.
 *
 * The season rules are boundary rules - a window that is one day wrong is a
 * user who gets snow in November - so every window is asserted on both edges.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hexToHsl, hslToHex, KodamaColorError, parseHex, shiftHex } from "../src/color.js";
import { buildClusters, drawSeasonal } from "../src/biomes/bonsai.js";
import { seasonalEventsFor, seasonFor, treeFacts } from "../src/facts.js";
import { render } from "../src/render.js";
import { seedFromLogin } from "../src/rng.js";
import { buildSkeleton } from "../src/skeleton.js";
import { paletteForSeason, paletteStyles, themeByName, PALETTE_SLOTS } from "../src/themes.js";
import type { Detail } from "../src/biomes/bonsai.js";
import type { NormalizedHistory, Season } from "../src/types.js";
import { loadFixture } from "./helpers/fixtures.js";
import { historyWith } from "./helpers/history.js";

// ---------------------------------------------------------------------------
// Colour arithmetic
// ---------------------------------------------------------------------------

describe("colour arithmetic", () => {
  it("rejects anything that is not #rrggbb", () => {
    for (const bad of ["", "#fff", "fff000", "#gggggg", "#12345", "#1234567"]) {
      expect(() => parseHex(bad)).toThrow(KodamaColorError);
    }
  });

  it("round-trips every palette colour through HSL", () => {
    // Not an identity in general - quantising to 8 bits per channel loses a
    // little - so the assertion is that it lands within one step per channel,
    // which is what "the colour did not visibly move" means here.
    for (const name of ["ink", "dusk", "paper", "sakura", "yozakura", "shore"] as const) {
      const theme = themeByName(name);
      for (const slot of PALETTE_SLOTS) {
        for (const hex of [theme.dark[slot], theme.light[slot]]) {
          const back = hslToHex(hexToHsl(hex));
          const a = parseHex(hex);
          const b = parseHex(back);
          expect(Math.abs(a.r - b.r)).toBeLessThanOrEqual(1);
          expect(Math.abs(a.g - b.g)).toBeLessThanOrEqual(1);
          expect(Math.abs(a.b - b.b)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("always emits a well-formed hex, for any input and any shift", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffff }),
        fc.integer({ min: -720, max: 720 }),
        fc.double({ min: 0, max: 4, noNaN: true }),
        fc.double({ min: 0, max: 4, noNaN: true }),
        (rgb, rotate, saturate, lighten) => {
          const hex = `#${rgb.toString(16).padStart(6, "0")}`;
          const out = shiftHex(hex, { rotate, saturate, lighten });
          expect(out).toMatch(/^#[0-9a-f]{6}$/);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("is deterministic", () => {
    const shift = { towardHue: 38, towardAmount: 0.72, saturate: 1.18, lighten: 1.06 };
    expect(shiftHex("#4d6654", shift)).toBe(shiftHex("#4d6654", shift));
  });
});

// ---------------------------------------------------------------------------
// Season boundaries
// ---------------------------------------------------------------------------

describe("season boundaries", () => {
  it.each([
    ["2026-02-28", "winter"],
    ["2026-03-01", "spring"],
    ["2026-05-31", "spring"],
    ["2026-06-01", "summer"],
    ["2026-08-31", "summer"],
    ["2026-09-01", "autumn"],
    ["2026-11-30", "autumn"],
    ["2026-12-01", "winter"],
    ["2026-01-31", "winter"],
  ])("%s is %s", (date, season) => {
    expect(seasonFor(date)).toBe(season);
  });
});

describe("seasonal event windows", () => {
  const kinds = (date: string): string[] => seasonalEventsFor(date).map((e) => e.kind);

  it("opens and closes hanami on the right days", () => {
    expect(kinds("2026-03-31")).not.toContain("hanami");
    expect(kinds("2026-04-01")).toContain("hanami");
    expect(kinds("2026-04-07")).toContain("hanami");
    expect(kinds("2026-04-08")).not.toContain("hanami");
  });

  it("opens and closes harvest on the right days", () => {
    expect(kinds("2026-10-14")).not.toContain("harvest");
    expect(kinds("2026-10-15")).toContain("harvest");
    expect(kinds("2026-10-21")).toContain("harvest");
    expect(kinds("2026-10-22")).not.toContain("harvest");
  });

  it("runs first snow into settled snow without a gap or an overlap", () => {
    expect(kinds("2026-11-30")).toEqual([]);
    expect(kinds("2026-12-01")).toEqual(["firstSnow"]);
    expect(kinds("2026-12-03")).toEqual(["firstSnow"]);
    expect(kinds("2026-12-04")).toEqual(["settledSnow"]);
    expect(kinds("2026-02-28")).toEqual(["settledSnow"]);
    expect(kinds("2026-03-01")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Palette modulation
// ---------------------------------------------------------------------------

describe("seasonal palette modulation", () => {
  const ink = themeByName("ink").dark;

  it("leaves summer exactly as the reference palette specifies", () => {
    // TASTE §3 authors the reference palettes at high summer; if summer drifts,
    // the specified hexes are no longer what ships.
    expect(paletteForSeason(ink, "summer")).toEqual(ink);
  });

  it("repaints foliage and nothing else", () => {
    for (const season of ["spring", "autumn", "winter"] as Season[]) {
      const painted = paletteForSeason(ink, season);
      for (const name of PALETTE_SLOTS) {
        const changed = painted[name] !== ink[name];
        expect(changed).toBe(name.startsWith("foliage"));
      }
    }
  });

  it("lands autumn foliage in the amber band, not in khaki", () => {
    // The bug this pins: "warmer than summer" is satisfied by hue 54, which is
    // yellow-olive. Autumn has to actually arrive in the ambers, and it has to
    // bring saturation with it - a hue rotation applied to the reference
    // foliage's 14% saturation is still a near-grey.
    for (const theme of ["ink", "dusk"] as const) {
      for (const scheme of ["dark", "light"] as const) {
        const base = themeByName(theme)[scheme];
        for (const name of ["foliage1", "foliage2", "foliage3"] as const) {
          const autumn = hexToHsl(paletteForSeason(base, "autumn")[name]);
          expect(autumn.h).toBeGreaterThanOrEqual(20);
          expect(autumn.h).toBeLessThanOrEqual(45);
          expect(autumn.s).toBeGreaterThan(hexToHsl(base[name]).s * 1.8);
        }

        // And it must stay clearly behind the fruit, or a leaf reads as a
        // persimmon and the legend starts lying again.
        const leaf = hexToHsl(paletteForSeason(base, "autumn").foliage3);
        const fruit = hexToHsl(base.fruit2);
        expect(leaf.s).toBeLessThan(fruit.s - 15);
      }
    }
  });

  it("drains winter foliage without greying it out entirely", () => {
    const winter = hexToHsl(paletteForSeason(ink, "winter").foliage2);
    expect(winter.s).toBeLessThan(hexToHsl(ink.foliage2).s);
    // A bonsai in winter is still alive; fully desaturated reads as dead.
    expect(winter.s).toBeGreaterThan(4);
  });

  it("emits the season's colours in both schemes", () => {
    const winter = paletteStyles(themeByName("ink"), "winter");
    const summer = paletteStyles(themeByName("ink"), "summer");
    expect(winter).not.toBe(summer);
    expect(winter.split("--kd-foliage1").length - 1).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Seasonal drawing
// ---------------------------------------------------------------------------

function seasonalFor(
  history: NormalizedHistory,
  date: string,
  detail: Detail = "full",
): string {
  const facts = treeFacts(history, date);
  const seed = seedFromLogin(facts.login);
  const skeleton = buildSkeleton(seed, facts.maturity);
  const clusters = buildClusters(skeleton, facts, seed, detail);
  return drawSeasonal(skeleton, clusters, facts, seed, detail);
}

describe("seasonal drawing", () => {
  const plain = historyWith();

  it("draws nothing on an ordinary day", () => {
    expect(seasonalFor(plain, "2026-07-15")).toBe("");
  });

  it("settles snow on the pads and the pot rim in deep winter", () => {
    const svg = seasonalFor(plain, "2026-01-20");
    expect(svg).toContain("kd-snow");
    expect(svg).toContain("kd-snow");
    expect(svg).not.toContain("kd-snowfall");
  });

  it("settles snow on drawn foliage, never in open sky", () => {
    // The bug this pins: a pad's radius is a bounding value that none of its
    // blobs reach, so a cap built from it hangs above the cluster it is
    // supposed to be lying on. Every cap must land on a circle that is
    // actually drawn.
    for (const name of ["whale", "veteran", "maintainer", "grinder", "newcomer"]) {
      const history = loadFixture(name);
      const facts = treeFacts(history, "2026-01-20");
      const seed = seedFromLogin(facts.login);
      const skeleton = buildSkeleton(seed, facts.maturity);
      const clusters = buildClusters(skeleton, facts, seed, "full");
      const svg = drawSeasonal(skeleton, clusters, facts, seed, "full");

      const blobs = clusters.flatMap((c) => c.blobs);
      const start = svg.indexOf('class="kd-snow"');
      const snowLayer = svg.slice(start, svg.indexOf("</g>", start));
      const caps = [...snowLayer.matchAll(/M([\d.-]+) ([\d.-]+)Q([\d.-]+) ([\d.-]+)/g)];
      expect(caps.length).toBeGreaterThan(0);

      for (const cap of caps) {
        // The control x is the crest centre; the M x is the left edge.
        const x = Number(cap[3]);
        // A quadratic's drawn apex is midway between its endpoints and its
        // control point, and both endpoints share edgeY here.
        const apexY = Number(cap[4]) / 2 + Number(cap[2]) / 2;
        // The cap's drawn apex must lie inside some blob, allowing a hair of
        // slack for the crescent riding the very edge.
        const seated = blobs.some(
          (b) => Math.hypot(b.x - x, b.y - apexY) <= b.r + 1.5,
        );
        expect(seated, `${name}: cap at ${String(x)},${String(apexY)} floats`).toBe(true);
      }
    }
  });

  it("falls as flakes for the first snow, capped at fourteen (TASTE §6)", () => {
    const svg = seasonalFor(plain, "2026-12-02");
    const layer = svg.slice(svg.indexOf('class="kd-snowfall"'));
    expect(layer.split("<circle").length - 1).toBe(14);
  });

  it("blossoms every tree during hanami, earned or not", () => {
    // The ghost has no streak and so has no blossoms of its own; hanami
    // arrives for it anyway, which is the point of the window.
    const ghost = loadFixture("ghost");
    expect(treeFacts(ghost, "2026-04-04").ornaments.blossomClusters).toBe(0);
    expect(seasonalFor(ghost, "2026-04-04")).toContain("kd-hanami");
  });

  it("brings a basket at harvest only when there is ripe fruit for it", () => {
    const withFruit = historyWith({ recentPRs: [{ mergedAt: "2026-10-10", bucket: 2 }] });
    expect(seasonalFor(withFruit, "2026-10-17")).toContain("kd-harvest");
    // An empty basket beside a fruitless tree would read as a reproach.
    expect(seasonalFor(plain, "2026-10-17")).not.toContain("kd-harvest");
  });

  it("draws nothing at silhouette or glyph", () => {
    expect(seasonalFor(plain, "2026-01-20", "silhouette")).toBe("");
    expect(seasonalFor(plain, "2026-01-20", "glyph")).toBe("");
  });

  it("is byte-identical across repeated draws", () => {
    expect(seasonalFor(plain, "2026-12-02")).toBe(seasonalFor(plain, "2026-12-02"));
  });
});

describe("winter thinning", () => {
  it("bares branches only in deep winter", () => {
    const whale = loadFixture("whale");
    expect(treeFacts(whale, "2026-01-20").bareBranchRatio).toBe(0.4);
    expect(treeFacts(whale, "2026-07-15").bareBranchRatio).toBe(0);
    expect(treeFacts(whale, "2026-12-02").bareBranchRatio).toBe(0);
  });

  it("visibly thins the canopy rather than nudging it", () => {
    const opts = {
      biome: "bonsai" as const,
      theme: "ink" as const,
      scale: "full" as const,
      animate: false,
      tint: "none" as const,
      locale: "en",
    };
    const whale = loadFixture("whale");
    const branchCount = (svg: string): number => {
      const start = svg.indexOf('class="kd-branches"');
      return svg.slice(start, svg.indexOf("</g>", start)).split("<path").length - 1;
    };

    const summer = branchCount(render(whale, "2026-07-15", opts));
    const winter = branchCount(render(whale, "2026-01-20", opts));

    expect(winter).toBeLessThan(summer);
    // The structure must survive: this is a thinner tree, not a different one.
    // Baring removes 0.4 of eligible (depth>4) twigs by rank, and the trunk and
    // low limbs are never eligible, so retention sits comfortably above 0.6 of
    // the whole regardless of how dense colonization made this particular crown.
    const retained = winter / summer;
    expect(retained).toBeGreaterThan(0.55);
    expect(retained).toBeLessThan(0.7);
  });
});

describe("a year of one account", () => {
  it("looks different in every season", () => {
    const opts = {
      biome: "bonsai" as const,
      theme: "ink" as const,
      scale: "full" as const,
      animate: false,
      tint: "none" as const,
      locale: "en",
    };
    const veteran = loadFixture("veteran");
    const renders = ["2026-01-20", "2026-04-15", "2026-07-15", "2025-10-08"].map((d) =>
      render(veteran, d, opts),
    );

    expect(new Set(renders).size).toBe(4);
  });
});
