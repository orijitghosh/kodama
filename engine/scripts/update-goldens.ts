/**
 * Rewrites the committed golden SVGs.
 *
 * Deliberately a separate script rather than an env-var mode on the test: a
 * test run must never be able to bless its own regression. Updating goldens is
 * an act with a diff to review, and the diff is the point.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "../src/render.js";
import { loadFixture } from "../test/helpers/fixtures.js";
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

for (const { fixture, theme, file, date, animate } of goldenCases()) {
  const svg = render(loadFixture(fixture), date, { ...GOLDEN_OPTIONS, theme, animate });
  // LF explicitly: .gitattributes normalizes on commit, but the bytes compared
  // by the test are the bytes on disk, and Windows checkouts must match Linux.
  writeFileSync(join(GOLDEN_DIR, file), svg, { encoding: "utf8" });
  console.log(`${file}  ${String(Buffer.byteLength(svg, "utf8"))} B`);
}

console.log(`\nwrote ${String(goldenCases().length)} goldens to engine/test/golden/`);
