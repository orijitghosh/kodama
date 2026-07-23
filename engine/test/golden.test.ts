/**
 * Golden renders: six gallery fixtures × two themes, byte-compared.
 *
 * These run on all three operating systems in the determinism matrix, which is
 * what makes them worth more than a snapshot - they assert that a Windows
 * checkout and a Linux CDN region draw the same tree, byte for byte.
 *
 * To update: `pnpm --filter @kodama/engine golden:update`, then read the diff.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "../src/render.js";
import { loadFixture } from "./helpers/fixtures.js";
import { GOLDEN_DIR, GOLDEN_OPTIONS, goldenCases } from "./helpers/golden.js";

const cases = goldenCases();

describe("golden renders", () => {
  it("covers 48 static cases plus 12 animate cases", () => {
    expect(cases).toHaveLength(60);
  });

  for (const { fixture, theme, season, file, date, animate } of cases) {
    const label = animate ? `${season} · animate` : season;
    it(`${fixture} · ${theme} · ${label} matches its golden`, () => {
      const path = join(GOLDEN_DIR, file);
      expect(
        existsSync(path),
        `missing golden ${file} - run \`pnpm --filter @kodama/engine golden:update\``,
      ).toBe(true);

      const actual = render(loadFixture(fixture), date, { ...GOLDEN_OPTIONS, theme, animate });
      // Read as utf8 and compare strings so a stray CRLF from a mis-set
      // core.autocrlf fails loudly here rather than silently passing.
      const expected = readFileSync(path, "utf8");

      expect(actual).toBe(expected);
      expect(actual).not.toContain("\r");
    });
  }
});
