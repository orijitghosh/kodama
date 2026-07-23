/**
 * The Lighthouse budget for IMPLEMENTATION 5.3: ≥ 95 performance and
 * accessibility on the landing page, the grammar page and the gallery.
 *
 * Not part of `pnpm test:e2e`: Lighthouse drives a real Chrome through a
 * throttled network simulation and takes tens of seconds per page, too slow for
 * the normal test loop. Run it against a preview of the built site and record
 * the numbers.
 *
 *   pnpm --filter @kodama/site build          # the preview serves dist/
 *   pnpm --filter @kodama/site preview        # in one terminal, leave running
 *   pnpm --filter @kodama/site lighthouse     # in another
 *
 * The preview server has to be up first, and the script checks. Without it
 * every page fails to load, Lighthouse reports null scores, `pct` turns those
 * into zeros, and the run ends with "below the 95 floor: landing performance 0"
 * - a connection failure that reads like a quality failure. A missing server is
 * reported as an operator error, and a runtime error inside Lighthouse aborts
 * rather than scoring 0.
 *
 * The receipts page is left out: it is a static shell whose content arrives
 * from two live API calls, so its score would mostly measure GitHub's response
 * time.
 */

import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

const BASE = process.argv[2] ?? "http://localhost:4321";

const PAGES = [
  { path: "/", name: "landing" },
  { path: "/grammar", name: "grammar" },
  { path: "/gallery", name: "gallery" },
];

const FLOOR = 95;

interface Row {
  name: string;
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

function pct(value: number | null | undefined): number {
  return Math.round((value ?? 0) * 100);
}

/**
 * Fails fast when nothing is serving `BASE`, before Chrome is launched and three
 * throttled runs are spent producing zeros.
 */
async function assertServerUp(): Promise<void> {
  try {
    const response = await fetch(BASE, { method: "GET" });
    if (!response.ok) {
      throw new Error(`${BASE} answered ${String(response.status)}`);
    }
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error(
      `no site at ${BASE} - ${reason}\n` +
        "start it first, in another terminal:\n" +
        "  pnpm --filter @kodama/site build\n" +
        "  pnpm --filter @kodama/site preview\n" +
        "or pass a deployed origin: pnpm --filter @kodama/site lighthouse https://example.com",
    );
    // Exit rather than throw: a missing server is an operator error, and a stack
    // trace under that message just makes it look like the script crashed.
    process.exit(2);
  }
}

async function main(): Promise<void> {
  await assertServerUp();

  const chrome = await launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
  const rows: Row[] = [];

  try {
    for (const page of PAGES) {
      const result = await lighthouse(
        `${BASE}${page.path}`,
        { port: chrome.port, output: "json", logLevel: "error" },
        undefined,
      );
      if (result === undefined) throw new Error(`lighthouse returned nothing for ${page.path}`);

      // A page Lighthouse could not load scores null in every category, and
      // `pct` would render that as a flawless zero. Refuse to report it.
      const runtimeError = result.lhr.runtimeError;
      if (runtimeError !== undefined && runtimeError.code !== "NO_ERROR") {
        throw new Error(
          `lighthouse could not audit ${BASE}${page.path}: ` +
            `${runtimeError.code} - ${runtimeError.message}`,
        );
      }

      const categories = result.lhr.categories;
      rows.push({
        name: page.name,
        performance: pct(categories.performance?.score),
        accessibility: pct(categories.accessibility?.score),
        bestPractices: pct(categories["best-practices"]?.score),
        seo: pct(categories.seo?.score),
      });
    }
  } finally {
    await chrome.kill();
  }

  console.log("");
  console.log("| Page | Perf | A11y | Best practices | SEO |");
  console.log("|---|---|---|---|---|");
  for (const row of rows) {
    console.log(
      `| ${row.name} | ${String(row.performance)} | ${String(row.accessibility)} | ` +
        `${String(row.bestPractices)} | ${String(row.seo)} |`,
    );
  }
  console.log("");

  // Only the two the milestone is accepted on fail the run; the other two are
  // reported because they are free information, not because they are promised.
  const failures = rows.flatMap((row) => {
    const bad: string[] = [];
    if (row.performance < FLOOR) bad.push(`${row.name} performance ${String(row.performance)}`);
    if (row.accessibility < FLOOR) bad.push(`${row.name} accessibility ${String(row.accessibility)}`);
    return bad;
  });

  if (failures.length > 0) {
    console.error(`below the ${String(FLOOR)} floor: ${failures.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`all pages at or above ${String(FLOOR)} for performance and accessibility`);
}

export {};

await main();
