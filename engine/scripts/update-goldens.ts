/**
 * Rewrites the committed golden SVGs.
 *
 * Deliberately a separate script rather than an env-var mode on the test: a
 * test run must never be able to bless its own regression. Updating goldens is
 * an act with a diff to review, and the diff is the point.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { treeFacts } from "../src/facts.js";
import { render } from "../src/render.js";
import { GOLDEN_DIR, GOLDEN_OPTIONS, goldenCases } from "../test/helpers/golden.js";

mkdirSync(GOLDEN_DIR, { recursive: true });

// Prune first. A renamed case would otherwise leave its old file behind, and an
// orphaned golden is worse than no golden: it looks like coverage and asserts
// nothing.
const wanted = new Set(goldenCases().map((c) => c.file));
for (const existing of readdirSync(GOLDEN_DIR)) {
  if (!wanted.has(existing)) {
    rmSync(join(GOLDEN_DIR, existing));
    console.log(`pruned ${existing}`);
  }
}

for (const { form, theme, file, date, animate, history } of goldenCases()) {
  const source = history();

  // A `form-bunjin` golden that draws a moyogi would be worse than no golden:
  // it looks like coverage of a style and pins a different one. `form.test.ts`
  // asserts the same thing, but this script does not run tests, and blessing a
  // drifted case is exactly the act that must not be silent (gate-4.ts refuses
  // to write a sheet for the same reason).
  if (form !== undefined) {
    const chosen = treeFacts(source, date).form;
    if (chosen !== form) {
      throw new Error(
        `${file}: this case now selects ${chosen}, not ${form} - the rung moved ` +
          `out from under its example. Fix the case in form-cases.ts, do not bless this.`,
      );
    }
  }

  const svg = render(source, date, { ...GOLDEN_OPTIONS, theme, animate });
  // LF explicitly: .gitattributes normalizes on commit, but the bytes compared
  // by the test are the bytes on disk, and Windows checkouts must match Linux.
  writeFileSync(join(GOLDEN_DIR, file), svg, { encoding: "utf8" });
  console.log(`${file}  ${String(Buffer.byteLength(svg, "utf8"))} B`);
}

console.log(`\nwrote ${String(goldenCases().length)} goldens to engine/test/golden/`);
