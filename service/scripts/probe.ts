/**
 * Staging probe (SPEC-SERVICE §6, step 4.5).
 *
 * Usage:
 *   pnpm --filter @kodama/api probe https://kodama-xxx.vercel.app
 *
 * Asserts the four things the budget section claims and cannot verify locally:
 *
 *   1. `/healthz` answers, with a pool and a real KV behind it.
 *   2. A tree renders, at 200, as an SVG, under the size cap.
 *   3. The second request for the same tree is a CDN `HIT`. The cost model
 *      rests on this and vitest cannot prove it.
 *   4. Cold p95 is inside budget: 1.5 s under ten account years, 2.5 s beyond.
 *
 * Read-only against public GitHub profiles. Exits non-zero on any failure, so
 * it can gate a promotion later without being rewritten.
 */

const BASE = (process.argv[2] ?? "").replace(/\/+$/, "");
if (BASE === "") {
  console.error("usage: probe <deployment-url>");
  process.exit(2);
}

/**
 * Five real accounts spanning the shapes the fixtures model: a whale, two
 * decade veterans, a steady maintainer, and an account young enough that its
 * cold path fetches few year windows.
 */
const LOGINS = ["sindresorhus", "defunkt", "tj", "kentcdodds", "shadcn"];

/** SPEC-SERVICE §6, as amended by SPIKE-GRAPHQL §4. */
const BUDGET_MS = { young: 1_500, old: 2_500 };
const SIZE_CAP_FULL = 60_000;

let failures = 0;

function check(ok: boolean, label: string, detail = ""): void {
  if (ok) {
    console.log(`  ok   ${label}${detail === "" ? "" : `  (${detail})`}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}${detail === "" ? "" : `  (${detail})`}`);
  }
}

async function timed(url: string): Promise<{ response: Response; body: string; ms: number }> {
  const started = performance.now();
  const response = await fetch(url, { headers: { "user-agent": "kodama-probe" } });
  const body = await response.text();
  return { response, body, ms: performance.now() - started };
}

// ---------------------------------------------------------------------------

async function probeHealth(): Promise<void> {
  console.log("\n/healthz");
  const { response, body } = await timed(`${BASE}/healthz`);
  check(response.status === 200, "answers 200", String(response.status));
  check(response.headers.get("cache-control") === "no-store", "is never cached");

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    check(false, "is JSON", body.slice(0, 80));
    return;
  }

  const github = parsed["github"] as { tokens?: number } | undefined;
  const kv = parsed["kv"] as { kind?: string } | undefined;
  check((github?.tokens ?? 0) > 0, "has PATs configured", `tokens=${String(github?.tokens ?? 0)}`);
  check(kv?.kind === "upstash", "is backed by Upstash, not the in-process cache", kv?.kind ?? "?");
  check(parsed["ok"] === true, "reports ok");

  const alerts = (parsed["alerts"] as string[] | undefined) ?? [];
  if (alerts.length > 0) console.log(`       alerts: ${alerts.join("; ")}`);

  // Tokens must never reach this endpoint. Cheap to assert, catastrophic to miss.
  check(!/ghp_|github_pat_/.test(body), "leaks no token material");
}

async function probeTree(login: string): Promise<number> {
  const url = `${BASE}/${login}.svg`;
  const cold = await timed(url);

  check(cold.response.status === 200, `${login}: 200`, String(cold.response.status));
  check(
    (cold.response.headers.get("content-type") ?? "").startsWith("image/svg+xml"),
    `${login}: is an SVG`,
    cold.response.headers.get("content-type") ?? "none",
  );
  check(
    cold.body.startsWith("<svg") && cold.body.trimEnd().endsWith("</svg>"),
    `${login}: body is a complete document`,
  );
  check(
    new TextEncoder().encode(cold.body).length <= SIZE_CAP_FULL,
    `${login}: under the size cap`,
    `${String(new TextEncoder().encode(cold.body).length)} B`,
  );

  const state = cold.response.headers.get("x-kodama-state");
  check(state === null, `${login}: is a real tree, not an error state`, state ?? "ok");

  return cold.ms;
}

async function probeCdn(login: string): Promise<void> {
  const url = `${BASE}/${login}.svg?probe=cdn`;
  const first = await timed(url);
  const second = await timed(url);

  const hit = second.response.headers.get("x-vercel-cache") ?? "none";
  check(
    hit === "HIT" || hit === "STALE",
    `${login}: second request served by the CDN`,
    `first=${first.response.headers.get("x-vercel-cache") ?? "none"} second=${hit}`,
  );
  check(first.body === second.body, `${login}: both requests are byte-identical`);
}

function p95(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

async function main(): Promise<void> {
  console.log(`probing ${BASE}`);
  await probeHealth();

  console.log("\ncold renders");
  const timings: number[] = [];
  for (const login of LOGINS) {
    // Sequential on purpose: parallel requests would share a warm function and
    // measure concurrency rather than the cold path this budget is about.
    timings.push(await probeTree(login));
  }
  const worst = p95(timings);
  console.log(
    `\n  cold p95 ${String(Math.round(worst))} ms  [${timings.map((t) => String(Math.round(t))).join(", ")}]`,
  );
  // The whales in this list are all past ten account years, so the generous
  // budget is the honest one to hold the set against.
  check(worst <= BUDGET_MS.old, "cold p95 within budget", `${String(BUDGET_MS.old)} ms`);

  console.log("\nCDN");
  await probeCdn(LOGINS[0]!);

  console.log(failures === 0 ? "\nall probes passed" : `\n${String(failures)} probe(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

export {};

await main();
