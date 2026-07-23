/**
 * SPIKE-GRAPHQL (step 4.2) - run the real documents against the live API.
 *
 *   pnpm --filter @kodama/api spike:graphql
 *
 * Answers four questions the spec currently guesses at:
 *
 *   1. Do the documents in `src/github/query.ts` resolve at all? Field names,
 *      the four aliases, and the `languages` connection are unverified.
 *   2. What does each query shape cost against the 5 000-points/hour budget,
 *      and what does a decade account's per-year fan-out add up to?
 *   3. Do two PATs on one account share one rate-limit budget? If they do, the
 *      PAT pool in SPEC-SERVICE §3 buys nothing and 4.3 needs a rethink.
 *   4. How big is a real response, and does it normalize?
 *
 * Reads `KODAMA_PATS` from `service/.env.local`. Tokens are never printed,
 * never written to the recorded responses, and never leave this process; the
 * output only says which index was used.
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { addDays } from "@kodama/engine";

import { PROFILE_QUERY, YEAR_QUERY } from "../src/github/query.js";
import { profileResponseSchema, yearResponseSchema } from "../src/github/shape.js";
import { normalize } from "../src/normalize.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(HERE, "..");
const OUT_DIR = join(PKG_DIR, "..", "dev", "spikes", "graphql");

/**
 * The three account shapes the step asks for. Public profiles, read-only:
 * the whale and the veteran are stand-ins for account shapes the fixtures
 * claim to model, and the run touches nothing but their public contribution
 * data.
 */
const TARGETS =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ["orijitghosh", "sindresorhus", "defunkt"];

// ---------------------------------------------------------------------------

function loadTokens(): string[] {
  const raw = readFileSync(join(PKG_DIR, ".env.local"), "utf8");
  const line = /^KODAMA_PATS=(.*)$/m.exec(raw);
  if (line === null) throw new Error("service/.env.local has no KODAMA_PATS line");
  const tokens = line[1]!
    .trim()
    .replace(/^["']|["']$/g, "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) throw new Error("KODAMA_PATS is empty");
  return tokens;
}

interface RateLimit {
  cost: number;
  limit: number;
  remaining: number;
  resetAt: string;
}

interface GqlResult {
  data: Record<string, unknown> | null;
  errors: { message: string; type?: string; path?: unknown[] }[] | undefined;
  rateLimit: RateLimit | undefined;
  bytes: number;
  ms: number;
  status: number;
}

async function gql(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<GqlResult> {
  const started = Date.now();
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "kodama-spike-graphql",
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await response.text();
  const ms = Date.now() - started;

  let body: { data?: Record<string, unknown>; errors?: GqlResult["errors"] } = {};
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    throw new Error(`non-JSON response (${String(response.status)}): ${text.slice(0, 200)}`);
  }

  return {
    data: body.data ?? null,
    errors: body.errors,
    rateLimit: (body.data?.["rateLimit"] as RateLimit | undefined) ?? undefined,
    bytes: Buffer.byteLength(text, "utf8"),
    ms,
    status: response.status,
  };
}

/** Response bodies minus the meta we do not want in a committed fixture. */
function recordable(data: Record<string, unknown>): Record<string, unknown> {
  const { rateLimit: _rateLimit, ...rest } = data;
  return rest;
}

function write(name: string, value: unknown): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Account-year windows from createdAt to today, as the fetcher will slice them. */
function yearWindows(createdAt: string, today: string): { from: string; to: string }[] {
  const windows: { from: string; to: string }[] = [];
  let from = createdAt;
  while (from < today) {
    const nextYear = `${String(Number(from.slice(0, 4)) + 1)}${from.slice(4)}`;
    const to = nextYear < today ? addDays(nextYear, -1) : today;
    windows.push({ from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` });
    if (to === today) break;
    from = nextYear;
  }
  return windows;
}

// ---------------------------------------------------------------------------

const findings: string[] = [];
const note = (line: string): void => {
  console.log(line);
  findings.push(line);
};

async function probeSharedQuota(tokens: string[]): Promise<void> {
  note("\n## 3. Do two PATs on one account share a budget?");
  if (tokens.length < 2) {
    note("- only one token supplied; probe skipped");
    return;
  }
  const cheap = "query { viewer { login } rateLimit { cost limit remaining resetAt } }";

  const before = await gql(tokens[1]!, cheap, {});
  const burn = await gql(tokens[0]!, PROFILE_QUERY, { login: TARGETS[0] });
  const after = await gql(tokens[1]!, cheap, {});

  const sameUser =
    (before.data?.["viewer"] as { login?: string } | undefined)?.login ===
    ((await gql(tokens[0]!, cheap, {})).data?.["viewer"] as { login?: string } | undefined)?.login;

  const dropped = (before.rateLimit?.remaining ?? 0) - (after.rateLimit?.remaining ?? 0);
  note(`- tokens belong to the same account: ${String(sameUser)}`);
  note(`- token A spent ${String(burn.rateLimit?.cost ?? 0)} point(s) on a profile query`);
  note(`- token B's remaining fell by ${String(dropped)} over that window`);
  note(
    dropped > 0
      ? "- **shared budget.** The PAT pool rotates over one quota; SPEC-SERVICE §3 needs amending before 4.3."
      : "- **independent budgets.** The pool design holds.",
  );
}

async function probeAccount(token: string, login: string): Promise<void> {
  note(`\n### ${login}`);
  const profile = await gql(token, PROFILE_QUERY, { login });

  if (profile.errors !== undefined) {
    note(`- FAILED: ${profile.errors.map((e) => e.message).join("; ")}`);
    return;
  }
  note(
    `- profile query: ${String(profile.status)}, cost ${String(profile.rateLimit?.cost ?? 0)}, ` +
      `${String(profile.bytes)} bytes, ${String(profile.ms)} ms`,
  );

  const parsed = profileResponseSchema.safeParse(recordable(profile.data ?? {}));
  note(
    parsed.success
      ? "- shape matches `src/github/shape.ts`"
      : `- SHAPE MISMATCH: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ")}`,
  );
  if (!parsed.success) return;

  write(`${login}.profile.json`, recordable(profile.data ?? {}));

  const createdAt = parsed.data.user.createdAt.slice(0, 10);
  const windows = yearWindows(createdAt, utcToday());
  note(`- created ${createdAt} → ${String(windows.length)} account-year window(s)`);

  const years: unknown[] = [];
  let yearCost = 0;
  let yearBytes = 0;
  let yearMs = 0;
  const sequentialStart = Date.now();
  for (const window of windows) {
    const year = await gql(token, YEAR_QUERY, { login, from: window.from, to: window.to });
    if (year.errors !== undefined) {
      note(`- year ${window.from.slice(0, 10)} FAILED: ${year.errors.map((e) => e.message).join("; ")}`);
      return;
    }
    const yearParsed = yearResponseSchema.safeParse(recordable(year.data ?? {}));
    if (!yearParsed.success) {
      note(`- year ${window.from.slice(0, 10)} SHAPE MISMATCH: ${yearParsed.error.message}`);
      return;
    }
    yearCost += year.rateLimit?.cost ?? 0;
    yearBytes += year.bytes;
    yearMs += year.ms;
    years.push(recordable(year.data ?? {}));
  }
  const sequentialMs = Date.now() - sequentialStart;
  write(`${login}.years.json`, years);
  note(`- year queries: ${String(windows.length)} calls, ${String(yearCost)} points, ${String(yearBytes)} bytes`);
  note(
    `- year latency: ${String(Math.round(yearMs / windows.length))} ms mean, ` +
      `${String(sequentialMs)} ms sequential total`,
  );
  note(`- **cold fetch total: ${String((profile.rateLimit?.cost ?? 0) + yearCost)} points, ` +
    `${String(profile.ms + sequentialMs)} ms sequential (budget: 1500 ms p95)**`);

  // The fetcher is free to fan the year windows out; measured here so 4.3 knows
  // whether that alone rescues the cold-request budget.
  const parallelStart = Date.now();
  await Promise.all(
    windows.map((w) => gql(token, YEAR_QUERY, { login, from: w.from, to: w.to })),
  );
  note(`- same ${String(windows.length)} year queries in parallel: ${String(Date.now() - parallelStart)} ms`);

  try {
    const history = normalize({
      profile: recordable(profile.data ?? {}),
      years,
      fetchedAt: utcToday(),
    });
    const json = JSON.stringify(history);
    write(`${login}.history.json`, history);
    note(
      `- normalizes: ${String(json.length)} bytes of NormalizedHistory, ` +
        `${String(history.weeks.length)} weeks, streak ${String(history.streak.current)}/${String(history.streak.longest)}, ` +
        `${String(history.totals.commits)} capped contributions, ` +
        `languages [${history.languages.map((l) => l.name).join(", ")}]`,
    );
  } catch (err) {
    note(`- NORMALIZE FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  const tokens = loadTokens();
  note(`# SPIKE-GRAPHQL run ${utcToday()}`);
  note(`\n${String(tokens.length)} token(s) loaded, targets: ${TARGETS.join(", ")}`);

  note("\n## 1-2. Query shape and cost");
  for (const [i, login] of TARGETS.entries()) {
    await probeAccount(tokens[i % tokens.length]!, login);
  }

  await probeSharedQuota(tokens);

  const final = await gql(tokens[0]!, "query { rateLimit { cost limit remaining resetAt } }", {});
  note(
    `\n## Budget after the run\n- ${String(final.rateLimit?.remaining ?? 0)} / ` +
      `${String(final.rateLimit?.limit ?? 0)} points, resets ${final.rateLimit?.resetAt ?? "?"}`,
  );

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "RUN.md"), `${findings.join("\n")}\n`, "utf8");
  console.log(`\nrecorded to dev/spikes/graphql/`);
}

await main();
