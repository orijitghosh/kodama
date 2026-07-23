/**
 * Civil date arithmetic over "YYYY-MM-DD" strings (D-014).
 *
 * The engine never constructs a `Date`: that object carries a host timezone,
 * and one local-time conversion would break byte-identity between two machines
 * rendering the same user on the same day. Everything here is integer
 * arithmetic on the proleptic Gregorian calendar.
 *
 * The day-number conversions are Howard Hinnant's `days_from_civil` /
 * `civil_from_days`, valid for years well beyond any plausible account age.
 */

export type CivilDate = string; // "YYYY-MM-DD"

export interface Civil {
  y: number;
  m: number; // 1..12
  d: number; // 1..31
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export class KodamaDateError extends Error {
  override readonly name = "KodamaDateError";
  constructor(value: string) {
    super(`invalid civil date: ${JSON.stringify(value)} (expected YYYY-MM-DD)`);
  }
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

export function parseDate(value: string): Civil {
  const match = DATE_PATTERN.exec(value);
  if (match === null) throw new KodamaDateError(value);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12) throw new KodamaDateError(value);
  if (d < 1 || d > daysInMonth(y, m)) throw new KodamaDateError(value);
  return { y, m, d };
}

export function isValidDate(value: string): boolean {
  try {
    parseDate(value);
    return true;
  } catch {
    return false;
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

export function formatDate(c: Civil): CivilDate {
  const year = c.y < 0 ? `-${String(-c.y).padStart(4, "0")}` : String(c.y).padStart(4, "0");
  return `${year}-${pad2(c.m)}-${pad2(c.d)}`;
}

/** Days since 1970-01-01. Negative before the epoch. */
export function toDayNumber(value: string): number {
  const { y, m, d } = parseDate(value);
  return civilToDays(y, m, d);
}

function civilToDays(y0: number, m: number, d: number): number {
  const y = y0 - (m <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400; // 0..399
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1; // 0..365
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // 0..146096
  return era * 146097 + doe - 719468;
}

/** Inverse of {@link toDayNumber}. */
export function fromDayNumber(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097; // 0..146096
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  ); // 0..399
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); // 0..365
  const mp = Math.floor((5 * doy + 2) / 153); // 0..11
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1; // 1..31
  const m = mp + (mp < 10 ? 3 : -9); // 1..12
  return formatDate({ y: y + (m <= 2 ? 1 : 0), m, d });
}

/** Signed day count from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function addDays(value: string, delta: number): CivilDate {
  return fromDayNumber(toDayNumber(value) + delta);
}

/** 0 = Sunday .. 6 = Saturday. */
export function dayOfWeek(value: string): number {
  const days = toDayNumber(value);
  return ((days % 7) + 11) % 7;
}

/** 1 = Monday .. 7 = Sunday, as ISO-8601 counts. */
export function isoDayOfWeek(value: string): number {
  const dow = dayOfWeek(value);
  return dow === 0 ? 7 : dow;
}

/**
 * ISO-8601 week label, e.g. "2026-W29". The ISO year is not always the
 * calendar year: Jan 1 can belong to the last week of the prior year, and late
 * December can belong to week 1 of the next.
 */
export function isoWeekOf(value: string): string {
  const day = toDayNumber(value);
  // The Thursday of this week determines the ISO year.
  const thursday = day + (4 - isoDayOfWeek(value));
  const { y } = parseDate(fromDayNumber(thursday));
  const jan4 = civilToDays(y, 1, 4);
  const jan4Iso = isoDayOfWeek(fromDayNumber(jan4));
  const week1Monday = jan4 - (jan4Iso - 1);
  const week = Math.floor((thursday - week1Monday) / 7) + 1;
  return `${String(y)}-W${pad2(week)}`;
}

/** The Monday that starts the given ISO week label. */
export function isoWeekStart(label: string): CivilDate {
  const match = /^(\d{4})-W(\d{2})$/.exec(label);
  if (match === null) throw new KodamaDateError(label);
  const y = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = civilToDays(y, 1, 4);
  const week1Monday = jan4 - (isoDayOfWeek(fromDayNumber(jan4)) - 1);
  return fromDayNumber(week1Monday + (week - 1) * 7);
}

/** Number of ISO weeks (52 or 53) in an ISO year. */
export function isoWeeksInYear(y: number): number {
  const dec28 = fromDayNumber(civilToDays(y, 12, 28));
  return Number(isoWeekOf(dec28).slice(-2));
}

/**
 * Fractional years between two dates, using each year's real length so that
 * "3.0 years" lands exactly on the anniversary regardless of leap days.
 */
export function yearsBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  let years = b.y - a.y;
  const anniversaryThisYear = anniversaryIn(a, b.y);
  if (toDayNumber(formatDate(b)) < toDayNumber(anniversaryThisYear)) years -= 1;
  const last = anniversaryIn(a, a.y + years);
  const next = anniversaryIn(a, a.y + years + 1);
  const span = daysBetween(last, next);
  const elapsed = daysBetween(last, formatDate(b));
  return years + elapsed / span;
}

/**
 * The anniversary of a date within a target year. Feb 29 anniversaries fall
 * back to Feb 28 in common years - the alternative (Mar 1) would drift the
 * account-age boundary past the month edge.
 */
function anniversaryIn(origin: Civil, year: number): CivilDate {
  const day = Math.min(origin.d, daysInMonth(year, origin.m));
  return formatDate({ y: year, m: origin.m, d: day });
}

/** Whole years elapsed - the form the pot-tier and plaque rules want. */
export function wholeYearsBetween(from: string, to: string): number {
  return Math.floor(yearsBetween(from, to));
}
