import type { SpeciesName } from "./species.js";

/**
 * The engine's data contract (SPEC-ENGINE §1-2).
 *
 * NormalizedHistory is provider-agnostic on purpose (D-004): nothing here says
 * "GitHub", and nothing says "tree". Biomes map the generic vocabulary -
 * substrate / masses / ornaments / inhabitants - onto their own imagery.
 */

// ---------------------------------------------------------------------------
// NormalizedHistory v2
//
// v1 was frozen when M4 shipped. v2 adds `repoMix` and nothing else: form
// (D-042) needs to know how an account's commits are distributed across repos,
// and no combination of v1 fields can answer that. An engine that reads v2
// refuses a v1 payload outright rather than filling the gap with zeros - a
// guessed repo mix is a false claim about somebody's work, and the cost of the
// alternative is one cold fetch per account, once (SPEC-ENGINE §2).
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

/**
 * The one repository the schema is allowed to name.
 *
 * `repoMix` is deliberately five numbers and not a repo list - a hundred rows
 * per year would not fit the ~2 KB history budget, and the badge has no business
 * carrying an inventory of what someone works on. The exception is the single
 * longest-lived owned repo still receiving commits, because the root-over-rock
 * form *is* that project and its receipt has to say which one (PROPOSAL-VARIETALS
 * §3, rung 6). One row, ~50 bytes, and it is the only repo identity stored.
 */
export interface RepoAnchor {
  /** "owner/name". */
  nameWithOwner: string;
  /** Whole years from the repo's creation to the fetch date. */
  years: number;
  /** Its share of qualifying commits, 0..1. */
  share: number;
}

/**
 * How an account's commits are spread across repositories (v2).
 *
 * Every number here is computed over *qualifying* repos only - see the
 * anti-gaming filter in the service's normalizer. This is the first metric in
 * the project that is cheap to fake, and the filter is the whole defence.
 */
export interface RepoMix {
  /** Herfindahl index over commit shares: 1 = one repo, → 0 = scattered. */
  hhi: number;
  /** Fraction of qualifying commits landing in repos the account owns, 0..1. */
  ownShare: number;
  /** Distinct qualifying repositories. */
  breadth: number;
  /** Distinct owners other than the account itself, among qualifying repos. */
  orgs: number;
  /** Null when nothing qualifies - a ghost, or an account of drive-by commits. */
  anchor: RepoAnchor | null;
}

export interface NormalizedHistory {
  v: 2;
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
  /** New in v2: the repo-mix summary form is chosen from (D-042). */
  repoMix: RepoMix;
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

/**
 * A closed stretch of silence long enough to leave a permanent mark.
 *
 * Dates are ISO week starts, because weekly storage is the finest resolution
 * the schema carries (D-015) - `startedAt` is the Monday of the last active
 * week before the silence, `endedAt` the Monday of the week activity resumed.
 * An absence that is still running is not a spell: that is `dormant`.
 */
export interface DormancySpell {
  startedAt: string;
  endedAt: string;
  /** Whole days between the end of the last active week and the return. */
  days: number;
}

/**
 * Derived cadence signals (PROPOSAL-VARIETALS §2.1).
 *
 * Pure functions of NormalizedHistory plus the render date, costing no schema
 * change and no extra query. They exist to be read by form selection, and they
 * are on TreeFacts rather than local to it so the receipts layer can serve the
 * numbers a silhouette was chosen from.
 */
export interface DerivedSignals {
  /** `weeks.length` - the denominator every anti-gaming rule divides by. */
  activeWeeks: number;
  /** Coefficient of variation of commits per active week. 0 = metronome. */
  cadenceCV: number;
  /** Busiest week over the mean active week. 1 = perfectly flat. */
  burstiness: number;
  /** Recent 26-week mean over the best 52-week mean. < 1 = slowing down. */
  declineRatio: number;
  /** Languages holding at least a 15% share. */
  langCount15: number;
  /** Closed dormancies, oldest first, most recent few only. */
  dormancyHistory: DormancySpell[];
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
  signals: DerivedSignals;
}
