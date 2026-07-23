import { describe, expect, it } from "vitest";

import { isValidLogin, LOGIN_PATTERN, OPTION_DEFAULTS, parseOptions } from "../src/params.js";

describe("LOGIN_PATTERN", () => {
  it("accepts the logins GitHub accepts", () => {
    for (const login of ["a", "octocat", "sindresorhus", "kent-c-dodds", "a1-b2", "9lives"]) {
      expect(isValidLogin(login)).toBe(true);
    }
  });

  it("refuses what GitHub refuses", () => {
    for (const login of ["", "-nope", "has space", "has/slash", "under_score", "a".repeat(40)]) {
      expect(isValidLogin(login)).toBe(false);
    }
  });

  /**
   * The site renders `LOGIN_PATTERN.source` into an HTML `pattern` attribute so
   * the browser refuses exactly what the route refuses. Browsers compile that
   * attribute with the `v` flag, and a pattern that fails to compile is dropped
   * silently - no console error, no validation, every input accepted.
   *
   * This is the guard for that: the source has to be legal under `v`, or the
   * client-side half of the check disappears without anything going red.
   */
  it("compiles under the `v` flag, which is how a browser reads it", () => {
    expect(() => new RegExp(LOGIN_PATTERN.source, "v")).not.toThrow();
  });

  it("means the same thing under `v` as it does here", () => {
    const asBrowser = new RegExp(LOGIN_PATTERN.source, "v");
    for (const login of ["octocat", "kent-c-dodds", "-nope", "under_score"]) {
      expect(asBrowser.test(login)).toBe(isValidLogin(login));
    }
  });
});

describe("OPTION_DEFAULTS", () => {
  it("is what an empty query string parses to", () => {
    // The site strips any option equal to a default out of the snippet, so a
    // default that is not actually the parser's default would silently change
    // every badge it writes.
    expect(parseOptions(new URLSearchParams()).options).toEqual(OPTION_DEFAULTS);
  });
});

describe("date=", () => {
  const parse = (query: string) => parseOptions(new URLSearchParams(query));

  it("is null when absent, which the route reads as today", () => {
    expect(parse("").date).toBeNull();
  });

  it("takes a calendar date", () => {
    expect(parse("date=2026-03-14").date).toBe("2026-03-14");
  });

  it("refuses a day the calendar does not have", () => {
    // 2026 is not a leap year, and a month has no 31st unless it has one:
    // both are the engine's own rule (date.ts), not a second one here.
    for (const bad of ["2026-02-29", "2026-04-31", "2026-13-01"]) {
      const parsed = parse(`date=${bad}`);
      expect(parsed.date).toBeNull();
      expect(parsed.warnings.join(" ")).toContain(bad);
    }
  });

  it("refuses anything that is not a bare YYYY-MM-DD", () => {
    for (const bad of ["2026-7-4", "07/04/2026", "2026-07-04T12:00:00Z", "yesterday", ""]) {
      expect(parse(`date=${encodeURIComponent(bad)}`).date).toBeNull();
    }
  });

  it("leaves the render options alone", () => {
    expect(parse("date=2026-03-14").options).toEqual(OPTION_DEFAULTS);
  });
});
