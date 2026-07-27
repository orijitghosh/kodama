import { describe, expect, it } from "vitest";

import { treeFacts } from "../src/facts.js";
import { receiptsFor } from "../src/receipts.js";
import { render } from "../src/render.js";
import type { NormalizedHistory, RenderOptions } from "../src/types.js";

import { allFixtures, FIXTURE_ANCHOR_DATE, loadFixture } from "./helpers/fixtures.js";
import { historyWith } from "./helpers/history.js";

const OPTIONS: RenderOptions = {
  biome: "bonsai",
  theme: "ink",
  scale: "full",
  animate: false,
  tint: "none",
  species: "classic",
  locale: "en",
};

/**
 * Every class the receipts layer claims to describe. Structural groups
 * (`kd-tree`, `kd-branches`, `kd-pad`, `kd-ornaments`, and the singular
 * `kd-fruit` / `kd-lantern` / `kd-blossom` inside their plural containers) are
 * scaffolding, not statements about a person, and deliberately carry no
 * receipt.
 */
const ACCOUNTABLE = [
  "kd-foliage",
  "kd-shoots",
  "kd-fruits",
  "kd-unripe",
  "kd-lanterns",
  "kd-blossoms",
  "kd-petals",
  "kd-fireflies",
  "kd-bird",
  "kd-chime",
  "kd-substrate",
  "kd-seasonal",
  // The form marks (C.4). A style is the loudest claim the picture makes about a
  // person, so the three additive marks are accountable in both directions like
  // everything else. `kd-substrate` covers the fourth: kokedama replaces the pot
  // rather than adding to it, so it reuses the ground's receipt target.
  "kd-stone",
  "kd-roots",
  "kd-deadwood",
] as const;

/** `class="kd-fruits"` and `class="kd-bird kd-bird-perched"` both count. */
function drawn(svg: string, cls: string): boolean {
  return new RegExp(`class="[^"]*\\b${cls}\\b`).test(svg);
}

describe("receiptsFor", () => {
  it.each(allFixtures())("%s: every receipt points at something drawn", (_name, history) => {
    const facts = treeFacts(history, FIXTURE_ANCHOR_DATE);
    const svg = render(history, FIXTURE_ANCHOR_DATE, OPTIONS);

    for (const receipt of receiptsFor(facts, "en")) {
      expect(drawn(svg, receipt.target), `${receipt.target} has a receipt but is not drawn`).toBe(
        true,
      );
    }
  });

  it.each(allFixtures())("%s: everything drawn about a person has a receipt", (_name, history) => {
    const facts = treeFacts(history, FIXTURE_ANCHOR_DATE);
    const svg = render(history, FIXTURE_ANCHOR_DATE, OPTIONS);
    const targets = new Set(receiptsFor(facts, "en").map((r) => r.target));

    for (const cls of ACCOUNTABLE) {
      if (!drawn(svg, cls)) continue;
      expect(targets.has(cls), `${cls} is drawn with nothing to justify it`).toBe(true);
    }
  });

  it("quotes the figure the element was computed from", () => {
    const history: NormalizedHistory = historyWith({
      // Fruit is drawn from the last ten merged PRs, not from the total, so a
      // total with no stubs behind it correctly draws none.
      recentPRs: [
        { mergedAt: FIXTURE_ANCHOR_DATE, bucket: 2 },
        { mergedAt: "2026-06-01", bucket: 1 },
      ],
      totals: {
        commits: 1200,
        prsMerged: 87,
        prsOpen: 3,
        reviews: 64,
        issuesClosed: 310,
        discussions: 40,
        starsReceived: 9000,
      },
    });
    const facts = treeFacts(history, FIXTURE_ANCHOR_DATE);
    const byTarget = new Map(receiptsFor(facts, "en").map((r) => [r.target, r]));

    // Not a snapshot: the point is that the sentence carries the public number,
    // so a reader can check it against the profile page themselves.
    expect(byTarget.get("kd-fruits")?.provenance).toContain("87 merged pull requests");
    expect(byTarget.get("kd-unripe")?.provenance).toContain("3 open pull requests");
    expect(byTarget.get("kd-lanterns")?.provenance).toContain("64 code reviews");
    expect(byTarget.get("kd-bird")?.provenance).toContain("310 closed issues");
    expect(byTarget.get("kd-chime")?.provenance).toContain("40 answered discussions");
    expect(byTarget.get("kd-fireflies")?.provenance).toContain("9000 stars");
  });

  it("says nothing about ornaments a history did not earn", () => {
    const facts = treeFacts(loadFixture("ghost"), FIXTURE_ANCHOR_DATE);
    const targets = receiptsFor(facts, "en").map((r) => r.target);

    expect(targets).not.toContain("kd-fruits");
    expect(targets).not.toContain("kd-lanterns");
    expect(targets).not.toContain("kd-bird");
    // The tree and its pot are always there, and always have a reason.
    expect(targets).toContain("kd-foliage");
    expect(targets).toContain("kd-substrate");
  });

  it("is pure: same facts, same receipts", () => {
    const facts = treeFacts(loadFixture("maintainer"), FIXTURE_ANCHOR_DATE);
    expect(receiptsFor(facts, "en")).toEqual(receiptsFor(facts, "en"));
  });

  it("localizes the label and leaves the provenance in English", () => {
    const facts = treeFacts(loadFixture("maintainer"), FIXTURE_ANCHOR_DATE);
    const en = receiptsFor(facts, "en");
    const ja = receiptsFor(facts, "ja");

    expect(ja.map((r) => r.target)).toEqual(en.map((r) => r.target));
    expect(ja.map((r) => r.provenance)).toEqual(en.map((r) => r.provenance));
    const foliage = ja.find((r) => r.target === "kd-foliage");
    expect(foliage?.label).toBe("葉: これまでのコミット");
  });

  it("has no receipt without a value or a reason", () => {
    for (const [, history] of allFixtures()) {
      const facts = treeFacts(history, FIXTURE_ANCHOR_DATE);
      for (const receipt of receiptsFor(facts, "en")) {
        expect(receipt.label.length).toBeGreaterThan(0);
        expect(receipt.value.length).toBeGreaterThan(0);
        expect(receipt.provenance.length).toBeGreaterThan(0);
      }
    }
  });
});
