/**
 * The gallery and grammar specimens.
 *
 * Build-time only. Nothing here is reachable from a client bundle: the pages
 * that use it render their SVG during `astro build` and ship the result.
 *
 * TASTE §5 says the gallery reuses the taste-gate artifacts. It re-renders them
 * instead, from the same fixtures at the same dates, because `dev/` is excluded
 * from the deployment upload and because the gallery should show what currently
 * ships.
 *
 * The bytes differ slightly from the gate artifacts: since Gate #1 the
 * animation layer (M3.2) wraps each firefly in its own `<g>` so it can drift.
 * Shapes, coordinates and colours are unchanged, and
 * `engine/test/taste-gate.test.ts` fails if the drawing ever diverges from what
 * was approved.
 */

import { render } from "@kodama/engine";
import type { NormalizedHistory, ThemeName } from "@kodama/engine";

import ghost from "@kodama/engine/fixtures/ghost.json" with { type: "json" };
import grinder from "@kodama/engine/fixtures/grinder.json" with { type: "json" };
import maintainer from "@kodama/engine/fixtures/maintainer.json" with { type: "json" };
import newcomer from "@kodama/engine/fixtures/newcomer.json" with { type: "json" };
import veteran from "@kodama/engine/fixtures/veteran.json" with { type: "json" };
import whale from "@kodama/engine/fixtures/whale.json" with { type: "json" };

/**
 * Imported rather than read off disk. The first attempt used `node:fs` with a
 * path relative to this module, which works until Astro bundles it into
 * `site/dist/` and the relative anchor stops meaning anything; resolving the
 * package by name is immune to that and to pnpm's symlinks. It also makes the
 * fixtures an explicit part of the engine's public surface, which is honest -
 * the taste gate judged them and this page displays them.
 */
const HISTORIES: Record<string, NormalizedHistory> = {
  ghost,
  newcomer,
  grinder,
  maintainer,
  whale,
  veteran,
} as unknown as Record<string, NormalizedHistory>;

/** TASTE §5: the same two dates the taste gate judged. */
export const SPECIMEN_DATES = {
  summer: "2026-07-15",
  winter: "2026-01-20",
} as const;

export type SpecimenSeason = keyof typeof SPECIMEN_DATES;

export const SPECIMEN_SEASONS = Object.keys(SPECIMEN_DATES) as SpecimenSeason[];

export const SPECIMEN_THEMES: ThemeName[] = ["ink", "dusk"];

export interface Specimen {
  fixture: string;
  title: string;
  caption: string;
}

/** The six the gate judged, in the order they tell a story. */
export const SPECIMENS: Specimen[] = [
  {
    fixture: "ghost",
    title: "The ghost",
    caption:
      "An account with no public activity. A sprout in a plastic pot - the empty state has to be charming, not an accusation.",
  },
  {
    fixture: "newcomer",
    title: "The newcomer",
    caption: "A few months in. Sparse pads, bright shoots, everything still ahead of it.",
  },
  {
    fixture: "grinder",
    title: "The grinder",
    caption: "Daily commits, long streak. Blossom clusters open at fourteen days and keep opening.",
  },
  {
    fixture: "maintainer",
    title: "The maintainer",
    caption:
      "Reviews and closed issues rather than raw volume: lanterns down the branches, a bird settled in, a chime for the discussions.",
  },
  {
    fixture: "whale",
    title: "The whale",
    caption:
      "Six figures of contribution. Log buckets keep it composed - a whale is unmistakable without whiting out the canvas.",
  },
  {
    fixture: "veteran",
    title: "The decade veteran",
    caption: "Past ten years: a stone pot, thick trunk, and the crane's anniversary week.",
  },
];

export function loadFixture(name: string): NormalizedHistory {
  const history = HISTORIES[name];
  if (history === undefined) throw new Error(`no fixture named ${name}`);
  return history;
}

export interface SpecimenId {
  fixture: string;
  theme: ThemeName;
  season: SpecimenSeason;
}

/** `maintainer-ink-summer` - the taste gate's own filenames, minus the suffix. */
export function specimenId(id: SpecimenId): string {
  return `${id.fixture}-${id.theme}-${id.season}`;
}

export function renderSpecimen(id: SpecimenId, animate = false): string {
  return render(loadFixture(id.fixture), SPECIMEN_DATES[id.season], {
    biome: "bonsai",
    theme: id.theme,
    scale: "full",
    // Off in the gallery: twelve animated trees on one page is a motion
    // problem the taste rules exist to prevent, and a Lighthouse problem too.
    animate,
    tint: "none",
    locale: "en",
  });
}

/** Every gallery image: six specimens, two themes, two seasons. */
export function allSpecimenIds(): SpecimenId[] {
  const ids: SpecimenId[] = [];
  for (const specimen of SPECIMENS) {
    for (const theme of SPECIMEN_THEMES) {
      for (const season of SPECIMEN_SEASONS) {
        ids.push({ fixture: specimen.fixture, theme, season });
      }
    }
  }
  return ids;
}
