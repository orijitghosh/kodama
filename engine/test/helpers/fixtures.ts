import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertHistoryV1 } from "../../src/validate.js";
import type { NormalizedHistory } from "../../src/types.js";

const fixturesDir = resolve(import.meta.dirname, "../../fixtures");

interface FixtureIndex {
  anchorDate: string;
  fixtures: string[];
}

const index = JSON.parse(
  readFileSync(resolve(fixturesDir, "index.json"), "utf8"),
) as FixtureIndex;

/** The date every fixture is authored against. Never "today" - see the generator. */
export const FIXTURE_ANCHOR_DATE = index.anchorDate;

export const FIXTURE_NAMES = index.fixtures;

const cache = new Map<string, NormalizedHistory>();

export function loadFixture(name: string): NormalizedHistory {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(readFileSync(resolve(fixturesDir, `${name}.json`), "utf8"));
  const history = assertHistoryV1(raw);
  cache.set(name, history);
  return history;
}

export function allFixtures(): Array<[string, NormalizedHistory]> {
  return FIXTURE_NAMES.map((name) => [name, loadFixture(name)]);
}

/** The six fixtures the taste gate judges (TASTE §5). */
export const GALLERY_FIXTURES = [
  "ghost",
  "newcomer",
  "grinder",
  "maintainer",
  "whale",
  "veteran",
] as const;
