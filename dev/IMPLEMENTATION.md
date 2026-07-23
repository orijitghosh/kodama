# IMPLEMENTATION - build plan

Read order before step 0: PRD.md → SPEC-ENGINE.md → SPEC-SERVICE.md →
TASTE.md → DECISIONS.md → this file. Specs bind; conflicts → DECISIONS.md
entry before code.

## Standing constraints (all steps)

- TypeScript strict everywhere; pnpm workspaces monorepo: `engine/`,
  `service/`, `site/`, later `cards/`. Node LTS. Vitest. No framework in
  `engine/` (zero runtime deps - dev deps only). `site/` = Astro.
- Engine purity enforced by ESLint config (SPEC-ENGINE §1) from step 0 -
  the lint rules land BEFORE the first engine file.
- Conventional commits. `dev/` stays in-repo but out of deploys.
- Every step ends with: tests green, lint clean, a conventional commit.
  A step's "Accept:" list is binding - do not proceed on partial.
- Undocumented platform behavior → spike first (D-012); findings to
  `dev/spikes/SPIKE-<name>.md` as dated empirical notes.
- When a spec value proves wrong in practice (a threshold, a palette, a
  GraphQL field): fix the spec in the same commit as the code, note in
  DECISIONS.md if architectural.

## Manual steps (accounts, cards, judgment calls)

| When | What |
|---|---|
| Before step 4.2 | Create 2+ classic PATs, **no scopes**, on a spare/main account; provide as env |
| Before step 4.5 | Vercel account + project link, KV/Upstash provisioning |
| Before step 6.x | Domain purchase (kodama.dev or fallback) + DNS |
| Gates 2.6 / 7.5 | Taste-gate judgment: "would you post this?" ×12 |
| Step 3.1 | A throwaway public repo for camo testing |
| Launch | Posts, screenshots, community replies |

---

## M0 - Scaffold

**0.1** pnpm monorepo; `engine/` package with tsconfig strict, vitest,
fast-check, ESLint purity rules; CI workflow (GitHub Actions: lint, test,
build, size-report). Accept: `pnpm -r test` green on a placeholder test;
purity lint demonstrably fails a `Date.now()` probe file (then delete probe).

**0.2** Shared types package or `engine/src/types.ts`: NormalizedHistory v1,
TreeFacts, RenderOptions, Palette - verbatim from SPEC-ENGINE §1-2.
Accept: typecheck; JSON schema (zod) for NormalizedHistory with fixture
round-trip test.

**0.3** Author the 10 synthetic fixtures (SPEC-ENGINE §7) as JSON +
generator script for the dense ones (whale needs ~520 weeks - generate,
don't hand-write; generator is seeded and committed). Accept: all fixtures
validate against the zod schema; spammer fixture demonstrates the daily cap
contract documented in a test.

## M1 - Engine core

**1.1** mulberry32 + FNV-1a, PRNG stream wrapper (named draws:
`rng.take(n, "attractors")` so insertion of new draw sites doesn't reshuffle
existing ones - allocate per-subsystem substreams by hashing the label).
Accept: substream independence test; cross-platform determinism test
(values snapshot-locked).

**1.2** TreeFacts computer: growth units, maturity, streaks-from-weeks,
season/weather/dormancy/pot-tier per SPEC-ENGINE §3.2/3.5. Table-driven
boundary tests (level-up day, day-90 vs 91 dormancy, season edges, leap
day, UTC discipline). Accept: full table green; TreeFacts is a pure function
with 100% branch coverage (it's the product's law - cover it).

**1.3** Skeleton: seeded attractor sequence, space colonization, level
stability. Accept: same (seed, level) ⇒ deep-equal skeleton across 100 runs;
element-monotonicity property vs maturity; visual dump script
(`pnpm dev:skel <login>`) writing debug SVGs for eyeballing.

**1.4** SVG serializer: element builders, 2-decimal rounding, viewBox
bounds assertion, size accounting. Accept: property tests from SPEC-ENGINE
§7 wired (well-formed XML, bounds, no NaN).

**1.5** Bonsai substrate + masses: pot tiers, soil, trunk/branch stroke
rendering, foliage pads with density residual. ink + dusk palettes from
TASTE §3, dark/light via CSS custom properties + media query. Accept:
golden SVGs for 6 fixtures × 2 themes committed; whale render p95 ≤ 30 ms
bench; sizes within caps.

## M2 - Tier-1 grammar

**2.1** Ornaments: shoots, fruit (ripening lerp), unripe fruit, lanterns.
**2.2** Inhabitants + rest: bird, fireflies (night themes), wind chime,
blossoms, falling petals, soil petal ring.
**2.3** Seasons: palette modulation + hanami/harvest/snow windows; winter
bare-branch ratio.
**2.4** Scales: compact, strip, button per TASTE §4; stats column + legend
+ header for full.
**2.5** `tint=lang` (hue shift ≤ 20°), locale label table (en, ja minimum),
`<title>/<desc>` biography generator.
Accept for 2.1-2.5 individually: rule-table unit tests (every cap and
threshold from SPEC-ENGINE §3.4 hit at boundary), goldens extended
(fixture × theme × 4 season dates), size caps still green.

**2.6 - TASTE GATE #1** (TASTE §5). Render gallery, checklist, human
verdict. Accept: 12/12 "would post". Failure → tune → repeat gate. Do not
start M3 before pass.

## M3 - Camo spike + animation

**3.1 - SPIKE-CAMO** (protocol): push a test README to the throwaway repo
embedding probe SVGs: (a) CSS keyframe animation, (b) SMIL, (c)
prefers-color-scheme media query, (d) prefers-reduced-motion query, (e)
oversized 200 KB SVG, (f) `<style>` with CSS custom properties. Fetch each
via the camo URL GitHub rewrites to; record: served bytes intact? headers?
size limits? render check in real browser on the README. Findings →
`dev/spikes/SPIKE-CAMO.md`. If (c) fails → execute D-006 fallback (dual
image; site copy button emits both lines) and amend SPEC. Accept: findings
file with evidence (curl output, screenshots), spec amendments committed.

> **Resolved 2026-07-20** (`dev/spikes/SPIKE-CAMO.md`, D-025). Camo is a
> verbatim byte proxy: bytes, `image/svg+xml`, CSS/SMIL animation, and (c)
> `prefers-color-scheme` all survive. (c) passed → D-006 single-SVG dual-theme
> holds, dual-image fallback dropped. The probe host must be third-party
> (jsDelivr, then Vercel); `raw.githubusercontent.com` is first-party and
> bypasses camo. Cache-freshness tuning deferred to M4.5.

**3.2** Animation layer within findings: sway/petals/fireflies/snow per
TASTE §6, single-toggle strip for `animate=off`, reduced-motion media
query. Accept: goldens for animate on/off; flash-ceiling audit test (no
animation duration < 3 s); byte caps hold with `<style>` included.

> **Done 2026-07-20** (`engine/src/animate.ts`, D-026). Static class-based CSS,
> full scale only; per-item `<g>` wrappers so each petal/flake/firefly moves as
> a unit (48 static goldens regenerated). `animate=off` appends nothing -
> byte-identical to no layer. 12 animate goldens (6×2 at summer); render tests
> cover the strip, full-only gating, reduced-motion, the 3 s flash floor, and
> the full cap with the block included. Suite 572 green, lint + typecheck clean.

## M4 - API + ops

**4.0** KV decision (D-008): free-tier math in `dev/OPS.md`, 20-line
interface, in-memory impl for tests.

> **Done 2026-07-21** (`dev/OPS.md`, D-027). Upstash Redis via the Vercel
> Marketplace - Vercel KV is sunset, so the pick was Marketplace vs. direct.
> Port is `service/src/kv/index.ts` (`get`/`set(ttl)`/`del` + key builders + TTLs),
> `MemoryKV` with an injected clock for tests, `guarded()` so a dead store reads
> as a cold one. History TTL is 24 h against a 6 h CDN window on purpose (§2).
> Free tier ≈ 550 badges; projections and levers in OPS.md §3.

**4.1** Normalizer: GraphQL response shapes → NormalizedHistory (caps,
streaks, per-year stitching). Accept: recorded-response fixtures (from
SPIKE-GRAPHQL) round-trip; spammer capping verified end-to-end.

> **Done 2026-07-21** (`service/src/normalize.ts`, D-028). Zod-parsed response
> shapes, daily cap at 30 before summation, ISO-week regrouping of GitHub's
> Sunday weeks, overlap-tolerant year stitching, streaks with a one-day grace
> for an empty today. Spammer capping asserted end-to-end (400/day and 30/day
> produce identical weeks and maturity). Query amended in SPEC-SERVICE §3:
> `login`, per-repo `languages`, aliases, and the unused `total*Contributions`
> dropped. Fixtures here are hand-built to the query shape - **4.2 swaps in
> recorded responses**, and any mismatch is the spike's finding.

**4.2 - SPIKE-GRAPHQL**: run the SPEC-SERVICE §3 query against live API
(real PAT, own account + a whale account + a 10-year account); verify field
names/aliases, measure rate cost per query shape, record in
`dev/spikes/SPIKE-GRAPHQL.md`; amend SPEC query to reality.

> **Resolved 2026-07-21** (`dev/spikes/SPIKE-GRAPHQL.md`, D-029). Query
> resolves as amended at 4.1 on all three account shapes; recorded responses
> committed and normalizing. Cost is flat 1 point/query - quota constrains
> round trips, not payload. Two findings invalidated spec: **PATs on one
> account share one budget** (the pool needs one token per account), and the
> **1.5 s cold budget was unreachable** (20 s sequential on a whale; ~1.8 s
> after parallelizing) - amended to 2.5 s beyond ten account years. 4.3's fetch
> shape is now measured, not guessed: identity first, then everything
> concurrent, languages from the top 25 repos.

**manual steps update:** the second PAT must live on a *different* account to
do anything. One token per account, or the pool is decoration.
**4.3** Fetcher: per-year immutable caching, single-flight, PAT pool with
bench/reset logic, `rateLimit` piggyback. Accept: pool unit tests (rotation,
benching, exhaustion → stale path); no token string ever logged (test
asserts log scrubbing).

> **Done 2026-07-21** (`service/src/fetcher.ts`, D-030). Two-phase fan-out per
> SPIKE-GRAPHQL: identity, then counts/stars/languages/all year windows
> concurrently, reassembled into the normalizer's shape. Anniversary-aligned
> year windows, closed years cached immutably, the open year never cached.
> Cache collapsed to one key with date-based freshness, which is what finally
> makes serve-stale real - and halves the command count in OPS.md. Pool
> rotates, benches under 500 or on a 401, and lifts the bench at reset;
> `stats()` is per-token and never summed. `scrub()` redacts registered tokens
> and unregistered token shapes; asserted on the real log path. 98 api tests.
>
> The recorded fixtures from 4.2 now round-trip: both real accounts normalize,
> hold every schema invariant, survive a JSON round trip, and render - the
> 4.1 accept criterion, closed with live data.
**4.4** Route handler: validation, cache headers, error-SVG table
(SPEC-SERVICE §4), `X-Kodama-Engine`. Accept: failure-injection suite -
every table row returns 200 + valid SVG; header snapshot test.

> **Done 2026-07-21** (`service/src/route.ts`, D-031). Web `Request`/`Response`, so
> it runs on Vercel node, in a test with no server, and ports to Workers
> untouched. Username checked against GitHub's rule before any API spend;
> options fall back and warn via `X-Kodama-Warn` rather than failing. All five
> error rows drawn in the engine's theme system at the requested scale, plus
> the stale leaf mark. Failures cache for 5 min, not 6 h. 21 route tests assert
> 200 + well-formed XML + content type + size cap on every path, including a
> throwing renderer; the engine-throw log carries the history hash and never
> the history.
**4.5** Deploy to Vercel staging; probe script asserts CDN HIT on second
request, cold p95 ≤ 1.5 s against 5 real logins; `/healthz` up. Also close the
SPIKE-CAMO residual (D-025): confirm the badge refreshes through camo within a
day - set `Cache-Control` on the SVG response and verify camo's served copy
updates after the source changes (Age/ETag behaviour). Accept: probe output
committed to `dev/OPS.md`.

> **Deployable 2026-07-21** (D-032), not yet deployed - the deploy itself is a
> manual step. Built: the Upstash REST store behind the KV port, the
> composition root (`service/src/app.ts`, one container per warm process so
> bench marks and the single-flight map outlive a request), `/healthz`, the two
> Vercel adapters in `api/`, `vercel.json`, and `scripts/probe.ts`. The package
> directory moved `api/` → `service/` because Vercel reserves a root `api/`;
> the package name `@kodama/api` did not move, so no import changed. 26 new
> tests (145 in the package): Upstash wire format and its failure containment,
> and `/healthz` asserting no token material and no summed budget.
>
> **Deployed and measured 2026-07-21.** Production on Hobby, Upstash Free in
> us-east-1, aliased to `kodama-sigma.vercel.app`. Probe passes every check:
> `/healthz` clean, five real logins rendering real trees, cold p95 2 161 ms
> against the 2 500 ms budget, and `MISS` → `HIT` byte-identical on the repeat
> request. Full table in OPS §4.
>
> Two deploy-only bugs were found and fixed on the way (D-032 addendum): the
> adapters used an export shape Vercel dispatches as the Node.js `(req, res)`
> signature, and the rewrite delivers the login as a query parameter rather
> than a path. Both were invisible to typecheck, lint and 145 passing tests.
>
> **4.5 is not closed.** Two acceptance items remain, both needing wall-clock
> time rather than code: the camo refresh check (D-025 residual - needs a
> README embed and a source change a day apart) and a cold p95 sample for an
> account under ten years, since every login in the first run was an old
> account. Tracked in OPS §4b.

## M5 - Site

**5.1** Astro scaffold, landing funnel (input → live img → picker → copy).
Accept: Playwright test of the funnel; works no-JS for the static parts
(img + snippet visible with default theme).

> **Done 2026-07-21** (D-033). Static Astro build; `vercel.json`'s
> `outputDirectory` moves from `public/` to `site/dist` and the staging
> placeholder is deleted. The picker's theme and scale lists come from
> `@kodama/engine`, and the username pattern and option defaults from
> `@kodama/api`, so the site cannot drift from what the route accepts. Nine
> Playwright tests, three of them with scripting disabled. `pnpm test` does not
> run them - browsers are a heavier dependency than the gate should carry - so
> they are `pnpm test:e2e`, and `playwright install chromium` is a prerequisite.
>
> Sharing the regex found a bug in it: browsers compile `pattern` with the `v`
> flag, where the unescaped `-` in `[a-zA-Z0-9-]` is a syntax error, and a
> `pattern` that fails to compile is **silently discarded** - the field was
> accepting every string. Fixed in `params.ts` with a test that compiles the
> source under `v` (D-033 addendum).
**5.2** `/api/<user>.json` (TreeFacts + history) with CORS; receipts page
`/tree/<user>` - hover/focus tooltips, keyboard + aria per SPEC-SERVICE §5.
Accept: axe-core scan clean; tooltip provenance matches TreeFacts in test.

> **Done 2026-07-21** (D-034, D-035). `receiptsFor(facts, locale)` is a new pure
> engine function bound to the renderer by the CSS classes it already emits, so
> the page matches classes to sentences and knows nothing about the grammar.
> The correspondence is asserted both directions against every fixture: a
> receipt with no element, or an accountable element with no receipt, fails.
>
> The JSON route deliberately breaks the 200-always rule - 400/404/503 for a
> `fetch()` caller that can only branch on a status - while a *stale* answer
> stays 200 with `stale: true`. `restorePath` grew a second URL shape rather
> than a second copy.
>
> The receipts page inlines the SVG instead of leaving it in an `<img>`, since
> an image is one opaque node and the page's entire job is letting each element
> answer for itself. Axe clean on both pages after darkening two borrowed
> palette values that miss AA as text (D-035 addendum). 25 engine + 16 service +
> 8 e2e tests added.
**5.3** Grammar page + gallery from gate artifacts.
Accept: Lighthouse ≥ 95 perf/a11y on all three pages.

> **Done 2026-07-21** (D-036, D-037). Lighthouse on the built site:
>
> | Page | Perf | A11y | Best practices | SEO |
> |---|---|---|---|---|
> | landing | 100 | 100 | 96 | 100 |
> | grammar | 100 | 100 | 100 | 100 |
> | gallery | 100 | 100 | 100 | 100 |
>
> `pnpm --filter @kodama/site lighthouse` against a preview; kept out of the
> e2e suite because a gate that takes a minute per page gets skipped.
>
> The grammar page is one specimen with thirteen rows pointing into it, not
> thirteen thumbnails - same binding as the receipts page, so a row can only
> light up an element the engine actually drew. The gallery emits its 24 images
> as files through a static endpoint rather than inlining them.
>
> Checking the gallery's claim to be showing the gate artifacts found that it
> is not, quite: M3.2's animation layer added a per-firefly `<g>` wrapper after
> Gate #1. Every drawn shape is identical, and `taste-gate.test.ts` now asserts
> that against all 24 approved images - a test designed to fail on any
> deliberate visual change, because that is a re-gate.
>
> Also closed here: `GET /<user>` → 302 `/tree/<user>`, the last unbuilt route
> in SPEC-SERVICE §1. It is a trailing *rewrite*, not a `redirects` rule, since
> redirects run before the filesystem check and would have swallowed `/gallery`
> and `/grammar` (D-037).

## M6 - Launch hardening

**6.1** Remaining themes (paper, sakura, yozakura, shore) → mini taste
pass (same checklist, 6 images each).
**6.2** Budget alerting (pool 70%, error-rate), runbook
`dev/OPS.md`: rate-limit incident, KV outage, camo change, rollback =
engine version pin. **6.3** README, LICENSE (MIT), CONTRIBUTING (theme PR
path with golden harness instructions), privacy paragraph. **6.4** Domain
cutover, `og` meta on site. Accept: all budgets re-measured on prod domain;
launch checklist in `dev/LAUNCH.md` fully checked except the human "post"
items.

## M7 - Memory tier (post-launch)

7.1 spirit (schema-provable triggers only, SPEC-ENGINE §3.6 rule),
7.2 plaques + earned-date computation, 7.3 visitors (fox/koi/crane) +
published rarity page, 7.4 dormancy/awakening + weather, seasonal events,
7.5 **TASTE GATE #2** with event-state fixtures (dormant, awakening,
streak-broken, anniversary). Receipts test: every event on the receipts
page shows its computable provenance.

## M8 - Share tier (post-launch)

8.1 `?date=` time travel (validation: not before createdAt, not future),
8.2 OG cards (`cards/` satori→resvg; SPIKE-SATORI for font/emoji edges),
8.3 rings recap, 8.4 grove (≤ 8 users, layout spec addendum first),
8.5 timelapse queue (last: heaviest infra, monthly per-user quota).

---

## Definition of done (v1 launch = M0-M6)

All SPEC budgets green in CI; failure-injection 100% 200-with-SVG; goldens
+ property suites green; Taste Gate #1 passed with artifacts committed;
staging probes committed; the manual steps done; `dev/LAUNCH.md`
checklist complete. Success criteria beyond launch tracked against PRD
(§Success criteria) at +7 d and +30 d.
