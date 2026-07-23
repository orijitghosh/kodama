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
