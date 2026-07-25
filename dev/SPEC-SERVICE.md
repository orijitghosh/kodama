# SPEC-SERVICE - API, data fetch, caching, site

Packages `service/` and `site/`. Vercel deployment. Node runtime for functions
(GraphQL + satori need node; edge runtime is NOT required - the edge *cache*
does the latency work, not edge compute).

## 1. Routes

| Route | Returns | Notes |
|---|---|---|
| `GET /<user>.svg` | tree SVG | the product |
| `GET /<user>` | 302 → `/tree/<user>` | pasteable link behaves nicely; a trailing rewrite, never a `redirects` rule (D-037) |
| `GET /api/<user>.json` | TreeFacts + receipts + NormalizedHistory | CORS `*`, same cache policy, **real status codes** |
| `GET /card/<user>.png` | 1200×630 OG card | satori → resvg; M8 |
| `GET /rings/<user>/<year>.svg` | rings recap | M8 |
| `GET /healthz` | JSON pool/cache stats (no user data) | for the budget dashboard |

**Layout.** `api/` at the repo root is Vercel's reserved functions directory
and holds host adapters only - currently `tree.ts` and `healthz.ts`, three
lines each. The package they call into is `service/`, published as
`@kodama/api` (D-032). `vercel.json` rewrites `/<user>.svg` → `/api/tree` and
`/healthz` → `/api/healthz`; the login is parsed back out of the URL by
`params.ts`, so the route shape stays defined in one file rather than split
between a filename and a rewrite rule. Anything with logic in it belongs in
`service/`, where it is testable without a server.

`/healthz` obeys two rules that are load-bearing rather than stylistic: **no
user data** (it is public and uncacheable, so a login here is a leak with a
URL) and **no summed budgets** (GitHub limits per account, so adding two
same-account tokens' `remaining` reports capacity that does not exist).
It answers 200 while degraded and puts the diagnosis in `alerts`; `ok` goes
false only when nothing can be served at all.

**The JSON route does not obey the 200-always rule** (D-034). That rule exists
because the image route's consumer is a README `<img>`, where a 404 is a broken
glyph on someone's profile; none of it survives the change of consumer. A
`fetch()` caller can only branch on a status, so an unknown account is 404, a
malformed login is 400, and an upstream failure is 503 - while a *stale* answer
is still 200 with `stale: true`, because a real history is a real answer. CORS
is `*`: everything served is already public, and the one use it has is somebody
rendering their own receipts on their own page.

Param validation (zod): `user` must match `^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$`
(GitHub's rule) - reject BEFORE any API spend with the empty-pot SVG (HTTP
200 + SVG, never 4xx HTML: GitHub `<img>` needs an image body). Unknown
params ignored; known params validated to enum, invalid value → default +
`X-Kodama-Warn` header (debuggability without breakage).

The label language is `locale=` (the canonical name, and what the picker
emits); `lang=` is accepted as an alias because the README and PRD document that
shorter name, and one of the two documented spellings silently doing nothing is
the worse outcome. `locale` wins if both are sent.

`date=YYYY-MM-DD` (D-039) is the one param that is not an enum. It moves the
date the engine reads, never the history: the fetch still asks for today, so a
pinned date is today's counts judged against an earlier calendar. Validated by
the engine's own `isValidDate`, so "2026-02-29" is refused rather than
normalized. A date after today falls back to today and warns, since the history
has no days there.

## 2. Request flow

```
validate → edge cache (Vercel CDN via headers) →
  KV get `h1:<login>`
    → fetchedAt is today: render → serve
    → older, or absent: GraphQL fetch → normalize → KV set (TTL 30 d)
                                      → render → serve
    → older, and the fetch failed: render the copy in hand → serve stale
```

Response headers, all image routes:
```
Content-Type: image/svg+xml; charset=utf-8
Cache-Control: public, s-maxage=21600, stale-while-revalidate=86400, max-age=3600
X-Kodama-Engine: v1
```
**Failures and stale trees cache softly instead** (D-031):
`public, s-maxage=300, stale-while-revalidate=3600, max-age=60`. A six-hour
edge cache on "no seed here" outlives the typo that caused it. Those responses
also carry `X-Kodama-State` (`notFound` / `comeBack` / `broken` / `stale`) so a
failure is greppable in the CDN log without parsing the body.
`date` passed to the engine = today UTC → within a cache window all
requesters see the same bytes; determinism + date-granularity make the cache
correct by construction.

Before any spend, two guards stand between a request and the pool (D-040):

- **`n1:<login>` (6 h)** - a login GitHub answered `NOT_FOUND` for. Consulted
  only when no history is cached, so a rename or a deletion still reaches the
  stale path rather than being burned in as a miss. Without it, every invented
  name costs a query and names are free to invent.
- **`c1:<hash>:<hour>` (2 h)** - cold fetches charged to one client in one hour,
  capped at 40. The client is a 32-bit hash of the first `x-forwarded-for` hop,
  never an address (PRD §Privacy). Charged inside the single flight and after
  both caches, so a warm badge and a request that merely waits on someone else's
  fetch are free. Over the cap the route answers `comeBack` with a `retry-after`
  to the top of the hour; the JSON route answers 503. Both fail **open**: a store
  that cannot count returns 0 from `incr`, and 0 lets the request through.

KV is Upstash Redis via the Vercel Marketplace (chosen at 4.0, D-027) behind a
four-method port - `get`/`set`/`del`, plus the `incr` the cap needs, since
get-then-set loses exactly the concurrent increments a cap exists to catch. **One key holds a login's history:** `h1:<login>` =
NormalizedHistory JSON, 30 d TTL. Freshness is the entry's own `fetchedAt`
against today, not the TTL - an entry that expired on schedule is exactly the
one serve-stale needed, so the long retention is what makes the stale path
real (D-030). The `s:<login>` marker of earlier drafts is gone. Closed account
years cache separately and immutably under `y:<login>:<n>` (30 d).

## 3. GitHub data fetch

Single-flight per login (in-process map) to prevent stampede on cache miss.

Query 1 (identity + cheap totals + last year calendar). Live text:
`service/src/github/query.ts` - this block is the contract, that file is the copy
that runs.
```graphql
query Profile($login: String!) {
  user(login: $login) {
    login
    createdAt
    contributionsCollection {
      totalPullRequestReviewContributions
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
    mergedPRs: pullRequests(states: MERGED, last: 10, orderBy: {field: UPDATED_AT, direction: ASC}) {
      totalCount
      nodes { mergedAt additions }
    }
    openPRs: pullRequests(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    answers: repositoryDiscussionComments(onlyAnswers: true) { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: STARGAZERS, direction: DESC}, privacy: PUBLIC) {
      nodes {
        stargazerCount
        languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
        }
      }
    }
  }
  rateLimit { remaining resetAt }
}
```
Amended at step 4.1 against what the normalizer actually reads: `login` (the
canonical casing, absent from the draft), `languages` per repository (the
schema promises a language mix and nothing fetched one), aliases on all four
duplicated/renamed connections, and the drop of the three `total*Contributions`
counters the draft asked for but nothing consumes - the stitched calendar is
the activity source (D-028). Verify exact field names against the live schema
in SPIKE-GRAPHQL - treat this block as intent, not gospel.

Query 2..N (lifetime calendar): `contributionsCollection(from:, to:)` one
call per account year, **anniversary-aligned** - a 2009-12-20 account needs 17
windows, not 18, because GitHub caps a collection at one year and aligning to
the account start wastes none of it. **Cost control:** closed years are
immutable → cached in KV under `y:<login>:<n>` with TTL 30 d, where `n` counts
from the account's first year. Cold first fetch for a 17-year account = 17
calls once, then 1 call per refresh. The year still in progress is never
cached.

Streaks computed during normalization from the stitched daily calendar
(UTC days, GitHub's own definition of a contribution day). An empty *today*
does not break the current streak - a fetch at 02:00 UTC would otherwise
report every streak broken every morning; two empty days do (D-028).

**PAT pool:** env `KODAMA_PATS` = comma-separated tokens (created by human -
see IMPLEMENTATION §manual steps; classic PATs, NO scopes: public data
only). Round-robin with per-token remaining-quota tracking from
`rateLimit { cost limit remaining resetAt }` piggybacked on every query; a
token under 500 remaining is benched until reset. Pool telemetry → `/healthz`;
alert (Vercel log drain or simple threshold email) at 70% aggregate
consumption.

**A refusal is benched on GitHub's clock, not ours.** 403, 429, and a
`RATE_LIMITED` GraphQL error all carry `retry-after` or `x-ratelimit-reset`, and
the pool believes them (`benchUntil`), clamped to the hour in either direction. A
403 means both "bad credentials" and "too fast", and only the headers tell them
apart: benching a healthy token for an hour over a secondary limit that clears in
seconds costs more capacity than the limit did, during exactly the spike that
caused it. A primary-limit rejection also arrives as a 200 with no `data`, so
there is no quota reading to bench on - without the header path the pool would
keep handing that token out for the rest of the window, one wasted round trip per
request. Pool exhaustion is the one failure that knows a time, so the image
route puts it in `retry-after` on the seedling response (§4).

**One token per account, or the pool is theatre.** GitHub's rate limit is per
*user*, not per token: two PATs on one account share one 5 000-point budget,
measured in SPIKE-GRAPHQL §3. Tokens from the same account add no capacity and
no failover. `/healthz` reports per-account budgets, never a sum - summing
across same-account tokens reports 10 000 points that do not exist.

**Cost is flat: 1 point per query, any shape** (SPIKE-GRAPHQL §2). The budget
constrains round trips, not payload. This is why the fetch below splits into
parallel queries rather than one fat document: three extra points out of 5 000
buys back seconds of wall clock.

**Fetch shape (measured, SPIKE-GRAPHQL §4):**

1. Identity only (`login`, `createdAt`) - ~115 ms. The year windows depend on
   `createdAt` and nothing else does.
2. Everything else concurrently: calendar, counts, stars, languages, and every
   year window at once. Wall clock is the slowest branch, not the sum -
   sequential year fetching cost 16 s on a whale, parallel 1.6 s.
3. Languages come from `repositories(first: 25)`, stars from `first: 100`, as
   separate parallel branches. The 100-repo language fan-out alone was 2 561 ms
   against 918 ms for 25, for a language mix that is essentially identical by
   stars.

**Abuse:** per-IP token bucket on cache-miss path only (10 misses/min);
over → serve stale or seedling, HTTP 200 always.

## 4. Error SVG states (all designed, all 200)

| Condition | Serve |
|---|---|
| Invalid username | empty pot + "no seed here" |
| GitHub 404 | empty pot + "user not found" |
| API rate-limited / 5xx, KV has stale | stale tree + tiny wilt-free "cached" leaf mark |
| API failure, no stale | seedling + "come back soon" |
| Client over its cold-fetch cap, no stale | seedling + "come back soon" (D-040) |
| Engine throw (bug) | seedling variant; log with history hash for repro |

Failure-injection test suite (vitest + mocked fetch) covers every row and
asserts: HTTP 200, valid SVG, correct Content-Type, size cap.

Pool exhaustion adds `retry-after`, in seconds until the earliest-resetting
token, floored at a minute (to agree with "come back soon") and capped at an
hour. A client over the cold-fetch cap adds one too, counting to the top of its
hour. Both ride on a 200, so no cache acts on them: they are for the landing page
and for whoever is reading headers during an incident. No other row carries one -
nothing else knows a time.

## 5. Site (`site/` - Astro, static-first)

Built to `site/dist`, which is the deployment's `outputDirectory`; the
functions in `api/` are the same deployment, so the badge on the landing page
and the badge in a README take the identical path. Nothing on the site renders
at request time (D-033).

- **Landing:** username input → live `<img>` from the real API (dogfood the
  cache) → theme/scale picker (re-requests with params) → copy-snippet
  button. Funnel budget: < 30 s, zero scroll required on desktop.
  **Built 5.1.** With scripting off, the demo tree and its markdown line are
  still there and the `<noscript>` block spells the URL grammar - only the
  picker needs the bundle. The picker's options come from the engine's
  `THEME_NAMES`/`SCALES`, the username pattern and the option defaults from
  `params.ts`, so a value the site offers is by construction a value the route
  accepts, and an option equal to its default never reaches the snippet.
- **Receipts page** `/tree/<user>`: interactive SVG (same engine output +
  a JSON sidecar from `/api/<user>.json`); hover/focus any ornament →
  tooltip with provenance line. Keyboard navigable (ornaments are
  focusable `<g role="img">` with aria-labels) - accessibility parity is
  same-commit, not later.
  **Built 5.2.** One static page for every account, reached through a
  `/tree/:user` rewrite. The SVG is fetched and **inlined** rather than left in
  an `<img>`: an image is one opaque node, and this page exists to let every
  element be interrogated. Groups are matched to receipts by the class the
  renderer emits, so a renamed class breaks a test rather than quietly emptying
  the page. Axe (wcag2a/2aa/21a/21aa) is clean on this page and the landing
  page; two colours are darker here than the engine's `paper` palette because
  the theme's accent and secondary text miss AA as *text*.
- **Grammar page:** the PRD mapping table, rendered pretty, with a live
  example tree per row. This page IS the launch post's canonical link.
  **Built 5.3** as one specimen with thirteen rows pointing into it rather
  than thirteen thumbnails (D-036) - the comparison the page wants to make is
  between a row and a part of a picture.
- **Gallery:** the 12 fixtures rendered large, labeled ("the maintainer",
  "the decade veteran"...). Doubles as the taste-gate review artifact.
  **Built 5.3**: 6 fixtures × 2 themes × 2 seasons, emitted as files by a
  static endpoint and lazy-loaded. Re-rendered rather than copied, with
  `taste-gate.test.ts` holding the current engine to what Gate #1 approved.
- No analytics beyond Vercel's built-in aggregates; privacy paragraph in
  the footer.

## 6. Budgets (asserted, not aspired)

**Measured on staging 2026-07-21** (OPS §4): cold p95 **2 161 ms** across five
real logins, inside the 2 500 ms tier; CDN `MISS` → `HIT` byte-identical on the
repeat request. The ≤ 1.5 s tier for accounts under ten years is **still
unmeasured** - every login in that sample was an old account. Largest render
was 55 101 B, or 91.8% of the 60 KB full-scale cap.

- Render (engine, node): p95 ≤ 30 ms on the whale fixture - vitest bench.
- Cold request end-to-end: ≤ 1.5 s p95 for accounts under 10 years, **≤ 2.5 s
  p95 beyond that** (staging measurement script). Amended 2026-07-21 from a
  flat 1.5 s: SPIKE-GRAPHQL §4 measured 20 s sequential on a 17-year account
  and ~1.8 s after parallelizing, where the remainder is GitHub's own response
  time. Cold happens once per user per 24 h; every other request is a CDN or
  KV hit.
- Cached: CDN, not our concern beyond correct headers - verified by a probe
  script asserting `x-vercel-cache: HIT` on second request.
- Site: Lighthouse ≥ 95 performance and accessibility on landing, grammar and
  gallery. **Measured 2026-07-21: 100/100 on all three** (IMPLEMENTATION 5.3).
  The receipts page is excluded on purpose - its content arrives from two live
  API calls, so a score would measure GitHub's response time, not this repo's.
- Monthly cost sheet in `dev/OPS.md` updated at each milestone with real
  invocation × duration numbers at 1 k / 10 k / 100 k user projections;
  Cloudflare Workers port notes maintained alongside (engine is pure -
  the port is `service/` only).
