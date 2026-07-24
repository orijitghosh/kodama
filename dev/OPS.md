# OPS - cost sheet, budgets, runbook

Live document. Every milestone that changes the request flow updates the
numbers below; measured values replace modelled ones as soon as they exist
(staging probes land at step 4.5, per SPEC-SERVICE §6).

Status: **partly measured.** Written at step 4.0 to decide the KV provider; §4
carries the first production probe (2026-07-21), and §5-6 add the launch-time
alerting and runbook (M6.2). The cost projections in §2-3 remain modelled - the
origin-request fan-out cannot be measured before live README traffic (§4b).

---

## 1. KV provider decision (step 4.0, D-008 → D-027)

**Choice: Upstash Redis, provisioned through the Vercel Marketplace.**

The comparison the spec asked for no longer has two sides. Vercel KV has been
sunset as a first-party product; Vercel's own changelog says Upstash joined the
Marketplace with KV/Vector/QStash, that the integration "replaces Vercel KV",
and that existing stores migrate with no action required. So the live choice is
Upstash-through-Marketplace (unified billing, provisioning from the Vercel
dashboard) versus Upstash direct (own account, own invoice). Marketplace wins
on the manual steps: one account for Arijit to hold, one bill, and
`KV_REST_API_URL` / `KV_REST_API_TOKEN` injected into the project rather than
pasted by hand.

Plans, read off the pricing page 2026-07-21:

| Plan | Price | Storage | Commands | Bandwidth |
|---|---|---|---|---|
| Free | $0 | 256 MB | 500 K / month | 10 GB / month |
| Pay as You Go | $0.20 / 100 K commands | 100 GB | unlimited | unlimited |
| Fixed 250MB | $10 / month | 250 MB | unlimited | 50 GB / month |
| Vercel KV free (legacy, gone) | - | 256 MB | 30 K / day | - |

**The Fixed plan is the ceiling, and it is low.** Unlimited commands for $10
means pay-as-you-go stops being the cheaper option at 5 M commands/month
($0.20 × 50). Everything below is priced against whichever plan is cheaper at
that volume, not against PAYG throughout.

The port is `service/src/kv/index.ts` - `get` / `set(ttl)` / `del`, plus the three
key builders and their TTLs. Swapping provider means writing one file that
implements three methods; `MemoryKV` already does it in 60 lines. That is the
whole point of D-008, and it is why the decision above is worth ten minutes,
not a week.

### Provisioning (manual steps, due before step 4.5)

Steps 4.1-4.4 ran entirely against `MemoryKV`. The service now boots against a
real store when one is configured and falls back to the in-process cache with a
`/healthz` alert when one is not, so the order below is the deploy order.

0. **Project exists** - `vercel link` at the repo root, Root Directory `./`
   (not `./service`: the package resolves `@kodama/engine` through the pnpm
   workspace, which only exists from the root). Done 2026-07-21.
1. Vercel dashboard → the kodama project → **Storage** → **Marketplace** →
   Upstash → Redis. This creates the Upstash account as a Vercel-managed
   integration; do **not** sign up at upstash.com separately, or the store ends
   up on a second invoice with credentials to paste by hand.
2. Region: pick the one nearest the project's function region - `vercel.json`
   pins functions to `iad1`, so **us-east-1**. Redis is a cache here, so read
   replicas in other regions are money for nothing at this scale.
3. Plan: **Free** to start. Nothing in the launch-week projection exceeds it,
   and the upgrade is a dashboard toggle with no code change.
4. Connect it to the project. Vercel injects `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` into the environment; confirm they appear under Settings
   → Environment Variables. Both are secrets and never get committed, logged,
   or pasted into an issue.
5. Add `KODAMA_PATS` - comma-separated classic PATs, **no scopes** (public data
   only). Without it the service still boots and still answers `/healthz`; it
   just draws "come back soon" for every tree, and says why in `alerts`.
6. `vercel env pull` locally if a manual probe needs them.

**Verification, after the first deploy:** `/healthz` should report
`kv.kind: "upstash"`, `github.tokens` above zero, and an empty `alerts` array.
`kv.kind: "memory"` means step 4 did not take - the service is running on a
cache that dies with every cold start, which is a cost bug, not an outage, so
nothing else will look wrong.

Then `pnpm --filter @kodama/api probe <deployment-url>`, which asserts the four
claims §6 makes and cannot check locally: `/healthz` up and leaking no token
material, a real tree per login, `x-vercel-cache: HIT` on a repeat request, and
cold p95 inside budget.

Open question for step 4.5: whether the Marketplace path exposes the same Free
plan or starts at pay-as-you-go. Vercel's changelog promises no price change on
migration, which implies plan parity, but it is unverified and it is the only
thing standing between launch week and a $2 invoice - so it is cheap to be
wrong about.

## 2. What a request costs

Flow per SPEC-SERVICE §2. The CDN absorbs almost everything: `s-maxage=21600`
means an origin request per login per 6 h per edge region, and GitHub's camo
proxy sits in front of that as a second cache for README traffic.

**Freshness is a date, not a TTL** (D-030). The history entry lives 30 days and
carries its own `fetchedAt`; a read is served when `fetchedAt` is today and
triggers a refresh otherwise. That decouples "how long we keep it" from "how
often we refresh it", which is what makes serve-stale possible - and it means
exactly **one refresh per badge per UTC day**, whatever the CDN does above it.

Commands per origin request:

| Path | Commands | When |
|---|---|---|
| Same-day read | 1 (`GET h1`) | ~92% of origin requests |
| Daily refresh, closed years cached | 3 (`GET h1`, `SET h1`, `SET y` for the rolled-over year) | once per day |
| Cold user, 17 account years | ~19 (`GET h1`, 17 × `GET y` miss, `SET h1`, 16 × `SET y`) | once per user |

Modelled origin requests per badge per month: 30 d ÷ 6 h = 120 windows, times
~3 for edge-region and camo-region fan-out ≈ **360**, of which 30 are the
first-of-day that refreshes.

Commands per badge per month ≈ 330 × 1 + 30 × 3 ≈ **420**.

## 3. Projections

At ~420 commands per badge per month (D-030 halved this from ~900):

| Active badges | Commands / mo | Storage | Cheapest plan | Cost |
|---|---|---|---|---|
| 1 K | 0.4 M | ~8 MB | Free | $0 |
| 1.2 K | 0.5 M | ~10 MB | Free, at its limit | $0 |
| 5 K | 2.1 M | ~40 MB | Pay as You Go | $4.20 |
| 12 K | 5 M | ~96 MB | either (crossover) | $10 |
| 30 K | 12.6 M | ~240 MB | **Fixed 250MB**, storage-capped | $10 |
| 100 K | 42 M | ~800 MB | Fixed 1GB or larger | not modelled |

Storage assumes ~8 KB per user across `h1` + year keys - a *typical* account.
SPIKE-GRAPHQL measured a real whale at **20 KB** of NormalizedHistory (791
active weeks), 2.5× the SPEC-ENGINE §2 estimate, and a 19-year dormant account
at 6 KB. Whales are rare enough not to move the mean, but a badge population
that skews toward heavy committers would hit the 250 MB Fixed ceiling nearer
15 K badges than 30 K.

Three numbers to carry around:

- **Free covers ~1 200 active badges** (500 K commands ÷ 420). Enough for
  launch week and the month after, on the strength of D-030 alone.
- **$10/month covers everything up to ~30 K badges**, where the 250 MB storage
  ceiling binds first. Storage, not commands, is now the limit that arrives.
- Between 1.2 K and 12 K badges, pay-as-you-go is cheaper than the flat $10;
  above that, switch. One dashboard toggle, no code change.

Levers if the bill outruns the project, cheapest first. Note that on a Fixed
plan the first three buy headroom under the storage and bandwidth caps rather
than money - the money is already flat.

1. Raise `s-maxage` to 12 h. Halves origin traffic, halves the read count;
   costs badge freshness within a day, which nobody perceives.
2. Refresh every other day instead of daily - a one-line change to `isFresh`.
   Cuts the refresh third of the bill in half.
3. Shorten `HISTORY_TTL_S` from 30 d to 7 d. Frees storage for badges nobody
   has loaded in a week, at the cost of a colder long tail.
4. Serve the seedling/stale SVG on KV-budget exhaustion rather than paying.
   `guarded()` already makes a dead store behave like a cold one, so this is a
   configuration decision, not a code path.

Not a lever: dropping KV. Without it every cache miss is a GraphQL fetch
against a 5 000-points/hour token budget, and the PAT pool becomes the
bottleneck long before Upstash does. SPIKE-GRAPHQL priced that budget: a cold
fetch is 15-23 points, so **one account sustains roughly 250 cold fetches per
hour** - and per D-029 a second token only helps if it lives on a second
account. GitHub quota, not Upstash spend, is the first ceiling this project
will hit.

## 4. Staging probe - first measured run

`pnpm --filter @kodama/api probe https://kodama-sigma.vercel.app`, 2026-07-21,
production deployment on Hobby, functions pinned to `iad1`, Upstash Free in
us-east-1. **All probes passed.** Numbers below are measurements, not models.

`/healthz`: 200, `no-store`, two tokens, `kind: upstash`, no token material in
the body.

| Login | Cold ms | Bytes | % of 60 KB cap |
|---|---|---|---|
| sindresorhus | 2 151 | 55 101 | **91.8%** |
| defunkt | 1 423 | 17 170 | 28.6% |
| tj | 1 931 | 41 153 | 68.6% |
| kentcdodds | 2 161 | 30 692 | 51.2% |
| shadcn | 1 614 | 31 000 | 51.7% |

**Cold p95 2 161 ms against the 2 500 ms budget.** Inside it, with 14% of head
room and no retries in the sample. The two-phase fan-out holds up: `defunkt` is
a 2007 account and came back fastest of the five, which is the parallel year
windows doing exactly what SPIKE-GRAPHQL §4 predicted - wall clock tracks the
slowest branch, not account age.

**CDN: `MISS` then `HIT`, byte-identical.** The entire cost model in §2-3 rests
on this one line and it is now measured rather than assumed.

Two things this run did **not** establish, recorded so they are not mistaken
for settled:

- **The ≤ 1.5 s budget for accounts under ten years is untested.** Every login
  in the sample is an old account; the fastest was 1 423 ms and only one other
  came within 200 ms of the threshold. The young-account tier needs its own
  sample before SPEC-SERVICE §6 can claim it.
- **`sindresorhus` renders at 91.8% of the full-scale cap.** That is the
  tightest margin in the system and it is on the fixture shape most likely to
  grow. A denser account, or one more ornament class in M8, overruns it. The
  cap is asserted in tests against fixtures, so the failure would surface as a
  test break rather than a broken image - but it is 8% away, not comfortable.

## 4b. Still to be measured

- [ ] Real origin-request fan-out per badge - the ×3 in §2 is still a guess and
      remains the single biggest error bar in this document. Needs live README
      traffic, so it cannot close before launch.
- [x] Cold end-to-end p95 against 5 real logins (§4 above).
- [x] `x-vercel-cache: HIT` on second request (§4 above).
- [ ] Cold p95 for an account **under** ten years, target ≤ 1.5 s.
- [ ] Camo refresh latency against `Cache-Control` - the SPIKE-CAMO residual
      (D-025). Prepped at `dev/spikes/camo-probe/refresh/` (owner-run: see its
      `RUN.md`). No source change is needed after all - the SVG prints its render
      date in the header, so the origin bytes differ every UTC day on their own
      and the recorder reads camo's date against the origin's. Still wall-clock:
      two runs a day apart.

      Already established while prepping it, and it changes the target: **Vercel
      strips `s-maxage` and `stale-while-revalidate` from the downstream
      response.** What camo receives is `public, max-age=3600` with no `ETag`.
      The six-hour window in §2 is the Vercel edge's alone; camo is being asked
      for one hour and cannot revalidate conditionally.
- [ ] Vercel function invocation × duration cost at each projection tier, and
      the Cloudflare Workers port note alongside (SPEC-SERVICE §6).

## 5. Alerting

Written at M6.2. Two budgets are watched, both surfaced in the `/healthz`
`alerts` array - the "simple threshold" half of SPEC-SERVICE §3's "log drain or
simple threshold." `/healthz` is public, uncacheable, and 200-while-degraded, so
the alert mechanism is: **poll `/healthz`, page when `alerts` is non-empty.**
Any uptime checker that can assert on a JSON field does it; nothing bespoke to
run.

| Signal | Threshold | Source | What a firing means |
|---|---|---|---|
| PAT budget | 70% of a token's 5 000-point account budget consumed | `health.ts` `ALERT_AT_CONSUMED` | Approaching the GitHub ceiling; §3 lever 1-2 or a second **account** (D-029) |
| Token benched | a token is under `BENCH_FLOOR` (500) remaining and sat down until reset | pool telemetry | Transient if one token; an outage if all - `ok` goes false only when *every* token is benched |
| Image error rate | ≥ 25% of the last 100 renders degraded, min 20 samples | `health.ts` `ERROR_RATE_ALERT`, `meter.ts` | The one signal for the invisible failures - see below |
| KV cache kind | `kv.kind: "memory"` | container | Env var didn't take; running on a cache that dies each cold start (a cost bug, not an outage) |

**Why the error-rate meter exists.** The image route holds one invariant above
all others - every path returns 200 with a valid SVG (route.ts) - so a README
never shows a broken image. The cost of that invariant is that failure is
*invisible*: a drained pool, a GitHub outage, a dead KV are all served as a 200
"come back soon" seedling, and nothing in the status code, the CDN, or an uptime
checker goes red. The meter is the only place those 200'd failures are counted.
It rolls a window of the last 100 renders and reports the degraded fraction;
only `comeBack` (a fetch we could not complete) and `broken` (the engine threw)
count - a `notFound` or an invalid name is the user's, not ours, and must not
dilute the window. Scope is one warm instance; cross-instance truth is Vercel's
logs. A cold start begins an empty window, which is correct - a just-booted
process has no error history to report.

## 6. Runbook

Each entry: the alert that fires, how to confirm, the smallest fix, and the
rollback if the fix is wrong. All four map to a `/healthz` field, so triage
always starts the same way: **`curl https://<deployment>/healthz` and read
`alerts`.**

### 6.1 Rate-limit incident (PAT budget at 70%, or tokens benching)

- **Confirm:** `/healthz` → `github.pool[*].remaining` low, or `alerts` naming a
  benched token. `github.spent` climbing fast across a few polls means live
  load, not a stuck counter.
- **Fix, cheapest first** (these are §3's levers, applied live):
  1. Raise `s-maxage` to 12 h in `route.ts` `CACHE_OK` - halves origin traffic,
     halves the read/fetch count. Costs a day of badge freshness, which nobody
     perceives. Redeploy.
  2. Refresh every other day - a one-line change to `isFresh`. Cuts the refresh
     third of the fetch load.
  3. Add a PAT **on a different GitHub account** to `KODAMA_PATS`. A second token
     on the same account is theatre: GitHub limits per user, so it shares the one
     5 000-point budget and adds no capacity (D-029, SPIKE-GRAPHQL §3).
- **If it is already saturated:** the service degrades correctly on its own -
  every uncached login draws the seedling, no action needed to *stay up*. The
  above is to restore freshness, not to stop an outage. `curl -I` an uncached
  login and read `retry-after`: the seedling carries the seconds until the
  earliest-resetting token comes back, so it answers "how long is this" without a
  dashboard. A benched token returns on GitHub's own reset, read off
  `retry-after` / `x-ratelimit-reset` (SPEC-SERVICE §3), which is why a burst of
  403s during a spike does not cost the whole hour.
- **Rollback:** revert the `s-maxage`/`isFresh` change; freshness returns at the
  cost of the traffic. No data migration either way - both are cache-policy only.

### 6.2 KV outage (`kv.errors` climbing, or `kind: "memory"` unexpectedly)

- **Confirm:** `/healthz` → `kv.errors` rising with a `kv.lastError` string, or
  `kv.kind` reading `"memory"` on a deploy that should have Upstash.
- **What already happens:** `guarded()` makes a dead store behave like a cold one
  - every read misses, every write is dropped, and the service keeps drawing
  trees by fetching live (SPEC-SERVICE §2). The failure mode is **cost, not
  downtime**: more origin fetches against the PAT budget, so 6.1 can follow.
- **Fix:**
  - `kind: "memory"` on a real deploy → the Upstash env vars did not inject.
    Vercel dashboard → Storage → confirm the integration is connected and
    `KV_REST_API_URL` / `KV_REST_API_TOKEN` are present under Environment
    Variables, then redeploy (env changes need a new deployment to take).
  - `kv.errors` climbing with Upstash connected → check the Upstash console for
    an incident or a hit plan limit (Free is 500 K commands/month; §3). If
    quota, upgrade the plan - a dashboard toggle, no code change.
- **Rollback:** none needed; the degraded path is the safe one. Do **not**
  "fix" it by dropping KV - without the cache every miss is a GraphQL fetch, and
  the PAT pool becomes the bottleneck long before Upstash does (§3, "not a
  lever").

### 6.3 Camo behaviour change (badges stop refreshing, or refresh late)

- **Confirm:** run the recorder at `dev/spikes/camo-probe/refresh/` (its
  `RUN.md`) - it reads the date camo baked into the cached SVG against the
  origin's. A widening lag is camo holding bytes longer than expected.
- **Context (already established, M4.5):** Vercel strips `s-maxage` and
  `stale-while-revalidate` from the downstream response, so what camo receives is
  `public, max-age=3600`, no `ETag`. The 6 h window in §2 is the Vercel edge's
  alone; camo is asked for one hour and cannot revalidate conditionally. A camo
  change to that one-hour honouring is the risk this entry watches.
- **Fix:** the origin SVG prints its own render date in the header, so bytes
  differ every UTC day regardless of headers - camo's own cache expiry is the
  only lever we do not control. If camo lengthens it, there is no server-side
  fix; the mitigation is documentation (the badge updates "within a day," not
  "instantly"), which the PRD copy already reflects.
- **Rollback:** n/a - this is an upstream-behaviour incident, not a deploy.

### 6.4 Rollback = engine version pin

The service and engine version together as one deploy; a bad **render** (a
visual regression that shipped, an engine throw spiking the error rate) rolls
back by pinning the engine, not by reverting the whole service.

- **Confirm it is the engine:** error rate spiking with `x-kodama-state: broken`
  on live requests, or a visual regression a human catches. `taste-gate.test.ts`
  / `taste-gate-2.test.ts` should have caught a deliberate visual change before
  deploy - a regression reaching prod means a test gap, logged after.
- **Fix:** redeploy the previous good deployment from the Vercel dashboard
  (Deployments → the last green one → Promote to Production). Instant, no build.
- **Then:** pin the engine - `ENGINE_VERSION` in `route.js` is the marker the
  response carries (`x-kodama-engine`); the actual pin is the `@kodama/engine`
  version in `service/package.json`. Reverting the engine bump and rebuilding is
  the durable fix once the bad render is understood.
- **Rollback of the rollback:** the promoted-back deployment is itself a known
  good, so there is nothing to undo; re-promote forward once fixed.

---

Sources for §1: [Upstash joins the Vercel
Marketplace](https://vercel.com/changelog/upstash-joins-the-vercel-marketplace),
[Upstash Redis pricing](https://upstash.com/pricing/redis).
