/**
 * Round-trip against the responses SPIKE-GRAPHQL recorded from the live API.
 *
 * The other normalize tests use hand-built responses, which cover the rules but
 * not the shape. These are what GitHub actually sent: 17 and 19 years of real
 * calendar, real language mixes, connections full of nulls.
 *
 * My own account is not recorded here (SPIKE-GRAPHQL §6), and the suite skips
 * whatever is not on disk rather than depending on it.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertHistoryV1, render, treeFacts } from "@kodama/engine";
import { describe, expect, it } from "vitest";

import { normalize } from "../src/normalize.js";

const RECORDED = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dev", "spikes", "graphql");
const FETCHED_AT = "2026-07-21";

interface Recorded {
  login: string;
  profile: unknown;
  years: unknown[];
}

const load = (login: string): Recorded | null => {
  const profilePath = join(RECORDED, `${login}.profile.json`);
  const yearsPath = join(RECORDED, `${login}.years.json`);
  if (!existsSync(profilePath) || !existsSync(yearsPath)) return null;
  return {
    login,
    profile: JSON.parse(readFileSync(profilePath, "utf8")),
    years: JSON.parse(readFileSync(yearsPath, "utf8")) as unknown[],
  };
};

const recorded = ["sindresorhus", "defunkt"]
  .map(load)
  .filter((r): r is Recorded => r !== null);

describe("recorded GitHub responses", () => {
  it("found the committed fixtures", () => {
    expect(recorded.length).toBeGreaterThan(0);
  });

  for (const { login, profile, years } of recorded) {
    describe(login, () => {
      const history = normalize({ profile, years, fetchedAt: FETCHED_AT });

      it("normalizes into a history the engine's own guard accepts", () => {
        expect(() => assertHistoryV1(history)).not.toThrow();
        expect(history.login).toBe(login);
        expect(history.weeks.length).toBeGreaterThan(100);
      });

      it("holds the schema invariants on real data", () => {
        expect(history.streak.current).toBeLessThanOrEqual(history.streak.longest);
        expect(history.languages.length).toBeLessThanOrEqual(5);
        expect(history.languages.reduce((sum, l) => sum + l.share, 0)).toBeLessThanOrEqual(1);
        expect(history.recentPRs.length).toBeLessThanOrEqual(10);
        for (let i = 1; i < history.weeks.length; i += 1) {
          expect(history.weeks[i - 1]!.w < history.weeks[i]!.w).toBe(true);
        }
      });

      it("respects the daily cap across a decade of real days", () => {
        // 30/day × 7 is the most any single week can legally hold.
        for (const week of history.weeks) expect(week.c).toBeLessThanOrEqual(210);
      });

      it("survives a round trip through JSON, as KV will store it", () => {
        expect(assertHistoryV1(JSON.parse(JSON.stringify(history)))).toEqual(history);
      });

      it("renders", () => {
        const svg = render(history, FETCHED_AT, {
          biome: "bonsai",
          theme: "ink",
          scale: "full",
          animate: false,
          tint: "lang",
          locale: "en",
        });
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).not.toContain("NaN");
        expect(treeFacts(history, FETCHED_AT).maturity).toBeGreaterThanOrEqual(3);
      });
    });
  }
});
