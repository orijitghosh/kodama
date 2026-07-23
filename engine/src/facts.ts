/**
 * TreeFacts - the single source of truth (SPEC-ENGINE §1).
 *
 * Every visual decision downstream reads from this structure; `render` never
 * recomputes a rule for itself. That is also what the receipts layer runs on:
 * the JSON API serves the same values the picture was drawn from.
 *
 * Two constraints on the code below.
 *
 * Resolution: NormalizedHistory v1 stores weekly commit sums, not daily ones,
 * so nothing here may claim daily resolution it does not have. Where a rule
 * wanted "last 7 days" it reads the current ISO week; where it wanted a 30-day
 * mean it uses whole weeks and divides by real day counts. Nothing is
 * interpolated (D-015).
 *
 * Purity: `date` is the only clock.
 */

import {
  addDays,
  daysBetween,
  isoWeekOf,
  isoWeekStart,
  parseDate,
  wholeYearsBetween,
  yearsBetween,
} from "./date.js";
import type {
  FruitFact,
  NormalizedHistory,
  OrnamentCounts,
  Plaque,
  PotTier,
  Season,
  SeasonalEvent,
  SpiritTrigger,
  TreeFacts,
  VisitorKind,
  Weather,
} from "./types.js";

// ---------------------------------------------------------------------------
// Tunables. Every one of these is a product decision, so they live together
// and are named rather than inlined at their use site.
// ---------------------------------------------------------------------------

/**
 * Growth units per maturity level.
 *
 * SPEC-ENGINE §3.2 proposed 40, but measured against the committed fixtures
 * that put every account with more than about eight months of activity at the
 * ceiling: grinder, maintainer, veteran, dormant and whale all landed on level
 * 13, and the ladder between "newcomer" and "decade veteran" went unused. 400
 * spreads the same fixtures across levels 3, 4, 5, 7 and 13 - see the maturity
 * ladder test, which fails if the range ever collapses again (D-016).
 */
export const GU_PER_LEVEL = 400;

export const MIN_MATURITY = 3;
export const MAX_MATURITY = 13;

/** Leaf clusters per pad, from the within-level growth residual. */
export const MIN_PAD_DENSITY = 4;
export const MAX_PAD_DENSITY = 9;

/** Days of silence before the tree rests. */
export const DORMANCY_DAYS = 90;

/** Days after returning from dormancy that the awakening reads. */
export const AWAKENING_DAYS = 7;

/**
 * The awakening window measured from the Monday of the week the tree woke in.
 *
 * The product intent is "seven days of burst shoots", but weekly storage does
 * not record which day of that week the user came back (D-015). Anchoring to
 * the week start and widening by six days spans the intended week wherever in
 * it the return actually fell, rather than cutting the effect short for anyone
 * who returned on a Friday.
 */
const AWAKENING_WINDOW_DAYS = AWAKENING_DAYS + 6;

const ORNAMENT_CAPS = {
  shoots: 6,
  fruit: 10,
  unripeFruit: 4,
  lanterns: 7,
  fireflies: 12,
  blossomClusters: 4,
  fallingPetals: 3,
} as const;

// ---------------------------------------------------------------------------
// Weekly arithmetic
// ---------------------------------------------------------------------------

function weekIndex(history: NormalizedHistory): Map<string, number> {
  const index = new Map<string, number>();
  for (const week of history.weeks) index.set(week.w, week.c);
  return index;
}

/**
 * Sums whole ISO weeks walking backwards from the week containing `date`.
 * `skip` whole weeks are stepped over first, so a caller can ask for "the four
 * weeks before the current, partial one" without the current week's missing
 * days dragging the average down.
 */
function sumWeeks(
  index: Map<string, number>,
  date: string,
  skip: number,
  count: number,
): number {
  const currentMonday = isoWeekStart(isoWeekOf(date));
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const monday = addDays(currentMonday, -7 * (skip + i));
    total += index.get(isoWeekOf(monday)) ?? 0;
  }
  return total;
}

/** Growth units: log2 of each week's commits, so weeks have diminishing returns. */
export function growthUnits(history: NormalizedHistory): number {
  let gu = 0;
  for (const week of history.weeks) gu += Math.log2(1 + week.c);
  return gu;
}

export function maturityFor(gu: number): number {
  return Math.min(MAX_MATURITY, MIN_MATURITY + Math.floor(gu / GU_PER_LEVEL));
}

/**
 * Pad density from the residual growth within the current level.
 *
 * Note this is deliberately not monotone across a level boundary: a level-up
 * grants new pads and resets density to its floor, so a growth spurt reads as
 * fresh sparse pads that then fill in. D-005 guarantees monotonicity of pad and
 * ornament *counts*, not of clusters per pad.
 */
export function padDensityFor(gu: number, maturity: number): number {
  if (maturity >= MAX_MATURITY) return MAX_PAD_DENSITY;
  const residual = (gu % GU_PER_LEVEL) / GU_PER_LEVEL;
  const span = MAX_PAD_DENSITY - MIN_PAD_DENSITY;
  return Math.min(MAX_PAD_DENSITY, MIN_PAD_DENSITY + Math.floor(residual * (span + 1)));
}

/**
 * Trunk girth, from whole years rather than fractional ones.
 *
 * The spec's formula takes `accountYears`, but that value moves every single
 * day, and girth sets the stroke width of every branch - so a continuous age
 * made the entire skeleton drift daily by amounts no eye can see, breaking the
 * day-to-day pixel stability D-005 promises and producing fresh bytes for every
 * date. Quantizing to whole years keeps the structure fixed between birthdays
 * and turns thickening into an earned annual beat, alongside the anniversary
 * spirit (D-018).
 */
export function trunkGirthFor(wholeYears: number): number {
  return Math.min(26, 8 + 2.2 * Math.sqrt(Math.max(0, wholeYears) * 4));
}

export function potTierFor(wholeYears: number): PotTier {
  if (wholeYears >= 10) return "stone";
  if (wholeYears >= 6) return "antique";
  if (wholeYears >= 3) return "glazed";
  if (wholeYears >= 1) return "clay";
  return "plastic";
}

// ---------------------------------------------------------------------------
// Time-derived state (SPEC-ENGINE §3.5)
// ---------------------------------------------------------------------------

export function seasonFor(date: string): Season {
  const { m } = parseDate(date);
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

export function seasonalEventsFor(date: string): SeasonalEvent[] {
  const { m, d } = parseDate(date);
  const events: SeasonalEvent[] = [];
  if (m === 4 && d >= 1 && d <= 7) events.push({ kind: "hanami" });
  if (m === 10 && d >= 15 && d <= 21) events.push({ kind: "harvest" });
  if (m === 12 && d >= 1 && d <= 3) events.push({ kind: "firstSnow" });
  if ((m === 12 && d >= 4) || m === 1 || m === 2) events.push({ kind: "settledSnow" });
  return events;
}

/** Deep winter thins the canopy; every other day of the year is full. */
export function bareBranchRatioFor(events: SeasonalEvent[]): number {
  return events.some((e) => e.kind === "settledSnow") ? 0.4 : 0;
}

/**
 * Momentum against the account's own baseline, never against other people:
 * a casual committer keeping their own pace gets sun.
 */
export function weatherFor(
  index: Map<string, number>,
  date: string,
  accountAgeDays: number,
): Weather {
  // A young account has no baseline worth comparing against, and greeting a
  // newcomer with overcast would be exactly the wrong first impression.
  if (accountAgeDays < 90) return "sun";

  const baselineSum = sumWeeks(index, date, 5, 26);
  // Overcast means "below your own pace". An account with no established pace
  // cannot be below it, so a ghost gets a clear sky rather than a reprimand
  // for never having started.
  if (baselineSum === 0) return "sun";

  const recentDaily = sumWeeks(index, date, 1, 4) / 28;
  const baselineDaily = Math.max(0.2, baselineSum / 182);
  const ratio = recentDaily / baselineDaily;

  if (ratio > 1.25) return "sun";
  if (ratio >= 0.75) return "calm";
  return "overcast";
}

/** Absence is a state, not a punishment: foliage is kept, the tree just rests. */
export function isDormant(history: NormalizedHistory, date: string): boolean {
  if (history.weeks.length === 0) return false;
  return daysBetween(history.streak.lastActiveDate, date) > DORMANCY_DAYS;
}

/**
 * True in the week after a dormant tree wakes. Detected from the shape of the
 * week list plus the exact last-active date - no stored state, as D-002 requires.
 */
export function isAwakening(history: NormalizedHistory, date: string): boolean {
  if (history.weeks.length < 2) return false;

  // Walk back to the start of the current run of activity: the return itself
  // may already span two ISO weeks, so inspecting only the final pair would
  // miss anyone who came back on a Sunday.
  let wokeIndex = -1;
  for (let i = history.weeks.length - 1; i > 0; i -= 1) {
    const gap = daysBetween(
      isoWeekStart(history.weeks[i - 1]!.w),
      isoWeekStart(history.weeks[i]!.w),
    );
    if (gap > DORMANCY_DAYS) {
      wokeIndex = i;
      break;
    }
  }
  if (wokeIndex === -1) return false;

  const since = daysBetween(isoWeekStart(history.weeks[wokeIndex]!.w), date);
  return since >= 0 && since <= AWAKENING_WINDOW_DAYS;
}

// ---------------------------------------------------------------------------
// Ornaments (SPEC-ENGINE §3.4)
// ---------------------------------------------------------------------------

function fruitFor(history: NormalizedHistory, date: string): FruitFact[] {
  const fruit: FruitFact[] = [];
  for (const pr of history.recentPRs) {
    const age = daysBetween(pr.mergedAt, date);
    if (age < 0 || age > 30) continue;
    fruit.push({
      // Green on merge day, fully persimmon after three days.
      ripeness: Math.min(1, Math.max(0, age / 3)),
      bucket: pr.bucket,
      mergedAt: pr.mergedAt,
    });
  }
  return fruit.slice(0, ORNAMENT_CAPS.fruit);
}

/**
 * A break is visible for a week: petals fall, and nothing else changes. The
 * tree is never damaged by absence (PRD, "gentle by design").
 */
function fallingPetalsFor(history: NormalizedHistory, date: string): number {
  const { current, longest, lastActiveDate } = history.streak;
  if (current > 0 || longest < 14) return 0;
  const gap = daysBetween(lastActiveDate, date);
  // Day 1 is simply "hasn't committed yet today"; a break reads from day 2.
  if (gap < 2 || gap > AWAKENING_DAYS + 1) return 0;
  return ORNAMENT_CAPS.fallingPetals;
}

function ornamentsFor(
  history: NormalizedHistory,
  date: string,
  commitsThisWeek: number,
): OrnamentCounts {
  const { totals, streak } = history;

  const blossomClusters =
    streak.current >= 14
      ? Math.min(ORNAMENT_CAPS.blossomClusters, Math.floor(streak.current / 30) + 1)
      : 0;

  return {
    shoots: Math.min(ORNAMENT_CAPS.shoots, Math.ceil(Math.log2(1 + commitsThisWeek))),
    fruit: fruitFor(history, date),
    unripeFruit: Math.min(ORNAMENT_CAPS.unripeFruit, totals.prsOpen),
    lanterns: Math.min(ORNAMENT_CAPS.lanterns, Math.floor(Math.log2(1 + totals.reviews))),
    fireflies: Math.min(
      ORNAMENT_CAPS.fireflies,
      Math.round(3 * Math.log10(1 + totals.starsReceived)),
    ),
    blossomClusters,
    fallingPetals: fallingPetalsFor(history, date),
    soilPetalRing: streak.longest >= 100,
    bird:
      totals.issuesClosed >= 250 ? "nesting" : totals.issuesClosed >= 50 ? "perched" : "none",
    windChime: totals.discussions >= 25,
  };
}

// ---------------------------------------------------------------------------
// Plaques (SPEC-ENGINE §3.7)
// ---------------------------------------------------------------------------

/**
 * The date a cumulative commit threshold was crossed, to week resolution -
 * the finest the schema carries. Returns null when the threshold was never
 * reached.
 */
function commitThresholdDate(history: NormalizedHistory, threshold: number): string | null {
  let running = 0;
  for (const week of history.weeks) {
    running += week.c;
    if (running >= threshold) return isoWeekStart(week.w);
  }
  return null;
}

function plaquesFor(history: NormalizedHistory, wholeYears: number): Plaque[] {
  const plaques: Plaque[] = [];
  const { totals } = history;

  if (totals.commits >= 1000) {
    plaques.push({ kind: "commits1k", earnedAt: commitThresholdDate(history, 1000) });
  }
  if (totals.commits >= 10000) {
    plaques.push({ kind: "commits10k", earnedAt: commitThresholdDate(history, 10000) });
  }
  if (totals.prsMerged >= 100) {
    // v1 keeps only the last ten PRs, so the crossing date is genuinely
    // unknown rather than estimated. The receipts layer says so.
    plaques.push({ kind: "prs100", earnedAt: null });
  }
  if (wholeYears >= 10) {
    const { m, d } = parseDate(history.createdAt);
    const anniversaryYear = parseDate(history.createdAt).y + 10;
    plaques.push({
      kind: "decade",
      earnedAt: `${String(anniversaryYear)}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  return plaques.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Spirit and visitors (SPEC-ENGINE §3.6)
// ---------------------------------------------------------------------------

/**
 * The spirit appears only for triggers the schema can prove (§3.6's binding
 * rule). Anything requiring history the schema discards - "your first merged
 * PR ever", when that PR is older than the last ten - does not ship.
 *
 * Commit milestones are resolved to week granularity, so the window is the ISO
 * week of the crossing rather than a 72-hour clock. Claiming hours from weekly
 * data would be a fabricated precision (D-015).
 */
export function spiritFor(
  history: NormalizedHistory,
  date: string,
  wholeYears: number,
): SpiritTrigger | null {
  const created = parseDate(history.createdAt);
  const target = parseDate(date);

  // An account anniversary, on the day.
  if (wholeYears >= 1 && created.m === target.m && created.d === target.d) {
    return "anniversary";
  }

  // A personal streak record, standing right now.
  if (history.streak.current >= 30 && history.streak.current === history.streak.longest) {
    return "streakRecord";
  }

  const currentWeek = isoWeekOf(date);
  const milestones: Array<[number, SpiritTrigger]> = [
    [10000, "commits10k"],
    [1000, "commits1k"],
    [100, "commits100"],
  ];
  for (const [threshold, trigger] of milestones) {
    if (history.totals.commits < threshold) continue;
    const crossed = commitThresholdDate(history, threshold);
    if (crossed !== null && isoWeekOf(crossed) === currentWeek) return trigger;
  }

  return null;
}

export function visitorsFor(
  history: NormalizedHistory,
  date: string,
  wholeYears: number,
): VisitorKind[] {
  const visitors: VisitorKind[] = [];
  const stars = history.totals.starsReceived;

  if (stars >= 1000) visitors.push("fox");
  if (stars >= 5000) visitors.push("koi");

  if (wholeYears >= 10) {
    // The crane visits during the anniversary week each year.
    const created = parseDate(history.createdAt);
    const target = parseDate(date);
    const anniversary = `${String(target.y)}-${String(created.m).padStart(2, "0")}-${String(
      Math.min(created.d, 28),
    ).padStart(2, "0")}`;
    const offset = daysBetween(anniversary, date);
    if (offset >= 0 && offset < 7) visitors.push("crane");
  }

  return visitors;
}

// ---------------------------------------------------------------------------
// The computer itself
// ---------------------------------------------------------------------------

export function treeFacts(history: NormalizedHistory, date: string): TreeFacts {
  // Validating the date here rather than trusting the caller keeps a malformed
  // query param from reaching the geometry as a NaN.
  parseDate(date);

  const index = weekIndex(history);
  const accountYears = Math.max(0, yearsBetween(history.createdAt, date));
  const wholeYears = Math.max(0, wholeYearsBetween(history.createdAt, date));
  const accountAgeDays = Math.max(0, daysBetween(history.createdAt, date));

  const gu = growthUnits(history);
  const maturity = maturityFor(gu);

  const commitsThisWeek = index.get(isoWeekOf(date)) ?? 0;
  // Four whole weeks: the closest honest reading of "last 30 days" that weekly
  // storage supports.
  const commitsLast30d = sumWeeks(index, date, 0, 5);

  const dormant = isDormant(history, date);
  const events = seasonalEventsFor(date);

  return {
    login: history.login,
    date,

    accountYears,
    growthUnits: gu,
    maturity,
    padDensity: padDensityFor(gu, maturity),
    trunkGirth: trunkGirthFor(wholeYears),
    potTier: potTierFor(wholeYears),

    commitsLast7d: commitsThisWeek,
    commitsLast30d,

    season: seasonFor(date),
    // A resting tree has no weather; mist replaces it.
    weather: dormant ? "calm" : weatherFor(index, date, accountAgeDays),
    dormant,
    awakening: isAwakening(history, date),
    bareBranchRatio: bareBranchRatioFor(events),

    ornaments: ornamentsFor(history, date, commitsThisWeek),
    events,
    plaques: plaquesFor(history, wholeYears),
    spirit: spiritFor(history, date, wholeYears),
    visitors: visitorsFor(history, date, wholeYears),

    totals: history.totals,
    streak: history.streak,
    languages: history.languages,
  };
}
