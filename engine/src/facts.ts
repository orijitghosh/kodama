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
import { MAX_MATURITY } from "./limits.js";
import { selectForm } from "./form.js";
import type { FormFacts } from "./form.js";
import type {
  DerivedSignals,
  DormancySpell,
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
/** Owned by `limits.ts` so form selection can read it without a cycle. */
export { MAX_MATURITY };

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
// Derived signals (PROPOSAL-VARIETALS §2.1)
// ---------------------------------------------------------------------------

/** A language holding at least this share of repo-weighted bytes counts. */
export const LANG_SHARE_FLOOR = 0.15;

/**
 * Silence long enough to leave a permanent mark, as opposed to `DORMANCY_DAYS`,
 * which is the tree merely resting. Twice the rest threshold: the distinction
 * being drawn is "took a season off" versus "was gone".
 */
export const DORMANCY_SPELL_DAYS = 180;

/** The recent window `declineRatio` measures, and the baseline it measures against. */
export const DECLINE_WINDOW_WEEKS = 26;
export const BASELINE_WINDOW_WEEKS = 52;

/**
 * Kept spells. The ladder only ever asks about the most recent one, and
 * TreeFacts is served as JSON by the receipts API, so an account with decades of
 * intermittent activity should not be able to grow that payload without bound.
 */
const MAX_DORMANCY_SPELLS = 4;

export function activeWeeks(history: NormalizedHistory): number {
  return history.weeks.length;
}

/**
 * Coefficient of variation of commits per *active* week - stdev over mean,
 * population stdev, so a single week is 0 rather than undefined.
 *
 * Two properties worth being explicit about, because both matter to how the
 * form ladder may use this number.
 *
 * It is scale-free by construction: someone averaging 4 commits a week and
 * someone averaging 400 get the same score if their shape is the same, which is
 * the point - this asks about rhythm, not volume.
 *
 * It is also blind to gaps, because weeks with no activity are not stored
 * (WeekCell) and "over active weeks" is what §2.1 specifies. So four heavy weeks
 * a year scores as steady as fifty. That is not a bug to fix here by quietly
 * redefining the metric: coverage is a different question and `activeWeeks`
 * answers it, which is why every ladder rung reading cadence pairs the two.
 */
export function cadenceCV(history: NormalizedHistory): number {
  const counts = history.weeks.map((week) => week.c);
  if (counts.length < 2) return 0;

  const mean = counts.reduce((sum, c) => sum + c, 0) / counts.length;
  if (mean === 0) return 0;

  const variance = counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length;
  return Math.sqrt(variance) / mean;
}

/** Busiest week over the mean active week: 1 is flat, higher is spikier. */
export function burstiness(history: NormalizedHistory): number {
  if (history.weeks.length === 0) return 0;

  let max = 0;
  let total = 0;
  for (const week of history.weeks) {
    if (week.c > max) max = week.c;
    total += week.c;
  }

  const mean = total / history.weeks.length;
  if (mean === 0) return 0;
  return max / mean;
}

/**
 * The recent mean against the account's own best sustained year.
 *
 * Below 1 means slowing down; at or above 1 means this is as busy as it has ever
 * been. The comparison is always against the account itself, never against other
 * people, for the same reason `weatherFor` is.
 *
 * Both windows exclude the current, partial ISO week - it is missing days by
 * definition, and letting it into a 26-week mean would tilt the ratio downward
 * every Monday and back up every Sunday, which is exactly the day-to-day
 * instability D-005 forbids.
 *
 * Returns 1 - "no decline" - for an account with nothing to compare, rather than
 * 0. A ghost has not fallen off; it never started, and the ladder must not read a
 * missing baseline as a windswept life.
 */
export function declineRatio(history: NormalizedHistory, date: string): number {
  if (history.weeks.length === 0) return 1;

  const index = weekIndex(history);
  const firstMonday = isoWeekStart(history.weeks[0]!.w);
  const lastCompleteMonday = addDays(isoWeekStart(isoWeekOf(date)), -7);

  // Whole weeks from the first week with activity to the last complete week.
  const span = Math.floor(daysBetween(firstMonday, lastCompleteMonday) / 7) + 1;
  if (span <= 0) return 1;

  // A young account is measured over the window it actually has. Dividing its
  // recent sum by a fixed 26 would count weeks before the account existed as
  // zeros and manufacture a decline out of youth.
  const recentWeeks = Math.min(DECLINE_WINDOW_WEEKS, span);
  const recentMean = sumWeeks(index, date, 1, recentWeeks) / recentWeeks;

  const window = Math.min(BASELINE_WINDOW_WEEKS, span);
  let running = 0;
  let best = 0;
  for (let i = 0; i < span; i += 1) {
    running += index.get(isoWeekOf(addDays(firstMonday, 7 * i))) ?? 0;
    if (i >= window) {
      running -= index.get(isoWeekOf(addDays(firstMonday, 7 * (i - window)))) ?? 0;
    }
    if (i >= window - 1 && running > best) best = running;
  }

  const baselineMean = best / window;
  if (baselineMean === 0) return 1;
  return recentMean / baselineMean;
}

export function langCount15(history: NormalizedHistory): number {
  return history.languages.filter((lang) => lang.share >= LANG_SHARE_FLOOR).length;
}

/**
 * Closed dormancies, oldest first.
 *
 * Silence is measured from the *end* of the last active week to the start of the
 * week activity resumed, so a 26-week absence reports as 182 days and not as the
 * 189 that comparing two Mondays would give. `isAwakening` compares Mondays
 * directly against a 90-day threshold, where a week of slack cannot change the
 * answer; here the threshold is what earns a permanent mark on the trunk, so the
 * arithmetic is worth getting exactly right.
 *
 * An absence still running is deliberately absent: that is `dormant`, and a tree
 * cannot be marked as having survived something it is still inside.
 */
export function dormancyHistory(history: NormalizedHistory): DormancySpell[] {
  const spells: DormancySpell[] = [];

  for (let i = 1; i < history.weeks.length; i += 1) {
    const startedAt = isoWeekStart(history.weeks[i - 1]!.w);
    const endedAt = isoWeekStart(history.weeks[i]!.w);
    const days = daysBetween(startedAt, endedAt) - 7;
    if (days > DORMANCY_SPELL_DAYS) spells.push({ startedAt, endedAt, days });
  }

  return spells.slice(-MAX_DORMANCY_SPELLS);
}

export function derivedSignalsFor(
  history: NormalizedHistory,
  date: string,
): DerivedSignals {
  return {
    activeWeeks: activeWeeks(history),
    cadenceCV: cadenceCV(history),
    burstiness: burstiness(history),
    declineRatio: declineRatio(history, date),
    langCount15: langCount15(history),
    dormancyHistory: dormancyHistory(history),
  };
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

  // Assembled without the form, then asked which form it is. The ladder reads
  // derived signals and the repo mix, so everything it needs is already here by
  // this point - and doing it in one pass keeps `treeFacts` the single place a
  // fact is computed, which is the promise the whole file rests on.
  const base: FormFacts = {
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
    signals: derivedSignalsFor(history, date),
    repoMix: history.repoMix,
  };

  return { ...base, form: selectForm({ facts: base, repoMix: history.repoMix }) };
}
