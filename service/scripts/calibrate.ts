/**
 * CALIBRATE - the gate on the form ladder shipping (C.5, PROPOSAL-VARIETALS §7.6).
 *
 *   pnpm --filter @kodama/api calibrate -- --corpus dev/calibration/corpus.txt
 *   pnpm --filter @kodama/api calibrate -- --discover 150
 *   pnpm --filter @kodama/api calibrate -- octocat defunkt sindresorhus
 *
 * Every threshold in `engine/src/form.ts` is a guess, and §7.6 is blunt about
 * what that means: they are unfalsifiable until somebody runs the ladder over
 * real accounts and looks at the histogram. This is that run. Acceptance:
 *
 *   1. No style above 35% of the accounts that clear the maturity floor.
 *   2. No style below 2% of them.
 *   3. The three archetypes the PRD names - maintainer, grinder, newcomer - land
 *      on visibly different styles.
 *
 * Until this reports PASS, C.4 does not start (HANDOFF-PHASE-C §7).
 *
 * **This script makes real API calls against real people's public accounts, and
 * the owner runs it, not an agent.** Three rules follow from that and they are
 * enforced below rather than described:
 *
 *   - **The corpus is never committed.** Everything this writes goes to
 *     `dev/calibration/`, and `dev/` is gitignored - same rule that keeps the
 *     spike recordings out (D-043). No test in the repo may depend on it.
 *   - **The report is aggregate only.** No login appears in it. A histogram and a
 *     set of quantiles say everything calibration needs; a table of who got which
 *     tree is a profile of named strangers.
 *   - **It stops before it empties the budget.** The rate limit is checked after
 *     every account and the run halts with a partial report rather than failing
 *     mid-corpus.
 *
 * It lives in `service/scripts` and not `engine/scripts` where the handoff put
 * it, because it needs the fetch and the normalizer - the service already depends
 * on the engine, and the reverse would be a cycle for no gain (D-043).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_FORM,
  FORM_LADDER,
  FORM_MIN_MATURITY,
  FORM_NAMES,
  selectForm,
  treeFacts,
} from "@kodama/engine";
import type { FormName, NormalizedHistory, TreeFacts } from "@kodama/engine";

import { PROFILE_QUERY, YEAR_QUERY } from "../src/github/query.js";
import { profileResponseSchema } from "../src/github/shape.js";
import { yearWindows } from "../src/fetcher.js";
import { normalize } from "../src/normalize.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(HERE, "..");
const REPO_DIR = join(PKG_DIR, "..");
const OUT_DIR = join(REPO_DIR, "dev", "calibration");
const CACHE_DIR = join(OUT_DIR, "cache");

/** §7.6's acceptance band, over accounts at or above the maturity floor. */
const MAX_SHARE = 0.35;
const MIN_SHARE = 0.02;

/** Stop with a partial report rather than run the budget to zero. */
const BUDGET_FLOOR = 60;

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface Args {
  logins: string[];
  corpus: string | null;
  discover: number;
  noCache: boolean;
  dryRun: boolean;
  fromCache: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    logins: [],
    corpus: null,
    discover: 0,
    noCache: false,
    dryRun: false,
    fromCache: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--corpus") {
      args.corpus = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--discover") {
      args.discover = Number(argv[i + 1] ?? "0");
      i += 1;
    } else if (arg === "--no-cache") {
      args.noCache = true;
    } else if (arg === "--from-cache") {
      args.fromCache = true;
    } else if (arg === "--") {
      // pnpm forwards the separator itself on some versions; ignore it rather
      // than making the documented invocation fail.
      continue;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag ${arg}`);
    } else {
      args.logins.push(arg);
    }
  }
  return args;
}

const USAGE = `
No corpus. Give the run some accounts, one of three ways:

  --corpus <file>   one login per line, # for comments. Keep the file outside the
                    repo or in dev/, which is gitignored.
  --discover <n>    sample <n> logins from GitHub's user search. Cheap, but see
                    the bias note in the report - it is not a random sample of
                    GitHub, it is a sample of accounts search ranks highly.
  <login> ...       logins straight on the command line.

  --dry-run         no network at all: runs the ladder over the ten engine
                    fixtures so the report shape can be read. Ten authored
                    personas prove nothing about the thresholds - it will report
                    FAIL on corpus size - but it is how to see what a real run
                    will print, and it needs no token.
  --no-cache        refetch instead of reusing dev/calibration/cache.
  --from-cache      no network: rebuild the report from every history already in
                    dev/calibration/cache, whatever day it was fetched. This is
                    how thresholds get moved - edit FORM_THRESHOLDS, replay, read
                    the histogram, repeat, without spending a point.
`.trim();

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

function splitTokens(raw: string): string[] {
  return raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

const NO_TOKEN = `
No GitHub token. Any one of these works, and none of them needs a scope - the
whole corpus is public contribution data:

  $env:KODAMA_PATS = "ghp_..."      # this shell only, nothing written to disk
  $env:GITHUB_TOKEN = "ghp_..."     # honoured too, single token

  service/.env.local                # KODAMA_PATS=ghp_a,ghp_b  (gitignored)

Or skip the network entirely with --dry-run, which runs the ladder over the ten
engine fixtures.
`.trim();

/**
 * Tokens, from the environment first and the dotfile second.
 *
 * The spike scripts read `service/.env.local` and only that, which is what the
 * first run of this script tripped over: that file is a convenience one machine
 * happened to have, not a convention. An env var is the better default here
 * anyway - a calibration run is occasional, and a token set for one shell leaves
 * nothing behind on disk.
 *
 * Token values are never printed, never written to the report, and never put in
 * the cache. The only thing said out loud is how many were found.
 */
function loadTokens(): string[] {
  const fromEnv = process.env["KODAMA_PATS"] ?? process.env["GITHUB_TOKEN"] ?? process.env["GH_TOKEN"];
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    const tokens = splitTokens(fromEnv);
    if (tokens.length > 0) return tokens;
  }

  const path = join(PKG_DIR, ".env.local");
  if (existsSync(path)) {
    const line = /^KODAMA_PATS=(.*)$/m.exec(readFileSync(path, "utf8"));
    if (line !== null) {
      const tokens = splitTokens(line[1]!);
      if (tokens.length > 0) return tokens;
    }
  }

  throw new Error(NO_TOKEN);
}

interface RateLimit {
  remaining: number;
  limit: number;
  resetAt: string;
}

let remaining = Number.POSITIVE_INFINITY;
let resetAt = "?";

interface Gql {
  data: Record<string, unknown> | null;
  errors: { message: string; type?: string }[] | undefined;
}

async function gql(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Gql> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "kodama-calibrate",
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await response.text();

  let body: { data?: Record<string, unknown>; errors?: Gql["errors"] } = {};
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    throw new Error(`non-JSON response ${String(response.status)}: ${text.slice(0, 160)}`);
  }

  const limit = body.data?.["rateLimit"] as RateLimit | undefined;
  if (limit !== undefined) {
    remaining = limit.remaining;
    resetAt = limit.resetAt;
  }
  return { data: body.data ?? null, errors: body.errors };
}

/** Strip the meta the normalizer neither wants nor should be shown. */
function payload(data: Record<string, unknown> | null): Record<string, unknown> {
  const { rateLimit: _rateLimit, ...rest } = data ?? {};
  return rest;
}

const SEARCH_QUERY = `
query($q: String!, $after: String) {
  search(type: USER, query: $q, first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { __typename ... on User { login } }
  }
  rateLimit { remaining limit resetAt }
}`;

/**
 * Creation-era strata, sampled round-robin.
 *
 * The first version of this ran four popularity-ordered queries back to back and
 * exhausted the first before touching the second, which produced a corpus whose
 * *tenth* percentile account age was eight years - a sample of famous veterans
 * with no young accounts in it at all. Half the ladder is about age and decline,
 * so that corpus could not have calibrated the thresholds it was fetched to test.
 *
 * Stratifying by creation date and interleaving the strata fixes both halves of
 * that: every era is represented, and an interrupted run still holds a spread
 * rather than the first stratum only.
 */
const STRATA = [
  "repos:>2 created:<2012-01-01",
  "repos:>2 created:2012-01-01..2015-12-31",
  "repos:>2 created:2016-01-01..2018-12-31",
  "repos:>2 created:2019-01-01..2021-12-31",
  "repos:>2 created:2022-01-01..2023-12-31",
  "repos:>1 created:>2024-01-01",
] as const;

/**
 * A corpus off GitHub's own search, so a run needs no hand-curated list.
 *
 * The caveat that remains after stratification, and it is repeated in the report
 * because a histogram from a biased sample is worse than no histogram if the bias
 * is forgotten: search ranks by popularity, and `repos:>2` excludes the account
 * that has never pushed anything. So this still over-samples the visible and
 * under-samples the quiet. Treat `--discover` as the fast pass and a curated
 * corpus as the real one.
 */
async function discover(token: string, want: number): Promise<string[]> {
  const perStratum = Math.ceil(want / STRATA.length);
  const buckets: string[][] = [];

  for (const q of STRATA) {
    buckets.push(await sample(token, q, perStratum));
  }

  // Interleaved, so a run stopped early is still spread across the eras.
  const logins: string[] = [];
  for (let i = 0; logins.length < want; i += 1) {
    let added = false;
    for (const bucket of buckets) {
      const login = bucket[i];
      if (login === undefined) continue;
      if (!logins.includes(login)) logins.push(login);
      added = true;
      if (logins.length >= want) break;
    }
    if (!added) break;
  }
  return logins;
}

async function sample(token: string, q: string, want: number): Promise<string[]> {
  const logins = new Set<string>();
  let after: string | null = null;
  while (logins.size < want) {
    const result = await gql(token, SEARCH_QUERY, { q, after });
    if (result.errors !== undefined) {
      console.warn(`  search "${q}" failed: ${result.errors.map((e) => e.message).join("; ")}`);
      break;
    }
    const search = result.data?.["search"] as
      | { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { login?: string }[] }
      | undefined;
    if (search === undefined) break;
    for (const node of search.nodes) {
      if (node.login !== undefined) logins.add(node.login);
    }
    if (!search.pageInfo.hasNextPage) break;
    after = search.pageInfo.endCursor;
  }
  return [...logins].slice(0, want);
}

// ---------------------------------------------------------------------------
// One account
// ---------------------------------------------------------------------------

function cachePath(login: string): string {
  return join(CACHE_DIR, `${login.toLowerCase()}.json`);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A normalized history for one login, from the local cache when it is from today.
 *
 * The cache is a real convenience - a corpus of 200 decade-old accounts is a few
 * thousand rate-limit points, and threshold work means running the ladder over
 * the same corpus many times. It holds normalized histories of real accounts, so
 * it lives in gitignored `dev/` and nowhere else, exactly like the owner's spike
 * recordings.
 */
async function historyFor(
  token: string,
  login: string,
  useCache: boolean,
): Promise<NormalizedHistory | null> {
  const path = cachePath(login);
  if (useCache && existsSync(path)) {
    const cached = JSON.parse(readFileSync(path, "utf8")) as NormalizedHistory;
    if (cached.v === 2 && cached.fetchedAt === today()) return cached;
  }

  const profile = await gql(token, PROFILE_QUERY, { login });
  if (profile.errors !== undefined) {
    console.warn(`  ${login}: ${profile.errors.map((e) => e.message).join("; ")}`);
    return null;
  }
  const parsed = profileResponseSchema.safeParse(payload(profile.data));
  if (!parsed.success) {
    console.warn(`  ${login}: profile shape mismatch`);
    return null;
  }

  // Fanned out rather than sequential. A decade-old account is fifteen year
  // windows, and at ~700 ms each that is a quarter minute per account with
  // nothing on screen - the first run of this script looked hung for three
  // minutes and was simply working. The fetcher fans out for the same reason
  // (SPIKE-GRAPHQL measured it), and the windows are independent.
  const createdAt = parsed.data.user.createdAt.slice(0, 10);
  const windows = yearWindows(createdAt, today());
  const responses = await Promise.all(
    windows.map((window) => gql(token, YEAR_QUERY, { login, from: window.from, to: window.to })),
  );
  const failed = responses.findIndex((year) => year.errors !== undefined);
  if (failed >= 0) {
    console.warn(`  ${login}: year ${windows[failed]!.from.slice(0, 10)} failed`);
    return null;
  }
  const years = responses.map((year) => payload(year.data));

  try {
    const history = normalize({
      profile: payload(profile.data),
      years,
      fetchedAt: today(),
    });
    if (useCache) {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(path, `${JSON.stringify(history)}\n`, "utf8");
    }
    return history;
  } catch (err) {
    console.warn(`  ${login}: normalize failed - ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Aggregation - counts and quantiles only, never a login
// ---------------------------------------------------------------------------

interface Row {
  form: FormName;
  facts: TreeFacts;
  history: NormalizedHistory;
}

const SIGNALS = [
  "maturity",
  "accountYears",
  "cadenceCV",
  "declineRatio",
  "burstiness",
  "langCount15",
  "starsPerCommit",
  "hhi",
  "ownShare",
  "breadth",
  "orgs",
  "anchorYears",
  "anchorShare",
] as const;
type SignalName = (typeof SIGNALS)[number];

function signalsOf(row: Row): Record<SignalName, number> {
  const { facts, history } = row;
  const mix = history.repoMix;
  return {
    maturity: facts.maturity,
    accountYears: facts.accountYears,
    cadenceCV: facts.signals.cadenceCV,
    declineRatio: facts.signals.declineRatio,
    burstiness: facts.signals.burstiness,
    langCount15: facts.signals.langCount15,
    starsPerCommit:
      facts.totals.commits > 0 ? facts.totals.starsReceived / facts.totals.commits : 0,
    hhi: mix.hhi,
    ownShare: mix.ownShare,
    breadth: mix.breadth,
    orgs: mix.orgs,
    anchorYears: mix.anchor?.years ?? 0,
    anchorShare: mix.anchor?.share ?? 0,
  };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

function round(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}

/** How many accounts each rung's predicate accepts, ignoring priority. */
function rungDemand(rows: Row[]): Map<FormName, number> {
  const demand = new Map<FormName, number>();
  for (const rung of FORM_LADDER) {
    let count = 0;
    for (const row of rows) {
      if (rung.when({ facts: row.facts, repoMix: row.history.repoMix })) count += 1;
    }
    demand.set(rung.name, count);
  }
  return demand;
}

function histogram(rows: Row[]): Map<FormName, number> {
  const counts = new Map<FormName, number>(FORM_NAMES.map((name) => [name, 0]));
  for (const row of rows) counts.set(row.form, (counts.get(row.form) ?? 0) + 1);
  return counts;
}

/**
 * The style an account would get with the maturity floor removed.
 *
 * The floor is the one threshold a histogram cannot argue about on its own: every
 * account under it lands on `kokedama` and its signals never reach a rung, so the
 * report would say "36% moss balls" and stop. This walks the ladder directly for
 * those accounts, which is what makes the counterfactual below possible - do the
 * level-4s distribute like everybody else, or do they pile onto one rung because
 * there genuinely is not enough history to read?
 */
function formIgnoringFloor(row: Row): FormName {
  for (const rung of FORM_LADDER) {
    if (rung.when({ facts: row.facts, repoMix: row.history.repoMix })) return rung.name;
  }
  return DEFAULT_FORM;
}

/** Distribution of a form-name assignment, as shares of `rows`. */
function shares(rows: Row[], formOf: (row: Row) => FormName): Map<FormName, number> {
  const counts = new Map<FormName, number>();
  for (const row of rows) {
    const form = formOf(row);
    counts.set(form, (counts.get(form) ?? 0) + 1);
  }
  return counts;
}

function report(rows: Row[], corpusNote: string): string {
  const out: string[] = [];
  const write = (line = ""): void => {
    out.push(line);
  };

  const styled = rows.filter((row) => row.facts.maturity >= FORM_MIN_MATURITY);
  const counts = histogram(rows);
  const demand = rungDemand(rows);
  const denom = styled.length;

  write(`# Form calibration - ${today()}`);
  write();
  write(`Corpus: **${String(rows.length)} accounts** (${corpusNote}).`);
  write(
    `Of those, **${String(denom)}** clear the maturity floor of ${String(FORM_MIN_MATURITY)} ` +
      `and can hold a style at all; the rest are moss balls by definition, ` +
      `and the acceptance band below is measured over the ${String(denom)}.`,
  );
  write();
  write(
    "No login appears anywhere in this file, by design (D-043): calibration needs " +
      "a distribution, not a register of who got which tree.",
  );
  write();

  // -- histogram ----------------------------------------------------------
  write("## Histogram");
  write();
  write("`demand` is how many accounts each rung's condition *accepts* regardless of");
  write("priority. A rung with demand well above its count is being intercepted by an");
  write("earlier one, and a rung with demand 0 is unreachable for this corpus.");
  write();
  write("| form | count | share of styled | demand |");
  write("|---|---:|---:|---:|");
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [form, count] of ordered) {
    const share = denom === 0 ? 0 : count / denom;
    const isStyle = form !== "kokedama";
    write(
      `| ${form} | ${String(count)} | ${isStyle ? `${(share * 100).toFixed(1)}%` : "-"} | ` +
        `${demand.has(form) ? String(demand.get(form)) : "-"} |`,
    );
  }
  write();

  // -- acceptance ---------------------------------------------------------
  write("## Acceptance (§7.6)");
  write();
  const failures: string[] = [];
  if (denom < 40) {
    failures.push(
      `corpus too small to conclude anything: ${String(denom)} styled accounts, want >= 40`,
    );
  }

  // A lopsided corpus is worse than a small one, because it looks like a result.
  // Half the ladder reads age or decline, so a sample with no young accounts in it
  // cannot calibrate those rungs whatever its size.
  const ages = rows.map((row) => row.facts.accountYears).sort((a, b) => a - b);
  const youngShare = ages.filter((years) => years < 3).length / ages.length;
  if (quantile(ages, 0.1) > 4) {
    failures.push(
      `corpus skews old: p10 account age is ${round(quantile(ages, 0.1))} years, so nine in ` +
        "ten accounts are veterans - the age and decline rungs cannot be calibrated on it",
    );
  }
  if (youngShare < 0.1) {
    failures.push(
      `only ${(youngShare * 100).toFixed(1)}% of the corpus is under three years old; ` +
        "the maturity floor and the seedling display are unmeasurable at that mix",
    );
  }
  for (const [form, count] of counts) {
    if (form === "kokedama") continue;
    const share = denom === 0 ? 0 : count / denom;
    if (share > MAX_SHARE) {
      failures.push(`${form} is ${(share * 100).toFixed(1)}% of styled accounts (cap ${String(MAX_SHARE * 100)}%)`);
    }
    // The floor asks "can anybody be this style at all", which is a question
    // about rungs. `moyogi` is the fallback, so a *small* moyogi share is the
    // ladder working - it only fails when it swallows the corpus, which the cap
    // above catches.
    if (share < MIN_SHARE && form !== DEFAULT_FORM) {
      failures.push(
        `${form} is ${(share * 100).toFixed(1)}% of styled accounts (floor ${String(MIN_SHARE * 100)}%)` +
          (demand.get(form) === 0 ? " - and no account satisfies its condition at all" : ""),
      );
    }
  }
  if (failures.length === 0) {
    write("**PASS.** Every style lands between 2% and 35% of the styled corpus.");
  } else {
    write(`**FAIL**, ${String(failures.length)} finding(s):`);
    write();
    for (const failure of failures) write(`- ${failure}`);
  }
  write();
  write(
    "The archetype criterion - maintainer / grinder / newcomer visibly different - " +
      "is asserted in `engine/test/form.test.ts` against the fixtures, and currently " +
      "records a known miss: the grinder fixture is maturity 4 and so falls under the " +
      "floor alongside the newcomer. Decide the floor here, with the numbers below.",
  );
  write();

  // -- where the floor should sit ----------------------------------------
  write("## Where the maturity floor should sit");
  write();
  write("The one threshold the histogram above cannot argue about, because every account");
  write("under it is a moss ball by construction. Two questions, and the second is the one");
  write("that decides it: how many accounts does the floor exclude, and do the excluded");
  write("ones have anything legible to say?");
  write();
  write("| maturity | accounts | share of corpus | cumulative if floor were here |");
  write("|---:|---:|---:|---:|");
  const byMaturity = new Map<number, number>();
  for (const row of rows) {
    const m = row.facts.maturity;
    byMaturity.set(m, (byMaturity.get(m) ?? 0) + 1);
  }
  const levels = [...byMaturity.keys()].sort((a, b) => a - b);
  for (const level of levels) {
    const count = byMaturity.get(level) ?? 0;
    const styledHere = rows.filter((row) => row.facts.maturity >= level).length;
    write(
      `| ${String(level)} | ${String(count)} | ${((count / rows.length) * 100).toFixed(1)}% | ` +
        `${((styledHere / rows.length) * 100).toFixed(1)}% styled |`,
    );
  }
  write();

  const under = rows.filter((row) => row.facts.maturity < FORM_MIN_MATURITY);
  if (under.length > 0) {
    write(
      `The **${String(under.length)}** accounts currently under the floor would distribute ` +
        "like this if the ladder were allowed to read them:",
    );
    write();
    write("| form | count | share of the excluded |");
    write("|---|---:|---:|");
    const counterfactual = [...shares(under, formIgnoringFloor).entries()].sort(
      (a, b) => b[1] - a[1],
    );
    for (const [form, count] of counterfactual) {
      write(`| ${form} | ${String(count)} | ${((count / under.length) * 100).toFixed(1)}% |`);
    }
    write();
    write(
      "Read it this way: a spread resembling the styled corpus means the floor is " +
        "throwing away readable accounts and should come down. A pile onto one or two " +
        "rungs - or onto `moyogi` - means the opposite, that there is genuinely too " +
        "little history there and the moss ball is the honest answer.",
    );
    write();
    write("| active weeks among the excluded | p10 | p50 | p90 |");
    write("|---|---:|---:|---:|");
    const weeks = under.map((row) => row.facts.signals.activeWeeks).sort((a, b) => a - b);
    write(
      `| activeWeeks | ${round(quantile(weeks, 0.1))} | ${round(quantile(weeks, 0.5))} | ` +
        `${round(quantile(weeks, 0.9))} |`,
    );
    write();
    write(
      "`activeWeeks` is the direct measure of how much evidence exists, as opposed to " +
        "maturity, which is volume per level. If the excluded accounts have a year or " +
        "more of active weeks, the floor is measuring the wrong thing and should be " +
        "expressed in `activeWeeks` instead of in levels.",
    );
    write();
  }

  // -- signal distributions ----------------------------------------------
  write("## Signal distributions");
  write();
  write("The evidence for moving a threshold. Deciles of every input the ladder reads,");
  write("over the whole corpus - if a rung is starving, this says which side of which");
  write("number to move.");
  write();
  write("| signal | p10 | p25 | p50 | p75 | p90 | max |");
  write("|---|---:|---:|---:|---:|---:|---:|");
  const values = rows.map(signalsOf);
  for (const signal of SIGNALS) {
    const sorted = values.map((v) => v[signal]).sort((a, b) => a - b);
    write(
      `| ${signal} | ${round(quantile(sorted, 0.1))} | ${round(quantile(sorted, 0.25))} | ` +
        `${round(quantile(sorted, 0.5))} | ${round(quantile(sorted, 0.75))} | ` +
        `${round(quantile(sorted, 0.9))} | ${round(sorted[sorted.length - 1] ?? 0)} |`,
    );
  }
  write();
  write(
    "Budget left after the run: " +
      `${Number.isFinite(remaining) ? String(remaining) : "?"} points, resets ${resetAt}.`,
  );
  write();
  return out.join("\n");
}

// ---------------------------------------------------------------------------

/**
 * The ten authored fixtures, as a no-network stand-in for a corpus.
 *
 * Not a calibration: ten personas hand-written to be distinguishable will of
 * course distribute prettily, and the report says so by failing the corpus-size
 * check. This exists so the report can be read, and reviewed, without spending a
 * point or touching anybody's account.
 */
function fixtureRows(date: string): Row[] {
  const dir = join(REPO_DIR, "engine", "fixtures");
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as {
    fixtures: string[];
  };
  return index.fixtures.map((name) => {
    const history = JSON.parse(
      readFileSync(join(dir, `${name}.json`), "utf8"),
    ) as NormalizedHistory;
    const facts = treeFacts(history, date);
    return { form: selectForm({ facts, repoMix: history.repoMix }), facts, history };
  });
}

/**
 * Every history sitting in the cache, as rows. No network, no token.
 *
 * This is the loop threshold work actually runs in: a fetch of 150 accounts costs
 * minutes and a third of the hourly budget, and moving a threshold changes nothing
 * about the histories - only about how they are classified. So fetch once, then
 * replay. A half-written cache file (a run interrupted mid-write) is skipped
 * rather than fatal, because the common reason to replay is that the fetch is
 * still going.
 */
function cachedRows(date: string): Row[] {
  if (!existsSync(CACHE_DIR)) {
    throw new Error(
      "no cache at dev/calibration/cache - run a fetch first, or use --dry-run",
    );
  }
  const rows: Row[] = [];
  let skipped = 0;
  for (const file of readdirSync(CACHE_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const history = JSON.parse(readFileSync(join(CACHE_DIR, file), "utf8")) as NormalizedHistory;
      const facts = treeFacts(history, date);
      rows.push({ form: selectForm({ facts, repoMix: history.repoMix }), facts, history });
    } catch {
      skipped += 1;
    }
  }
  if (skipped > 0) console.warn(`${String(skipped)} unreadable cache file(s) skipped`);
  return rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.fromCache) {
    const date = today();
    const rows = cachedRows(date);
    const text = report(rows, "replayed from dev/calibration/cache, no network");
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, `replay-${date}.md`), `${text}\n`, "utf8");
    console.log(text);
    console.log(`written to dev/calibration/replay-${date}.md`);
    if (text.includes("**FAIL**")) process.exitCode = 2;
    return;
  }

  if (args.dryRun) {
    const date = today();
    const text = report(fixtureRows(date), "the ten engine fixtures, no network - **not a corpus**");
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, "dry-run.md"), `${text}\n`, "utf8");
    console.log(text);
    console.log("written to dev/calibration/dry-run.md");
    return;
  }

  const tokens = loadTokens();
  const token = tokens[0]!;

  let logins = args.logins;
  let corpusNote = "given on the command line";

  if (args.corpus !== null) {
    const path = resolve(REPO_DIR, args.corpus);
    logins = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    corpusNote = "from a curated corpus file";
  } else if (args.discover > 0) {
    console.log(`discovering up to ${String(args.discover)} logins...`);
    logins = await discover(token, args.discover);
    corpusNote =
      "sampled from GitHub user search - **biased towards visible accounts**, so a " +
      "curated corpus should confirm anything decided from it";
  }

  if (logins.length === 0) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  console.log(`${String(logins.length)} login(s), ${String(tokens.length)} token(s)`);

  const rows: Row[] = [];
  const date = today();
  const started = Date.now();

  // A line per account, printed as each one lands. Anything coarser reads as a
  // hung process: an account is one profile query plus a year window per year of
  // its life, so a single old account can take twenty seconds on its own.
  for (const [i, login] of logins.entries()) {
    if (remaining < BUDGET_FLOOR) {
      console.warn(
        `stopping at ${String(i)}/${String(logins.length)}: ${String(remaining)} rate-limit ` +
          `points left, resets ${resetAt}`,
      );
      break;
    }
    const at = Date.now();
    const history = await historyFor(tokens[i % tokens.length]!, login, !args.noCache);
    if (history === null) continue;

    const facts = treeFacts(history, date);
    const form = selectForm({ facts, repoMix: history.repoMix });
    rows.push({ form, facts, history });

    // The login is printed to the console and never to the report - watching a
    // long run needs to know where it is, a committed artifact does not (D-043).
    const done = i + 1;
    const perAccount = (Date.now() - started) / done;
    const left = Math.round(((logins.length - done) * perAccount) / 1000);
    console.log(
      `  ${String(done)}/${String(logins.length)} ${login} -> ${form} ` +
        `(${String(Math.round((Date.now() - at) / 100) / 10)}s, ` +
        `${Number.isFinite(remaining) ? String(remaining) : "?"} points, ~${String(left)}s left)`,
    );
  }

  if (rows.length === 0) {
    console.error("nothing fetched; no report written");
    process.exitCode = 1;
    return;
  }

  const text = report(rows, corpusNote);
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `run-${date}.md`);
  writeFileSync(path, `${text}\n`, "utf8");

  console.log(`\n${text}`);
  console.log(`written to dev/calibration/run-${date}.md`);

  // A non-zero exit when the band is missed, so the gate is mechanical rather
  // than a matter of reading the output charitably.
  if (text.includes("**FAIL**")) process.exitCode = 2;
}

// A missing token or an unreadable corpus file is an instruction to the operator,
// not a defect - so it prints as one sentence, without a stack trace.
try {
  await main();
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
