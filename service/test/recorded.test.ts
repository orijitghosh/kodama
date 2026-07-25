/**
 * Round-trip against the responses SPIKE-GRAPHQL recorded from the live API.
 *
 * The other normalize tests use hand-built responses, which cover the rules but
 * not the shape. These are what GitHub actually sent: 17 and 19 years of real
 * calendar, real language mixes, connections full of nulls.
 *
 * My own account is not recorded here (SPIKE-GRAPHQL §6), and the suite skips
 * whatever is not on disk rather than depending on it.
 *
 * The recordings live in the owner's local notebook, which is not in the repo, so
 * these cases run locally and are absent on CI. That is a real gap and the suite
 * says so out loud (`it.skip` below, and one reported case count) rather than
 * quietly shrinking to nothing - the failure mode this file exists to prevent is
 * coverage disappearing without anyone noticing. Moving the two public-account
 * recordings into `service/test/fixtures/` would put them back under CI; they are
 * public data, and only my own account's responses are sensitive.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertHistory, render, treeFacts } from "@kodama/engine";
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

/**
 * A recording made before a query branch was added cannot be normalized, and it
 * is a stale local artifact rather than a bug in this repo - refreshing it needs
 * a token and a live API, which CI has and the owner's notebook has and this
 * suite has neither of on demand.
 *
 * So the missing-branch case becomes a named skip, and *only* that case: any
 * other failure still fails, because "the recording is old" must never become
 * the excuse that hides a real normalizer regression. The message names the
 * field, so the fix is obvious when someone reads the run.
 */
const STALE_FIELD = "commitContributionsByRepository";

function attempt(record: Recorded): { history: ReturnType<typeof normalize> } | { stale: string } {
  try {
    return { history: normalize({ profile: record.profile, years: record.years, fetchedAt: FETCHED_AT }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes(STALE_FIELD)) return { stale: message };
    throw err;
  }
}

describe("recorded GitHub responses", () => {
  // Named so a run tells you which environment you are reading: two cases here
  // means the notebook is present, zero means this is CI and the real-shape
  // round trip did not run at all.
  if (recorded.length === 0) {
    it.skip("no recordings on disk - real-response round trip not covered here", () => undefined);
  } else {
    it("found the recordings", () => {
      expect(recorded.length).toBe(2);
    });
  }

  for (const record of recorded) {
    const login = record.login;
    const result = attempt(record);

    if ("stale" in result) {
      describe(login, () => {
        it.skip(`recording predates the ${STALE_FIELD} branch - re-record to cover it`, () => undefined);
      });
      continue;
    }

    describe(login, () => {
      const history = result.history;

      it("normalizes into a history the engine's own guard accepts", () => {
        expect(() => assertHistory(history)).not.toThrow();
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
        expect(assertHistory(JSON.parse(JSON.stringify(history)))).toEqual(history);
      });

      it("renders", () => {
        const svg = render(history, FETCHED_AT, {
          biome: "bonsai",
          theme: "ink",
          scale: "full",
          animate: false,
          tint: "lang",
          species: "classic",
          locale: "en",
        });
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).not.toContain("NaN");
        expect(treeFacts(history, FETCHED_AT).maturity).toBeGreaterThanOrEqual(3);
      });
    });
  }
});
