/**
 * SPIKE-GRAPHQL addendum: what makes the profile query slow?
 *
 *   pnpm --filter @kodama/api spike:profile
 *
 * The full document takes ~4 s on a whale account, which alone exceeds the
 * 1.5 s cold budget (SPEC-SERVICE §6). This bisects it: the suspect is the
 * 100-repository fan-out with a 5-language connection on each.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOGIN = process.argv[2] ?? "sindresorhus";
const RUNS = 3;

const token = (() => {
  const raw = readFileSync(join(PKG_DIR, ".env.local"), "utf8");
  const line = /^KODAMA_PATS=(.*)$/m.exec(raw);
  if (line === null) throw new Error("service/.env.local has no KODAMA_PATS line");
  return line[1]!.trim().split(",")[0]!.trim();
})();

const CALENDAR = `contributionsCollection {
      totalPullRequestReviewContributions
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }`;

const COUNTS = `mergedPRs: pullRequests(states: MERGED, last: 10, orderBy: {field: UPDATED_AT, direction: ASC}) {
      totalCount
      nodes { mergedAt additions }
    }
    openPRs: pullRequests(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    answers: repositoryDiscussionComments(onlyAnswers: true) { totalCount }`;

const repos = (first: number, withLanguages: boolean): string =>
  `repositories(first: ${String(first)}, ownerAffiliations: OWNER, orderBy: {field: STARGAZERS, direction: DESC}, privacy: PUBLIC) {
      nodes {
        stargazerCount
        ${withLanguages ? "languages(first: 5, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } }" : ""}
      }
    }`;

const variants: { name: string; query: string }[] = [
  { name: "identity only", query: `user(login: $login) { login createdAt }` },
  { name: "identity + calendar", query: `user(login: $login) { login createdAt ${CALENDAR} }` },
  { name: "identity + counts", query: `user(login: $login) { login createdAt ${COUNTS} }` },
  { name: "repos 100, no languages", query: `user(login: $login) { login ${repos(100, false)} }` },
  { name: "repos 100 + languages", query: `user(login: $login) { login ${repos(100, true)} }` },
  { name: "repos 25 + languages", query: `user(login: $login) { login ${repos(25, true)} }` },
  {
    name: "FULL (production document)",
    query: `user(login: $login) { login createdAt ${CALENDAR} ${COUNTS} ${repos(100, true)} }`,
  },
];

async function time(query: string): Promise<{ ms: number; bytes: number; cost: number }> {
  const started = Date.now();
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "kodama-spike-graphql",
    },
    body: JSON.stringify({
      query: `query Probe($login: String!) { ${query} rateLimit { cost } }`,
      variables: { login: LOGIN },
    }),
  });
  const text = await response.text();
  const body = JSON.parse(text) as {
    data?: { rateLimit?: { cost: number } };
    errors?: { message: string }[];
  };
  if (body.errors !== undefined) throw new Error(body.errors.map((e) => e.message).join("; "));
  return {
    ms: Date.now() - started,
    bytes: Buffer.byteLength(text, "utf8"),
    cost: body.data?.rateLimit?.cost ?? 0,
  };
}

console.log(`# Profile query bisect - ${LOGIN}, best of ${String(RUNS)}\n`);
console.log("| variant | best ms | bytes | cost |");
console.log("|---|---|---|---|");
for (const variant of variants) {
  const runs: { ms: number; bytes: number; cost: number }[] = [];
  for (let i = 0; i < RUNS; i += 1) runs.push(await time(variant.query));
  const best = runs.reduce((a, b) => (a.ms < b.ms ? a : b));
  console.log(
    `| ${variant.name} | ${String(best.ms)} | ${String(best.bytes)} | ${String(best.cost)} |`,
  );
}
