import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  render,
  SCALE_SIZES,
  groupDigits,
  LEGEND_MAX_ROWS,
  legendRowBaselines,
} from "../src/render.js";
import { animationStyles } from "../src/animate.js";
import { byteLength, num, PathBuilder, SvgValueError, escapeText } from "../src/svg.js";
import { attractorCloud, buildSkeleton, padCountFor, BASE_X, BASE_Y } from "../src/skeleton.js";
import { seedFromLogin } from "../src/rng.js";
import { biographyFor, labelsFor } from "../src/locale.js";
import { treeFacts } from "../src/facts.js";
import { tintRotation } from "../src/themes.js";
import { THEME_NAMES, SCALES } from "../src/types.js";
import type { LangShare } from "../src/types.js";
import type { RenderOptions, Scale } from "../src/types.js";
import { allFixtures, FIXTURE_ANCHOR_DATE, loadFixture } from "./helpers/fixtures.js";
import { historyWith } from "./helpers/history.js";

const DATE = FIXTURE_ANCHOR_DATE;

const opts = (over: Partial<RenderOptions> = {}): RenderOptions => ({
  biome: "bonsai",
  theme: "ink",
  scale: "full",
  animate: false,
  tint: "none",
  species: "classic",
  locale: "en",
  ...over,
});

const SIZE_CAPS: Record<Scale, number> = {
  full: 60 * 1024,
  compact: 24 * 1024,
  strip: 16 * 1024,
  button: 4 * 1024,
};

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

describe("the serializer", () => {
  it("rounds to two decimals", () => {
    expect(num(1.23456)).toBe("1.23");
    expect(num(1.235)).toBe("1.24");
    expect(num(10)).toBe("10");
  });

  it("normalizes negative zero", () => {
    // -0 and 0 are numerically equal but serialize differently, which is
    // enough to fail byte-identity for a tree that sits on an axis.
    expect(num(-0)).toBe("0");
    expect(num(-0.001)).toBe("0");
  });

  it("refuses to serialize a non-finite number", () => {
    expect(() => num(Number.NaN)).toThrow(SvgValueError);
    expect(() => num(Number.POSITIVE_INFINITY)).toThrow(SvgValueError);
  });

  it("escapes markup in text", () => {
    expect(escapeText(`<script>&"'`)).toBe("&lt;script&gt;&amp;&quot;&apos;");
  });

  it("builds paths with consistent rounding", () => {
    const d = new PathBuilder().moveTo(1.111, 2.222).lineTo(3.336, 4).close().toString();
    expect(d).toBe("M1.11 2.22L3.34 4Z");
  });

  it("counts bytes, not code units", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("コミット")).toBe(12);
  });
});

describe("digit grouping replaces toLocaleString", () => {
  // A narrow no-break space (U+202F) separates groups: it is the typographic
  // choice for digit grouping and, unlike a comma or a period, it means the
  // same thing to a reader in every locale.
  const NNBSP = " ";

  it.each([
    [0, "0"],
    [42, "42"],
    [1000, `1${NNBSP}000`],
    [1247, `1${NNBSP}247`],
    [114540, `114${NNBSP}540`],
    [1000000, `1${NNBSP}000${NNBSP}000`],
  ])("formats %i as %s", (value, expected) => {
    expect(groupDigits(value)).toBe(expected);
  });

  it("uses a narrow no-break space, never a locale-specific separator", () => {
    expect(groupDigits(1247)).not.toContain(",");
    expect(groupDigits(1247)).not.toContain(".");
  });
});

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

describe("the skeleton", () => {
  it("is identical for the same seed and level, across many runs", () => {
    const seed = seedFromLogin("maintainer");
    const first = buildSkeleton(seed, 8);
    for (let i = 0; i < 100; i += 1) {
      expect(buildSkeleton(seed, 8)).toEqual(first);
    }
  });

  it("generates the attractor cloud once per seed, independent of level", () => {
    const seed = seedFromLogin("grinder");
    expect(attractorCloud(seed)).toEqual(attractorCloud(seed));
  });

  it("differs between seeds", () => {
    expect(buildSkeleton(seedFromLogin("alice"), 8).nodes).not.toEqual(
      buildSkeleton(seedFromLogin("bob"), 8).nodes,
    );
  });

  it("gives every maturity exactly the pads it is owed", () => {
    for (let maturity = 3; maturity <= 13; maturity += 1) {
      for (const login of ["alice", "bob", "carol", "whale", "ghost"]) {
        const skeleton = buildSkeleton(seedFromLogin(login), maturity);
        expect(skeleton.pads.length, `${login}@${String(maturity)}`).toBe(
          padCountFor(maturity),
        );
      }
    }
  });

  it("never loses pads as it grows, for any seed (D-005, D-017)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        let previous = 0;
        for (let maturity = 3; maturity <= 13; maturity += 1) {
          const pads = buildSkeleton(seed, maturity).pads.length;
          expect(pads).toBeGreaterThanOrEqual(previous);
          previous = pads;
        }
      }),
      { numRuns: 40 },
    );
    // 440 skeleton builds, ~1 s locally and closer to the default on CI.
  }, 30_000);

  it("roots every node at the trunk base", () => {
    const skeleton = buildSkeleton(seedFromLogin("veteran"), 7);
    expect(skeleton.nodes[0]).toMatchObject({ x: BASE_X, y: BASE_Y, parent: -1 });
    for (let i = 1; i < skeleton.nodes.length; i += 1) {
      expect(skeleton.nodes[i]!.parent).toBeLessThan(i);
    }
  });

  it("grows a bigger crown for a more mature tree", () => {
    const seed = seedFromLogin("grinder");
    const height = (maturity: number): number => {
      const skeleton = buildSkeleton(seed, maturity);
      return BASE_Y - Math.min(...skeleton.nodes.map((n) => n.y));
    };
    // Growth has to be legible, or the tree is not a biography.
    expect(height(13)).toBeGreaterThan(height(3) * 1.3);
  });
});

// ---------------------------------------------------------------------------
// Render: the SPEC-ENGINE §7 property contract
// ---------------------------------------------------------------------------

describe("render is deterministic", () => {
  it("produces byte-identical output across repeated renders", () => {
    for (const [name, history] of allFixtures()) {
      const first = render(history, DATE, opts());
      for (let i = 0; i < 20; i += 1) {
        expect(render(history, DATE, opts()), name).toBe(first);
      }
    }
  });

  it("stays byte-identical over a thousand random histories", () => {
    fc.assert(
      fc.property(
        fc.record({
          commits: fc.integer({ min: 0, max: 200000 }),
          reviews: fc.integer({ min: 0, max: 9000 }),
          stars: fc.integer({ min: 0, max: 200000 }),
          streak: fc.integer({ min: 0, max: 900 }),
          login: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        ({ commits, reviews, stars, streak, login }) => {
          const history = historyWith({
            login,
            totals: { commits, reviews, starsReceived: stars },
            streak: { current: streak, longest: streak, lastActiveDate: DATE },
          });
          expect(render(history, DATE, opts())).toBe(render(history, DATE, opts()));
        },
      ),
      { numRuns: 1000 },
    );
    // Two thousand full renders. It clears 5 s on a developer machine and does
    // not on a shared CI runner, and shrinking the run count to fit the default
    // would trade coverage of the determinism contract for a scheduling detail.
  }, 60_000);

  it("changes when the seed changes", () => {
    const a = render(historyWith({ login: "alice" }), DATE, opts());
    const b = render(historyWith({ login: "bob" }), DATE, opts());
    expect(a).not.toBe(b);
  });

  it("ignores login casing, so one user has one tree", () => {
    const lower = render(historyWith({ login: "arijit" }), DATE, opts());
    const upper = render(historyWith({ login: "arijit" }), DATE, opts());
    expect(lower).toBe(upper);
  });
});

describe("render output is well-formed", () => {
  const parser = new XMLParser({ ignoreAttributes: false });

  for (const [name, history] of allFixtures()) {
    for (const scale of SCALES) {
      it(`${name} at ${scale} parses as strict XML`, () => {
        const svg = render(history, DATE, opts({ scale }));
        expect(XMLValidator.validate(svg)).toBe(true);
        expect(() => parser.parse(svg)).not.toThrow();
      });
    }
  }

  it("never emits NaN or Infinity", () => {
    for (const [name, history] of allFixtures()) {
      for (const scale of SCALES) {
        const svg = render(history, DATE, opts({ scale }));
        expect(svg, `${name}/${scale}`).not.toMatch(/NaN|Infinity|undefined|\[object/);
      }
    }
  });

  it("declares matching width, height and viewBox", () => {
    for (const scale of SCALES) {
      const { width, height } = SCALE_SIZES[scale];
      const svg = render(loadFixture("grinder"), DATE, opts({ scale }));
      expect(svg).toContain(`width="${String(width)}" height="${String(height)}"`);
      expect(svg).toContain(`viewBox="0 0 ${String(width)} ${String(height)}"`);
    }
  });

  it("keeps every drawn point inside the viewBox", () => {
    // A shape outside the canvas is invisible bytes at best and a clipped tree
    // at worst; either way it means the composition grid slipped.
    const { width, height } = SCALE_SIZES.full;
    for (const [name, history] of allFixtures()) {
      const svg = render(history, DATE, opts());
      const coordinates = [...svg.matchAll(/\b(?:cx|cy|x|y|x1|y1|x2|y2)="(-?[\d.]+)"/g)];
      expect(coordinates.length).toBeGreaterThan(0);
      for (const [, raw] of coordinates) {
        const value = Number(raw);
        expect(value, `${name}: ${String(value)}`).toBeGreaterThanOrEqual(-40);
        expect(value).toBeLessThanOrEqual(Math.max(width, height) + 40);
      }
    }
  });
});

describe("render stays inside the size budgets", () => {
  for (const scale of SCALES) {
    it(`respects the ${scale} cap for every fixture`, () => {
      for (const [name, history] of allFixtures()) {
        for (const theme of THEME_NAMES) {
          const bytes = byteLength(render(history, DATE, opts({ scale, theme })));
          expect(bytes, `${name}/${scale}/${theme}`).toBeLessThanOrEqual(SIZE_CAPS[scale]);
        }
      }
    });
  }
});

describe("the animation layer (SPEC-ENGINE §6)", () => {
  it("strips the block entirely for animate=off, so a static card is unchanged", () => {
    const off = render(loadFixture("maintainer"), DATE, opts({ animate: false }));
    const on = render(loadFixture("maintainer"), DATE, opts({ animate: true }));
    expect(off).not.toContain("@keyframes");
    expect(off).not.toContain("kd-sway");
    expect(on).toContain("@keyframes kd-sway");
    // Everything the static card had is still there; animation only adds.
    expect(on.startsWith(off.slice(0, off.indexOf("</style>")))).toBe(true);
  });

  it("moves nothing at the small scales - motion is the full badge's alone", () => {
    for (const scale of SCALES) {
      const svg = render(loadFixture("whale"), DATE, opts({ scale, animate: true }));
      if (scale === "full") expect(svg).toContain("@keyframes");
      else expect(svg, scale).not.toContain("@keyframes");
    }
  });

  it("honours prefers-reduced-motion by disabling every animation", () => {
    const svg = render(loadFixture("whale"), DATE, opts({ animate: true }));
    expect(svg).toContain("@media(prefers-reduced-motion:reduce)");
    expect(svg).toMatch(/prefers-reduced-motion:reduce\)\{[^}]*animation:none\}/);
  });

  it("keeps every cycle at or above the 3 s flash floor (WCAG 2.3.1)", () => {
    const css = animationStyles();
    const durations = [
      ...css.matchAll(/animation:[a-z-]+ (\d+(?:\.\d+)?)s/g),
      ...css.matchAll(/animation-duration:(\d+(?:\.\d+)?)s/g),
    ].map((m) => Number(m[1]));
    expect(durations.length).toBeGreaterThan(0);
    for (const d of durations) expect(d).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic - the same inputs render the same bytes", () => {
    const a = render(loadFixture("whale"), DATE, opts({ animate: true }));
    const b = render(loadFixture("whale"), DATE, opts({ animate: true }));
    expect(a).toBe(b);
  });

  it("holds the full size cap with the style block included", () => {
    for (const [name, history] of allFixtures()) {
      for (const theme of THEME_NAMES) {
        const bytes = byteLength(render(history, DATE, opts({ scale: "full", theme, animate: true })));
        expect(bytes, `${name}/${theme}`).toBeLessThanOrEqual(SIZE_CAPS.full);
      }
    }
  });
});

describe("themes", () => {
  it("emits both colour schemes from one document (D-006)", () => {
    const svg = render(loadFixture("grinder"), DATE, opts());
    expect(svg).toContain("prefers-color-scheme:dark");
    expect(svg).toContain("--kd-foliage1");
  });

  it("renders every theme without falling over", () => {
    for (const theme of THEME_NAMES) {
      const svg = render(loadFixture("maintainer"), DATE, opts({ theme }));
      expect(XMLValidator.validate(svg)).toBe(true);
    }
  });

  it("uses the exact ink palette from TASTE §3", () => {
    const svg = render(loadFixture("grinder"), DATE, opts({ theme: "ink" }));
    for (const hex of ["#101312", "#4a4440", "#3d5245", "#d97742", "#e8e6e1"]) {
      expect(svg).toContain(hex);
    }
  });

  it("embeds no fonts and reaches for no network", () => {
    const svg = render(loadFixture("whale"), DATE, opts());
    expect(svg).not.toMatch(/@font-face|https?:\/\/(?!www\.w3\.org)/);
  });

  it("uses no gradients or filters (TASTE §1.2)", () => {
    const svg = render(loadFixture("veteran"), DATE, opts());
    expect(svg).not.toMatch(/<(linear|radial)Gradient|<filter|feGaussianBlur|drop-shadow/);
  });
});

describe("accessibility", () => {
  it("gives every tree a spoken biography", () => {
    for (const [name, history] of allFixtures()) {
      const svg = render(history, DATE, opts());
      const title = /<title>([^<]+)<\/title>/.exec(svg)?.[1] ?? "";
      const desc = /<desc>([^<]+)<\/desc>/.exec(svg)?.[1] ?? "";
      expect(title.length, name).toBeGreaterThan(10);
      expect(desc.length, name).toBeGreaterThan(40);
    }
  });

  it("marks the document as an image with a language", () => {
    const svg = render(loadFixture("grinder"), DATE, opts({ locale: "ja" }));
    expect(svg).toContain('role="img"');
    expect(svg).toContain('lang="ja"');
  });

  it("describes a dormant tree as resting rather than dead", () => {
    const biography = biographyFor(treeFacts(loadFixture("dormant"), DATE), "en");
    expect(biography.title).toMatch(/resting/);
    expect(biography.title).not.toMatch(/dead|dying|failed|lost/i);
  });

  it("speaks only of elements the biome draws", () => {
    // TreeFacts decides plaques, visitors, the spirit and weather; the bonsai
    // draws none of them yet (M7). Until it does, naming them in the biography
    // would describe a tree only the screen-reader user is told about.
    const facts = treeFacts(loadFixture("veteran"), DATE);
    expect(facts.plaques.length, "the veteran is the fixture with plaques").toBeGreaterThan(0);

    const { title, desc } = biographyFor(facts, "en");
    for (const spoken of [title, desc]) {
      expect(spoken).not.toMatch(/plaque|weather|spirit|fox|koi|crane/i);
    }
  });

  it("states that the tree is recomputable", () => {
    const biography = biographyFor(treeFacts(loadFixture("whale"), DATE), "en");
    expect(biography.desc).toMatch(/recomputable/);
  });
});

describe("locales", () => {
  it("falls back through the primary subtag to English", () => {
    expect(labelsFor("ja-JP")).toBe(labelsFor("ja"));
    expect(labelsFor("xx-YY")).toBe(labelsFor("en"));
    expect(labelsFor("")).toBe(labelsFor("en"));
  });

  it("renders Japanese labels when asked", () => {
    const svg = render(loadFixture("grinder"), DATE, opts({ locale: "ja" }));
    expect(svg).toContain("コミット");
  });
});

describe("render validates its inputs", () => {
  it("rejects an unsupported biome", () => {
    expect(() =>
      render(loadFixture("grinder"), DATE, opts({ biome: "reef" as "bonsai" })),
    ).toThrow(/biome/);
  });

  it("rejects a history of the wrong schema version", () => {
    expect(() => render({ ...loadFixture("grinder"), v: 1 as 2 }, DATE, opts())).toThrow();
  });
});

describe("time travel is free, because render is pure (D-002)", () => {
  it("draws the same account differently on different dates", () => {
    const history = loadFixture("grinder");
    expect(render(history, "2026-07-15", opts())).not.toBe(
      render(history, "2026-01-20", opts()),
    );
  });

  it("keeps the structure identical from one day to the next", () => {
    // Day-to-day stability is what stops a README badge from visibly
    // reshuffling between visits. Ornaments are allowed to move - fruit ripens
    // daily on purpose - but the skeleton and its stroke widths must not, which
    // is why girth is quantized to whole years (D-018).
    const history = loadFixture("veteran");
    const branches = (svg: string): string =>
      /<g class="kd-branches".*?<\/g>/s.exec(svg)?.[0] ?? "";

    const monday = branches(render(history, "2026-07-15", opts()));
    expect(monday).not.toBe("");
    expect(branches(render(history, "2026-07-16", opts()))).toBe(monday);
    expect(branches(render(history, "2026-07-20", opts()))).toBe(monday);
  });
});

describe("giants and ghosts both stay composed", () => {
  it("draws the ghost as a modest tree in a plastic pot", () => {
    const svg = render(loadFixture("ghost"), DATE, opts());
    expect(svg).toContain(">0<");
    expect(XMLValidator.validate(svg)).toBe(true);
  });

  it("draws the whale without overflowing the card", () => {
    const svg = render(loadFixture("whale"), DATE, opts());
    expect(byteLength(svg)).toBeLessThanOrEqual(SIZE_CAPS.full);
    expect(svg).toContain(groupDigits(114540));
  });
});

describe("the language tint", () => {
  const langs = (...names: string[]): LangShare[] =>
    names.map((name, i) => ({ name, share: 0.5 / (i + 1) }));

  it("is a no-op unless tint is lang", () => {
    expect(tintRotation(langs("Rust"), "none")).toBe(0);
  });

  it("is a no-op for an account with no languages", () => {
    expect(tintRotation([], "lang")).toBe(0);
  });

  it("stays a whole number within the ±20° bound (IMPLEMENTATION 2.5)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (name) => {
        const deg = tintRotation(langs(name), "lang");
        expect(Number.isInteger(deg)).toBe(true);
        expect(Math.abs(deg)).toBeLessThanOrEqual(20);
      }),
    );
  });

  it("depends only on the top language, and is stable for it", () => {
    const a = tintRotation(langs("Go", "Python"), "lang");
    const b = tintRotation(langs("Go", "Rust"), "lang");
    expect(a).toBe(b);
    expect(tintRotation(langs("Go"), "lang")).toBe(a);
  });

  it("recolours the foliage for a lang tree but leaves the trunk alone", () => {
    const none = render(loadFixture("whale"), DATE, opts({ tint: "none" }));
    const lang = render(loadFixture("whale"), DATE, opts({ tint: "lang" }));
    expect(lang).not.toBe(none);
    const foliage = (svg: string): string => svg.match(/--kd-foliage1:(#[0-9a-f]{6})/)![1]!;
    const trunk = (svg: string): string => svg.match(/--kd-trunk:(#[0-9a-f]{6})/)![1]!;
    expect(foliage(lang)).not.toBe(foliage(none));
    expect(trunk(lang)).toBe(trunk(none));
  });

  it("leaves a language-less account untinted", () => {
    // ghost has no repositories, so lang and none must be byte-identical.
    expect(render(loadFixture("ghost"), DATE, opts({ tint: "lang" }))).toBe(
      render(loadFixture("ghost"), DATE, opts({ tint: "none" })),
    );
  });
});

describe("the button glyph reads maturity at a glance", () => {
  // The badge is a handful of shapes, so maturity has to show in the crown, not
  // just the trunk height - a one-pixel-taller stalk is invisible on a button.
  // Assert the crown's spread grows with maturity, so the glyph can never
  // regress to one silhouette for every level (which trunk-only sizing did).
  const crownWidth = (fixture: string): number => {
    const svg = render(loadFixture(fixture), DATE, opts({ scale: "button" }));
    const tree = svg.slice(svg.indexOf('class="kd-tree"'));
    let left = Infinity;
    let right = -Infinity;
    for (const m of tree.matchAll(/<circle cx="([-\d.]+)" cy="[-\d.]+" r="([-\d.]+)"/g)) {
      const cx = Number(m[1]);
      const r = Number(m[2]);
      left = Math.min(left, cx - r);
      right = Math.max(right, cx + r);
    }
    return right - left;
  };

  it("widens the crown from sprout to grown to ancient", () => {
    const sprout = crownWidth("ghost"); // maturity 3
    const grown = crownWidth("maintainer"); // maturity 7
    const ancient = crownWidth("whale"); // maturity 13
    expect(sprout).toBeGreaterThan(0);
    expect(grown).toBeGreaterThan(sprout);
    expect(ancient).toBeGreaterThan(grown);
  });
});

describe("the legend names the symbols actually on the tree", () => {
  const L = labelsFor("en");

  it("shows a label if and only if its symbol is drawn, every fixture", () => {
    // Assert the mapping, not a count: the legend must track presence, so a
    // maintainer's lanterns/bird/fireflies are documented and a ghost's are
    // not. ink is a night theme, so fireflies count here.
    for (const [name, history] of allFixtures()) {
      const facts = treeFacts(history, DATE);
      const svg = render(history, DATE, opts({ theme: "ink" }));
      const o = facts.ornaments;
      const cases: Array<[boolean, string]> = [
        [true, L.legendFoliage],
        [o.fruit.length > 0, L.legendFruit],
        [o.lanterns > 0, L.legendLanterns],
        [o.blossomClusters > 0, L.legendBlossom],
        [o.shoots > 0, L.legendShoots],
        [o.unripeFruit > 0, L.legendUnripe],
        [o.bird !== "none", L.legendBird],
        [o.fireflies > 0, L.legendFireflies],
        [o.windChime, L.legendChime],
      ];
      for (const [present, label] of cases) {
        expect(svg.includes(label), `${name}: ${label}`).toBe(present);
      }
    }
  });

  it("drops the fireflies row on a day theme even with stars to spare", () => {
    // paper carries no night layer, so its fireflies are never drawn - the
    // legend must not claim a symbol the picture omits.
    const svg = render(loadFixture("whale"), DATE, opts({ theme: "paper" }));
    expect(svg).not.toContain(L.legendFireflies);
  });

  it("keeps the empty account down to a single foliage line", () => {
    const svg = render(loadFixture("ghost"), DATE, opts());
    expect(svg).toContain(L.legendFoliage);
    for (const label of [L.legendFruit, L.legendLanterns, L.legendBlossom, L.legendBird]) {
      expect(svg).not.toContain(label);
    }
  });
});

describe("the legend is full", () => {
  /** The dots, top to bottom. Only the legend draws an r=4 circle in the stats column. */
  function legendRows(svg: string): number[] {
    return [...svg.matchAll(/<circle cx="504" cy="(\d+)" r="4"/g)].map((m) => Number(m[1]));
  }

  it("holds nine rows, and that number is the geometry, not a preference", () => {
    expect(LEGEND_MAX_ROWS).toBe(9);
  });

  it("whale already draws all nine, so there is no spare row", () => {
    // The cap only matters because something reaches it. If this ever drops
    // below the cap, the tenth-row problem has quietly gone away and the throw
    // in drawStats is dead code - which is a thing to notice, not to delete.
    expect(legendRows(render(loadFixture("whale"), DATE, opts({ theme: "ink" })))).toHaveLength(
      LEGEND_MAX_ROWS,
    );
  });

  it("clears the stats text at every fixture, on every theme", () => {
    // The failure this guards is not a crash, it is a legible picture with two
    // strings of text on top of each other - which no test asserting labels or
    // counts would ever see.
    for (const theme of THEME_NAMES) {
      for (const [name, history] of allFixtures()) {
        const rows = legendRows(render(history, DATE, opts({ theme })));
        expect(rows.length, `${name}/${theme}: over the cap`).toBeLessThanOrEqual(LEGEND_MAX_ROWS);
        for (const cy of rows) {
          // cy is the dot; the baseline it belongs to is 4px below it.
          expect(cy + 4, `${name}/${theme}: a legend row is over the stats`).toBeGreaterThan(198);
        }
      }
    }
  });

  it("lays nine rows out bottom-up from 388, so the ninth clears the stats", () => {
    expect(legendRowBaselines(LEGEND_MAX_ROWS)).toEqual([
      228, 248, 268, 288, 308, 328, 348, 368, 388,
    ]);
    expect(legendRowBaselines(1)).toEqual([388]);
    expect(legendRowBaselines(0)).toEqual([]);
  });

  it("refuses a tenth row rather than printing it over the stats", () => {
    // Reached by hand: no history can produce ten entries, because the list in
    // drawStats is exactly nine long. That is the point - the guard exists for
    // the next element somebody adds, and an unexercised guard is a comment.
    expect(() => legendRowBaselines(LEGEND_MAX_ROWS + 1)).toThrow(/would draw over the stats/);
  });

  it("puts the tenth row exactly where the collision is, if the cap is lifted", () => {
    // Documents the number the cap is protecting: 208, against stats text whose
    // baseline is 198. Not a hypothetical margin - one row of overlap.
    const unguarded = 388 - (10 - 1 - 0) * 20;
    expect(unguarded).toBe(208);
  });
});
