import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  addDays,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  formatDate,
  fromDayNumber,
  isLeapYear,
  isoDayOfWeek,
  isoWeekOf,
  isoWeekStart,
  isoWeeksInYear,
  isValidDate,
  KodamaDateError,
  parseDate,
  toDayNumber,
  wholeYearsBetween,
  yearsBetween,
} from "../src/date.js";

describe("civil date conversion", () => {
  it.each([
    ["1970-01-01", 0],
    ["1970-01-02", 1],
    ["1969-12-31", -1],
    ["2000-03-01", 11017],
    ["2026-07-15", 20649],
  ])("maps %s to day %i", (date, day) => {
    expect(toDayNumber(date)).toBe(day);
    expect(fromDayNumber(day)).toBe(date);
  });

  it("round-trips every day across four centuries", () => {
    fc.assert(
      fc.property(fc.integer({ min: -25567, max: 47482 }), (day) => {
        expect(toDayNumber(fromDayNumber(day))).toBe(day);
      }),
      { numRuns: 2000 },
    );
  });

  it("agrees with the platform Date on a wide random sample", () => {
    // The engine may not use Date, but the test may - and cross-checking
    // against an independent implementation is exactly what makes the
    // hand-rolled arithmetic trustworthy.
    fc.assert(
      fc.property(fc.integer({ min: -25567, max: 47482 }), (day) => {
        const expected = new Date(day * 86400000).toISOString().slice(0, 10);
        expect(fromDayNumber(day)).toBe(expected);
      }),
      { numRuns: 2000 },
    );
  });
});

describe("leap years and month lengths", () => {
  it.each([
    [2000, true],
    [1900, false],
    [2024, true],
    [2025, false],
    [2100, false],
    [2400, true],
  ])("classifies %i correctly", (year, leap) => {
    expect(isLeapYear(year)).toBe(leap);
  });

  it("gives February 29 days only in leap years", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
  });

  it("accepts a real leap day and rejects a fake one", () => {
    expect(isValidDate("2024-02-29")).toBe(true);
    expect(isValidDate("2025-02-29")).toBe(false);
  });
});

describe("date parsing rejects nonsense", () => {
  it.each([
    "2026-7-15",
    "26-07-15",
    "2026-00-10",
    "2026-13-10",
    "2026-07-00",
    "2026-07-32",
    "2026-06-31",
    "",
    "not-a-date",
    "2026-07-15T00:00:00Z",
  ])("rejects %s", (value) => {
    expect(() => parseDate(value)).toThrow(KodamaDateError);
    expect(isValidDate(value)).toBe(false);
  });

  it("formats back to what it parsed", () => {
    expect(formatDate(parseDate("2024-02-29"))).toBe("2024-02-29");
  });
});

describe("day arithmetic", () => {
  it("adds across a month boundary", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("adds across a leap day", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
  });

  it("adds across a year boundary in both directions", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("is its own inverse", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 40000 }),
        fc.integer({ min: -5000, max: 5000 }),
        (day, delta) => {
          const date = fromDayNumber(day);
          expect(addDays(addDays(date, delta), -delta)).toBe(date);
        },
      ),
    );
  });

  it("measures signed spans", () => {
    expect(daysBetween("2026-07-01", "2026-07-15")).toBe(14);
    expect(daysBetween("2026-07-15", "2026-07-01")).toBe(-14);
    expect(daysBetween("2026-07-15", "2026-07-15")).toBe(0);
  });
});

describe("weekdays", () => {
  it.each([
    ["2026-07-15", 3, 3], // a Wednesday
    ["2026-07-19", 0, 7], // a Sunday
    ["2026-07-13", 1, 1], // a Monday
  ])("places %s", (date, dow, iso) => {
    expect(dayOfWeek(date)).toBe(dow);
    expect(isoDayOfWeek(date)).toBe(iso);
  });

  it("matches the platform on a random sample", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40000 }), (day) => {
        expect(dayOfWeek(fromDayNumber(day))).toBe(new Date(day * 86400000).getUTCDay());
      }),
      { numRuns: 1000 },
    );
  });
});

describe("ISO weeks", () => {
  it.each([
    // The classic edge cases: the ISO year is not the calendar year.
    ["2021-01-01", "2020-W53"],
    ["2019-12-30", "2020-W01"],
    ["2026-01-01", "2026-W01"],
    ["2026-07-15", "2026-W29"],
    ["2024-12-31", "2025-W01"],
  ])("labels %s as %s", (date, label) => {
    expect(isoWeekOf(date)).toBe(label);
  });

  it("starts every week on a Monday", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40000 }), (day) => {
        const start = isoWeekStart(isoWeekOf(fromDayNumber(day)));
        expect(isoDayOfWeek(start)).toBe(1);
      }),
      { numRuns: 1000 },
    );
  });

  it("round-trips a date's week label through its Monday", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40000 }), (day) => {
        const label = isoWeekOf(fromDayNumber(day));
        expect(isoWeekOf(isoWeekStart(label))).toBe(label);
      }),
      { numRuns: 1000 },
    );
  });

  it("places each date within six days of its week start", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40000 }), (day) => {
        const date = fromDayNumber(day);
        const offset = daysBetween(isoWeekStart(isoWeekOf(date)), date);
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThanOrEqual(6);
      }),
      { numRuns: 1000 },
    );
  });

  it.each([
    [2020, 53],
    [2021, 52],
    [2026, 53],
    [2025, 52],
  ])("counts the weeks in %i", (year, weeks) => {
    expect(isoWeeksInYear(year)).toBe(weeks);
  });

  it("sorts week labels in chronological order as plain strings", () => {
    // The schema and the fixture generator both rely on lexical sorting of
    // week labels being chronological; that only holds with zero padding.
    const labels = [0, 40, 120, 400, 900].map((d) => isoWeekOf(addDays("2024-01-08", d)));
    expect([...labels].sort()).toEqual(labels);
  });
});

describe("year spans", () => {
  it("lands exactly on an anniversary", () => {
    expect(yearsBetween("2020-06-01", "2023-06-01")).toBe(3);
    expect(wholeYearsBetween("2020-06-01", "2023-06-01")).toBe(3);
  });

  it("does not round up the day before an anniversary", () => {
    expect(wholeYearsBetween("2020-06-01", "2023-05-31")).toBe(2);
  });

  it("handles a leap-day birthday in a common year", () => {
    // Feb 29 accounts turn a year older on Feb 28 when February is short.
    expect(wholeYearsBetween("2024-02-29", "2025-02-28")).toBe(1);
    expect(wholeYearsBetween("2024-02-29", "2025-02-27")).toBe(0);
  });

  it("increases monotonically with the end date", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20000 }),
        fc.integer({ min: 0, max: 8000 }),
        fc.integer({ min: 1, max: 500 }),
        (start, span, extra) => {
          const from = fromDayNumber(start);
          const a = yearsBetween(from, fromDayNumber(start + span));
          const b = yearsBetween(from, fromDayNumber(start + span + extra));
          expect(b).toBeGreaterThanOrEqual(a);
        },
      ),
    );
  });

  it("agrees with the pot-tier boundaries the grammar cares about", () => {
    const created = "2016-03-10";
    expect(wholeYearsBetween(created, "2017-03-09")).toBe(0);
    expect(wholeYearsBetween(created, "2017-03-10")).toBe(1);
    expect(wholeYearsBetween(created, "2019-03-10")).toBe(3);
    expect(wholeYearsBetween(created, "2022-03-10")).toBe(6);
    expect(wholeYearsBetween(created, "2026-03-10")).toBe(10);
  });
});
