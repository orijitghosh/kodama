/**
 * Species: the option, and the ways a tree may not change because of it.
 *
 * The interesting assertions here are the negative ones. `classic` must stay the
 * tree that shipped, and an alternate must change what the plant is made of and
 * nothing about what it earned - no pad count, no ornament count, no numbers on
 * the card. That is what keeps two people with the same history and different
 * taste comparable, and it is what D-005's monotonicity promise rests on once a
 * costume exists at all.
 */

import { describe, expect, it } from "vitest";

import { treeFacts } from "../src/facts.js";
import { receiptsFor } from "../src/receipts.js";
import { groupDigits, render } from "../src/render.js";
import { DEFAULT_SPECIES, isClassic, SPECIES_NAMES, speciesByName } from "../src/species.js";
import type { SpeciesName } from "../src/species.js";
import type { RenderOptions } from "../src/types.js";

import { FIXTURE_ANCHOR_DATE, loadFixture } from "./helpers/fixtures.js";
import { historyWith } from "./helpers/history.js";

const DATE = FIXTURE_ANCHOR_DATE;
const AUTUMN = "2025-10-08";

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

/** The four alternates: everything that is not the default. */
const ALTERNATES = SPECIES_NAMES.filter((name) => name !== DEFAULT_SPECIES);

function countClass(svg: string, cls: string): number {
  return (svg.match(new RegExp(`class="${cls}"`, "g")) ?? []).length;
}

function foliageOf(svg: string): string {
  return /--kd-foliage1:(#[0-9a-f]{6})/.exec(svg)?.[1] ?? "";
}

describe("the species table", () => {
  it("offers the classic tree plus four alternates", () => {
    expect(SPECIES_NAMES).toEqual(["classic", "momiji", "ginkgo", "sakura", "fuji"]);
    expect(DEFAULT_SPECIES).toBe("classic");
  });

  it("gives every name a complete record", () => {
    for (const name of SPECIES_NAMES) {
      const species = speciesByName(name);
      expect(species.name, name).toBe(name);
      expect(species.label.length, name).toBeGreaterThan(2);
    }
  });

  it("leaves the classic tree with no leaf symbol and no autumn of its own", () => {
    const classic = speciesByName("classic");
    expect(classic.leaf).toBeNull();
    expect(classic.autumn).toBeNull();
    expect(classic.fruit).toBe("persimmon");
    expect(classic.blossom).toBe("fivePetal");
  });

  it("gives every alternate a leaf and an autumn", () => {
    for (const name of ALTERNATES) {
      const species = speciesByName(name);
      expect(species.leaf, name).not.toBeNull();
      expect(species.autumn, name).not.toBeNull();
    }
  });

  it("answers with the default for a name it does not know", () => {
    // The route validates before this point, so an unknown name should be
    // impossible - but a throw here would break the "always a tree" contract.
    expect(speciesByName("nonsense" as SpeciesName).name).toBe("classic");
    expect(isClassic(speciesByName("nonsense" as SpeciesName))).toBe(true);
  });
});

describe("the default is the tree that shipped", () => {
  it("draws no symbol and references none", () => {
    for (const fixture of ["ghost", "maintainer", "whale"]) {
      const svg = render(loadFixture(fixture), DATE, opts());
      expect(svg, fixture).not.toContain("<symbol");
      expect(svg, fixture).not.toContain("<use");
    }
  });

  it("names no plant in the header or the spoken tree", () => {
    const svg = render(loadFixture("maintainer"), DATE, opts());
    expect(svg).not.toContain("<tspan");
    expect(svg).toMatch(/<title>A \d+-year tree,/);
    expect(svg).not.toMatch(/Drawn as a/);
  });

  it("keeps the global amber in autumn", () => {
    const classic = foliageOf(render(loadFixture("maintainer"), AUTUMN, opts()));
    const maple = foliageOf(render(loadFixture("maintainer"), AUTUMN, opts({ species: "momiji" })));
    expect(classic).not.toBe(maple);
  });

  it("says nothing about a species in its receipts", () => {
    const receipts = receiptsFor(treeFacts(loadFixture("maintainer"), DATE), "en");
    const foliage = receipts.find((r) => r.target === "kd-foliage");
    expect(foliage?.provenance).not.toMatch(/species|plant|chosen/i);
  });
});

describe("an alternate species", () => {
  it("defines one leaf symbol and uses it for the crown", () => {
    const svg = render(loadFixture("maintainer"), DATE, opts({ species: "ginkgo" }));
    expect(svg.match(/<symbol/g) ?? []).toHaveLength(1);
    expect(svg).toContain('href="#kd-l-gin"');
  });

  it("draws a different crown per plant", () => {
    const rendered = ALTERNATES.map((species) =>
      render(loadFixture("maintainer"), DATE, opts({ species })),
    );
    expect(new Set(rendered).size).toBe(ALTERNATES.length);
  });

  it("names itself in the header and in the spoken tree", () => {
    const svg = render(loadFixture("maintainer"), DATE, opts({ species: "momiji" }));
    expect(svg).toContain("Japanese maple");
    expect(svg).toMatch(/<desc>[^<]*Drawn as a Japanese maple/);
  });

  it("explains itself as a choice, not as a reading of the account", () => {
    const receipts = receiptsFor(
      treeFacts(loadFixture("maintainer"), DATE),
      "en",
      speciesByName("ginkgo"),
    );
    const foliage = receipts.find((r) => r.target === "kd-foliage");
    expect(foliage?.provenance).toContain("?species=ginkgo");
    expect(foliage?.provenance).toContain("none of the counts");
    // An earlier draft derived the plant from the top language. Nothing here may
    // claim that again: a chosen costume is not evidence about anybody.
    expect(foliage?.provenance).not.toMatch(/language|bytes/i);
  });

  it("changes nothing the account earned", () => {
    const facts = treeFacts(loadFixture("maintainer"), DATE);
    const classic = render(loadFixture("maintainer"), DATE, opts());

    for (const species of SPECIES_NAMES) {
      const svg = render(loadFixture("maintainer"), DATE, opts({ species }));
      expect(countClass(svg, "kd-pad"), species).toBe(countClass(classic, "kd-pad"));
      expect(countClass(svg, "kd-fruit"), species).toBe(facts.ornaments.fruit.length);
      expect(countClass(svg, "kd-lantern"), species).toBe(countClass(classic, "kd-lantern"));
      // The hero number on the card is the same tree's history either way.
      expect(svg, species).toContain(`>${groupDigits(facts.totals.commits)}<`);
    }
  });

  it("brings its own autumn, and only autumn", () => {
    const autumns = new Set(
      SPECIES_NAMES.map((species) =>
        foliageOf(render(loadFixture("maintainer"), AUTUMN, opts({ species }))),
      ),
    );
    // classic amber, maple scarlet, ginkgo gold, and cherry and wisteria sharing a
    // soft yellow: four distinct autumns across five plants.
    expect(autumns.size).toBe(4);

    // Summer is authored rather than shifted, so every plant shares it.
    const summers = new Set(
      SPECIES_NAMES.map((species) =>
        foliageOf(render(loadFixture("maintainer"), DATE, opts({ species }))),
      ),
    );
    expect(summers.size).toBe(1);
  });

  it("gives each plant its own fruit at the same size", () => {
    const fruity = { recentPRs: [{ mergedAt: "2026-07-12", bucket: 3 as const }] };
    const classic = render(historyWith(fruity), DATE, opts());
    const maple = render(historyWith(fruity), DATE, opts({ species: "momiji" }));
    const cherry = render(historyWith(fruity), DATE, opts({ species: "sakura" }));

    // A persimmon is a disc of the bucket's radius; a samara is two curved blades;
    // a cherry is a pair of smaller discs.
    expect(classic).toContain('r="8"');
    expect(maple).not.toContain('r="8"');
    expect(maple).toMatch(/<path d="M[^"]*C/);
    expect(cherry).toContain('r="4.96"');
  });

  it("flowers in its own form without changing how many flowers are earned", () => {
    const streaky = historyWith({
      streak: { current: 200, longest: 200, lastActiveDate: DATE },
      weeks: [{ w: "2026-W29", c: 20 }],
    });
    const classic = render(streaky, DATE, opts());
    const wisteria = render(streaky, DATE, opts({ species: "fuji" }));

    expect(countClass(classic, "kd-blossom")).toBe(countClass(wisteria, "kd-blossom"));
    expect(countClass(classic, "kd-blossom")).toBeGreaterThan(0);
    expect(classic).not.toBe(wisteria);
  });

  it("collapses back to discs below full scale", () => {
    for (const scale of ["compact", "strip", "button"] as const) {
      const svg = render(loadFixture("maintainer"), DATE, opts({ species: "ginkgo", scale }));
      expect(svg, scale).not.toContain("<symbol");
      expect(svg, scale).not.toContain("<use");
    }
  });

  it("keeps every plant inside the size cap on a whale", () => {
    // The size case: ~150 leaf instances. PROPOSAL-VARIETALS §7.5 asked for this
    // to be measured rather than guessed.
    for (const species of SPECIES_NAMES) {
      const svg = render(loadFixture("whale"), DATE, opts({ species }));
      expect(new TextEncoder().encode(svg).length, species).toBeLessThanOrEqual(60 * 1024);
    }
  });

  it("stays deterministic", () => {
    const once = render(loadFixture("whale"), DATE, opts({ species: "fuji" }));
    expect(render(loadFixture("whale"), DATE, opts({ species: "fuji" }))).toBe(once);
  });
});

describe("stars are drawn on every theme (butterflies)", () => {
  const starred = historyWith({
    totals: {
      commits: 400,
      prsMerged: 0,
      prsOpen: 0,
      reviews: 0,
      issuesClosed: 0,
      discussions: 0,
      starsReceived: 900,
    },
  });

  it("draws fireflies at night and butterflies by day", () => {
    // Matched as a class, not as a substring: every palette declares a
    // `--kd-firefly` slot whether or not a firefly is on the tree.
    for (const theme of ["ink", "dusk", "yozakura"] as const) {
      const svg = render(starred, DATE, opts({ theme }));
      expect(svg, theme).toContain('class="kd-firefly"');
      expect(svg, theme).not.toContain('class="kd-butterfly"');
    }
    for (const theme of ["paper", "sakura", "shore"] as const) {
      const svg = render(starred, DATE, opts({ theme }));
      expect(svg, theme).toContain('class="kd-butterfly"');
      expect(svg, theme).not.toContain('class="kd-firefly"');
    }
  });

  it("draws the same number of marks either way", () => {
    const night = render(starred, DATE, opts({ theme: "ink" }));
    const day = render(starred, DATE, opts({ theme: "paper" }));
    expect(countClass(day, "kd-butterfly")).toBe(countClass(night, "kd-firefly"));
    expect(countClass(day, "kd-butterfly")).toBeGreaterThan(0);
  });

  it("keeps the group class, so the receipt still points at something", () => {
    // `receiptsFor` is theme-blind by construction, so both marks live in the
    // group the receipt names.
    expect(render(starred, DATE, opts({ theme: "paper" }))).toContain('class="kd-butterflies"');
    expect(render(starred, DATE, opts({ theme: "ink" }))).toContain('class="kd-fireflies"');
  });

  it("names whichever mark is drawn in the legend", () => {
    expect(render(starred, DATE, opts({ theme: "paper" }))).toContain(
      "butterflies: stars received",
    );
    expect(render(starred, DATE, opts({ theme: "ink" }))).toContain("fireflies: stars received");
  });

  it("stays full-scale only, like the fireflies it stands in for", () => {
    for (const scale of ["compact", "strip", "button"] as const) {
      const svg = render(starred, DATE, opts({ theme: "paper", scale }));
      expect(svg, scale).not.toContain('class="kd-butterfly"');
    }
  });

  it("moves without breathing, and stops for reduced motion", () => {
    const svg = render(starred, DATE, opts({ theme: "paper", animate: true }));
    // A firefly's dim-to-bright reads as a flicker on anything with wings, so the
    // butterfly takes the drift without the opacity.
    expect(svg).toContain(".kd-butterfly{animation:kd-wander");
    expect(svg).toMatch(/prefers-reduced-motion:reduce\)\{[^}]*\.kd-butterfly/);
  });
});
