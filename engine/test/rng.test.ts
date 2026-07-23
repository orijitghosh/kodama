import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { fnv1a32, mulberry32, seedFromLogin, streamsFor, streamsForLogin } from "../src/rng.js";

describe("FNV-1a", () => {
  it("matches the reference vectors", () => {
    // Published FNV-1a 32-bit test vectors; a snapshot of our own output would
    // only prove we are consistent with ourselves.
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });

  it("stays inside the unsigned 32-bit range", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const hash = fnv1a32(s);
        expect(Number.isInteger(hash)).toBe(true);
        expect(hash).toBeGreaterThanOrEqual(0);
        expect(hash).toBeLessThanOrEqual(0xffffffff);
      }),
    );
  });
});

describe("the login seed", () => {
  it("ignores casing so a URL cannot fork a tree", () => {
    expect(seedFromLogin("Arijit")).toBe(seedFromLogin("arijit"));
    expect(seedFromLogin("TORVALDS")).toBe(seedFromLogin("torvalds"));
  });

  it("separates different logins", () => {
    const seeds = ["alice", "bob", "carol", "dave", "erin"].map(seedFromLogin);
    expect(new Set(seeds).size).toBe(seeds.length);
  });
});

describe("mulberry32", () => {
  it("is locked to a cross-platform value snapshot", () => {
    // This is the determinism contract in its most literal form: if these
    // numbers ever change, every user's tree changed with them.
    const rng = mulberry32(seedFromLogin("kodama"));
    const drawn = rng.take(5).map((n) => n.toFixed(12));
    expect(drawn).toMatchInlineSnapshot(`
      [
        "0.840733424062",
        "0.418315920979",
        "0.565962122753",
        "0.809644700028",
        "0.863602991216",
      ]
    `);
  });

  it("produces the same sequence for the same seed", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        expect(mulberry32(seed).take(20)).toEqual(mulberry32(seed).take(20));
      }),
    );
  });

  it("stays within [0, 1)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        for (const value of mulberry32(seed).take(50)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1);
        }
      }),
    );
  });

  it("spreads roughly uniformly across ten buckets", () => {
    const buckets = new Array<number>(10).fill(0);
    const rng = mulberry32(12345);
    const draws = 100_000;
    for (let i = 0; i < draws; i += 1) {
      buckets[Math.floor(rng.next() * 10)]! += 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(draws / 10 - 1000);
      expect(count).toBeLessThan(draws / 10 + 1000);
    }
  });

  it("respects range and int bounds", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const f = rng.range(-3, 9);
      expect(f).toBeGreaterThanOrEqual(-3);
      expect(f).toBeLessThan(9);
      const n = rng.int(2, 5);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it("clones without consuming the original", () => {
    const rng = mulberry32(99);
    rng.take(3);
    const lookahead = rng.clone().take(4);
    expect(rng.take(4)).toEqual(lookahead);
  });
});

describe("labelled substreams", () => {
  it("gives a stable sequence per (seed, label)", () => {
    const a = streamsFor(1234);
    const b = streamsFor(1234);
    expect(a.for("attractors").take(10)).toEqual(b.for("attractors").take(10));
  });

  it("keeps subsystems independent", () => {
    // The property that matters: adding a draw site later must not reshuffle
    // an existing one. Independent streams make that structural.
    const streams = streamsFor(seedFromLogin("maintainer"));
    const attractorsBefore = streams.for("attractors").take(20);

    streams.for("wind-chime").take(50);
    streams.for("fireflies").take(200);

    expect(streams.for("attractors").take(20)).toEqual(attractorsBefore);
  });

  it("decorrelates different labels under one seed", () => {
    const streams = streamsFor(42);
    const a = streams.for("attractors").take(30);
    const b = streams.for("blossoms").take(30);
    expect(a).not.toEqual(b);
    // Nor should they be trivially offset copies of each other.
    expect(a.slice(1)).not.toEqual(b.slice(0, 29));
  });

  it("decorrelates the same label under different seeds", () => {
    const a = streamsForLogin("alice").for("attractors").take(30);
    const b = streamsForLogin("bob").for("attractors").take(30);
    expect(a).not.toEqual(b);
  });

  it("is locked to a value snapshot per label", () => {
    const streams = streamsForLogin("kodama");
    const sample = (label: string): string =>
      streams
        .for(label)
        .take(3)
        .map((n) => n.toFixed(6))
        .join(",");
    expect({
      attractors: sample("attractors"),
      pads: sample("pads"),
      ornaments: sample("ornaments"),
    }).toMatchInlineSnapshot(`
      {
        "attractors": "0.889728,0.922607,0.502814",
        "ornaments": "0.867242,0.947938,0.767630",
        "pads": "0.378159,0.595216,0.048201",
      }
    `);
  });
});
