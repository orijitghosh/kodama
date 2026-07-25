import type { SpeciesName } from "./species.js";

/**
 * The engine's data contract (SPEC-ENGINE §1-2).
 *
 * NormalizedHistory is provider-agnostic on purpose (D-004): nothing here says
 * "GitHub", and nothing says "tree". Biomes map the generic vocabulary -
 * substrate / masses / ornaments / inhabitants - onto their own imagery.
 */

// ---------------------------------------------------------------------------
// NormalizedHistory v1 - frozen once M4 ships
// ---------------------------------------------------------------------------

/** One ISO week with activity. Weeks with zero activity are omitted. */
export interface WeekCell {
  /** ISO week label, e.g. "2026-W29". */
  w: string;
  /** Commits in the week, already daily-capped at fetch time (SPEC-ENGINE §3.1). */
  c: number;
}

/** A merged pull request, reduced to what the grammar needs. */
export interface PRStub {
  /** "YYYY-MM-DD". */
  mergedAt: string;
  /** Additions bucket: 1 = <100, 2 = <1000, 3 = >=1000. */
  bucket: 1 | 2 | 3;
}

export interface LangShare {
  name: string;
  /** Fraction of repo-weighted bytes; shares sum to <= 1. */
  share: number;
}

export interface HistoryTotals {
  /** Post-cap sum (SPEC-ENGINE §3.1). */
  commits: number;
  prsMerged: number;
  prsOpen: number;
  reviews: number;
  issuesClosed: number;
  discussions: number;
  /** Summed over owned repos, top 100 by stars at fetch time. */
  starsReceived: number;
}

export interface HistoryStreak {
  /** Days, per the contribution calendar. */
  current: number;
  longest: number;
  /** "YYYY-MM-DD" of the last non-zero day. */
  lastActiveDate: string;
}

export interface NormalizedHistory {
  v: 1;
  login: string;
  /** "YYYY-MM-DD". */
  fetchedAt: string;
  /** "YYYY-MM-DD" account creation date. */
  createdAt: string;
  /** Lifetime, ascending, one entry per ISO week with activity. */
  weeks: WeekCell[];
  totals: HistoryTotals;
  streak: HistoryStreak;
  /** Last 10 merged PRs, newest first. */
  recentPRs: PRStub[];
  /** Top 5 by repo-weighted bytes. */
  languages: LangShare[];
}

// ---------------------------------------------------------------------------
// Render options
// ---------------------------------------------------------------------------

export const THEME_NAMES = [
  "ink",
  "dusk",
  "paper",
  "sakura",
  "yozakura",
  "shore",
] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export const SCALES = ["full", "compact", "strip", "button"] as const;
export type Scale = (typeof SCALES)[number];

export const BIOMES = ["bonsai"] as const;
export type Biome = (typeof BIOMES)[number];

export interface RenderOptions {
  /** Only "bonsai" in v1; validated anyway (D-004). */
  biome: Biome;
  theme: ThemeName;
  scale: Scale;
  /** The caller resolves "auto" against prefers-reduced-motion before we see it. */
  animate: boolean;
  tint: "lang" | "none";
  /**
   * Which plant to draw (species.ts). `classic` is the tree as shipped and the
   * default; the alternates are a choice, never derived from the history, so this
   * lives here with the other URL options rather than in TreeFacts.
   */
  species: SpeciesName;
  /** BCP-47. Affects <title>/<desc> and labels only. */
  locale: string;
}

// ---------------------------------------------------------------------------
// Palettes and themes
// ---------------------------------------------------------------------------

/** The 14 named slots every palette fills (SPEC-ENGINE §4). */
export interface Palette {
  bg: string;
  card: string;
  border: string;
  trunk: string;
  foliage1: string;
  foliage2: string;
  foliage3: string;
  blossom1: string;
  blossom2: string;
  fruit1: string;
  fruit2: string;
  accent: string;
  /**
   * Fireflies and lantern glow, specified per theme in TASTE §3.
   *
   * These are separate slots rather than reuses of `accent` because TASTE
   * gives them their own hexes, and because a firefly drawn in the accent
   * colour is indistinguishable from a small fruit (D-020).
   */
  firefly: string;
  glow: string;
  /**
   * Settled and falling snow. Cannot borrow `textPrimary`: that slot inverts
   * between colour schemes, and snow has to stay pale in both.
   */
  snow: string;
  textPrimary: string;
  textSecondary: string;
}

export interface Theme {
  name: ThemeName;
  dark: Palette;
  light: Palette;
  /** Night themes get fireflies and lantern glow. */
  night: boolean;
}

// ---------------------------------------------------------------------------
// TreeFacts - the single source of truth (SPEC-ENGINE §1)
// ---------------------------------------------------------------------------

export type Season = "spring" | "summer" | "autumn" | "winter";
export type Weather = "sun" | "calm" | "overcast";
export type PotTier = "plastic" | "clay" | "glazed" | "antique" | "stone";

export type PlaqueKind =
  | "commits1k"
  | "commits10k"
  | "prs100"
  | "decade";

export type SpiritTrigger =
  | "anniversary"
  | "streakRecord"
  | "commits100"
  | "commits1k"
  | "commits10k";

export type VisitorKind = "fox" | "koi" | "crane";

export interface Plaque {
  kind: PlaqueKind;
  /**
   * "YYYY-MM-DD" the threshold was crossed, resolved from the weeks cumsum to
   * the Monday of the crossing week - the finest resolution v1 carries.
   *
   * `null` where the schema genuinely cannot prove a date: v1 keeps only the
   * last ten pull requests, so the day a user's hundredth PR merged is not
   * recoverable. The receipts layer shows the absence rather than an estimate.
   */
  earnedAt: string | null;
}

export interface SeasonalEvent {
  kind: "hanami" | "harvest" | "firstSnow" | "settledSnow";
}

export interface OrnamentCounts {
  shoots: number;
  fruit: FruitFact[];
  unripeFruit: number;
  lanterns: number;
  fireflies: number;
  blossomClusters: number;
  fallingPetals: number;
  soilPetalRing: boolean;
  bird: "none" | "perched" | "nesting";
  windChime: boolean;
}

export interface FruitFact {
  /** 0 = just merged (green), 1 = fully ripe persimmon. */
  ripeness: number;
  bucket: 1 | 2 | 3;
  mergedAt: string;
}

export interface TreeFacts {
  login: string;
  /** The render date, "YYYY-MM-DD" UTC - the only time source. */
  date: string;

  /** Fractional years since createdAt. */
  accountYears: number;
  /** Sum of log2(1 + weekly commits). */
  growthUnits: number;
  /** 3..13. Gates the skeleton. */
  maturity: number;
  /** 4..9 leaf clusters per pad, from the within-level growth residual. */
  padDensity: number;
  /** Trunk stroke width in px. */
  trunkGirth: number;
  potTier: PotTier;

  commitsLast7d: number;
  commitsLast30d: number;

  season: Season;
  weather: Weather;
  /** Suppresses weather; adds mist and a sleeping spirit. */
  dormant: boolean;
  /** Within 7 days of returning from dormancy. */
  awakening: boolean;
  /** 0 normally, 0.4 in deep winter. */
  bareBranchRatio: number;

  ornaments: OrnamentCounts;
  events: SeasonalEvent[];
  plaques: Plaque[];
  spirit: SpiritTrigger | null;
  visitors: VisitorKind[];

  totals: HistoryTotals;
  streak: HistoryStreak;
  languages: LangShare[];
}
