# DECISIONS - why it is the way it is

Append-only log. Every entry: decision, alternatives rejected, why. New
architectural choices during implementation get an entry BEFORE the code.

## D-001 Hosted Vercel service, not an R package
Audience = all GitHub users. R runtime adds nothing; paste-a-URL (à la
github-readme-stats) is the proven zero-install channel. GitHub Action mode
deferred to Tier 4 as rate-limit pressure valve.

## D-002 Stateless: render(seed, history, date) is pure
Rejected: stored per-user growth state (allows one-off "storm survived"
events). Purity buys: trivial caching, byte-identical determinism tests,
free time travel (`?date=`), zero data-loss risk, trivial Workers port,
"your tree is recomputable - receipts" as product honesty. Cost: every
event must be derivable from public history + date; SPEC-ENGINE §3.6 rule
enforces this at design time.

## D-003 Name: kodama (gitgarden taken)
木霊, tree spirit; the mascot doubles as the milestone mechanic. Fallback
domains listed in PRD. Code prefix `kd`.

## D-004 Biome-generic engine vocabulary
Bonsai is renderer #1, not the architecture. Element vocabulary: masses /
ornaments / inhabitants / substrate. Reef and tapestry are future content
drops on the same NormalizedHistory. Cost now: slightly abstract naming.
Payoff: the re-viral update is content, not a rewrite.

## D-005 Level-stable skeleton, element-level monotonicity
Full pixel-monotonic growth under space colonization is not achievable
without stored state (contradicts D-002). Chosen: skeleton fixed per
(seed, maturity level); level-ups may re-pose branches; pads/ornaments
never decrease. Day-to-day = pixel-stable; level-up ≈ every ~40 growth
units = a visible "growth spurt" - reframed as a feature (announced in
alt-text: "the tree grew!").

## D-006 One SVG serves dark + light via prefers-color-scheme
Rejected: separate ?mode=dark URL as primary (kept as documented fallback
with #gh-dark-mode-only). One URL = one paste = simpler funnel. Risk: camo
strips media queries → SPIKE-CAMO verifies before commitment; if stripped,
flip default to dual-image pattern (site copy button emits both lines).

## D-007 Node runtime, not edge functions
GraphQL fan-out + satori need node APIs; latency is solved by CDN cache,
not compute placement. Simpler, one runtime everywhere.

## D-008 KV behind a 20-line interface
Vercel KV vs Upstash decided by free-tier math at implementation time; the
interface (`get/set/ttl`) makes the choice reversible in minutes.

## D-009 No accounts, no database, ever (v1 covenant)
KV is a cache; losing it costs one cold fetch per user. Everything else
follows: no auth surface, no GDPR data-subject store, no migration burden.
Site states it in one paragraph.

## D-010 Anti-gaming at fetch-time (caps) + render-time (log scaling)
Daily commit cap 30 at normalization; log2/log10 buckets at render. Grammar
deliberately over-weights breadth (reviews, merged PRs, longevity). The tree
should be a *better* signal than the green wall.

## D-011 System fonts only
Embedded fonts blow the 60 KB budget and add licensing + camo variables.
Monospace stack for numbers reads "terminal-native" - on-brand.

## D-012 Spike-first for undocumented platform behavior
Inherited from shinymotion (M3.10 pattern): GitHub camo and GraphQL field
realities are probed in live environments and findings committed to
`dev/spikes/` BEFORE dependent layers are built. A spike that invalidates a
spec section triggers a DECISIONS entry + spec edit, not a silent workaround.

## D-013 Validation splits: pure guard in engine, zod at the boundary
IMPLEMENTATION 0.2 asks for a zod schema for NormalizedHistory, but
SPEC-ENGINE §1 requires the engine to carry zero runtime dependencies. Both
hold if validation splits by role. `engine/src/validate.ts` is a
dependency-free structural guard exposing `assertHistoryV1` - it enforces the
§2 version gate (`v !== 1` throws `KodamaSchemaError`, which the API maps to
the seedling + cache purge) and shape-checks the fields the renderer indexes.
The zod schema lives in test land (`engine/test/history-schema.ts`) where it
does the fixture round-trip, and `service/` owns its own zod validation at M4 for
untrusted GraphQL and KV payloads. Rejected: zod inside the engine (breaks
zero-deps and the Workers-port story); no validation at all (a malformed KV
entry would surface as a broken image, violating "never a broken image").

## D-014 Date math is hand-rolled and civil-only
The engine is forbidden `new Date` (SPEC-ENGINE §1), so all calendar work -
day arithmetic, ISO weeks, leap years, season boundaries - lives in
`engine/src/date.ts`, operating on "YYYY-MM-DD" strings via the
days-from-civil algorithm. This is more than lint compliance: `Date` carries a
host timezone, and any leak of local time would break byte-identity across the
render fleet. Civil-date-only arithmetic makes the UTC discipline structural
rather than a code-review item.

## D-015 Weekly storage means weekly claims
SPEC-ENGINE §3.4/§3.5/§3.6 are written in daily terms - "commits last 7 days",
"mean over days 31-210", "milestone crossed within 72 h" - but the v1 schema
stores ISO-week sums, and only `streak` survives at daily resolution (it is
computed at fetch from the daily calendar). Rather than interpolate weekly sums
into fake daily numbers, every rule is restated at the resolution the data
actually has: shoots read the current ISO week (which is what the PRD's "I was
here this week" meant anyway), weather compares whole-week sums divided by real
day counts, and the spirit's commit milestones use the ISO week of the crossing
instead of a 72-hour clock. Plaque earned-dates resolve to the Monday of the
crossing week, and `prs100` reports `null` because v1 keeps only ten PRs and
the real date is genuinely unrecoverable.

Rejected: prorating weeks into days (invents precision the product promises it
never invents - "the tree never lies" is a load-bearing claim, and the receipts
layer would expose the fiction); adding daily arrays to the schema (a 10-year
account becomes ~3 650 entries, blowing the ~2 KB KV target for a gain that only
three rules would use). If a future rule genuinely needs days, that is a v2
schema change with its own entry, not a quiet interpolation.

## D-016 Growth units per level: 400, not 40
SPEC-ENGINE §3.2 specified `maturity = min(13, 3 + floor(gu / 40))`. Measured
against the committed fixtures this makes the ladder unusable: `gu` sums
`log2(1 + weekly commits)` over *every* week of an account's life, so a
two-year grinder scores ~644 and pins to level 13 alongside the ten-year whale
at ~4 243. Five of ten fixtures sat at the ceiling and nothing occupied levels
4-12.

At 400 the same fixtures spread across levels 3, 4, 5, 7 and 13, level 13 costs
roughly a decade of dense work, and the pot tiers (1/3/6/10 years) stay legible
against maturity rather than being the only visible age signal. A test asserts
the fixtures continue to span at least four distinct levels, so a future tuning
change cannot silently re-collapse the range. SPEC-ENGINE §3.2 is amended to
match.

## D-017 Pad count is derived from maturity, not observed from the skeleton
SPEC-ENGINE §3.3 said "pads: one per skeleton tip cluster". Measured over 400
seeds × 11 levels, that rule breaks D-005's monotonicity promise on **32.5%**
of level-ups, once dropping ten pads at a single step - a tree that visibly
sheds foliage by growing older, which contradicts the only thing the product
claims about growth. The same measurement showed the ladder was visually dead
anyway: median cluster counts ran 12 at level 3 and 20 at level 13, and the
per-level minimum was flat, so no monotone target curve could be drawn under it
without erasing growth entirely.

Pads are therefore `4 + maturity` - monotone by construction, 7 at level 3 and
17 at 13 - placed by farthest-point selection over the skeleton's tips. Tips
still determine *where* foliage sits (so the skeleton continues to shape the
tree, and pads land on real branch ends); maturity determines *how much*.
Farthest-point selection also spreads pads across the crown instead of letting
them clump where colonization densified, which serves TASTE §1.3's asymmetry
requirement better than clustering did. Where a rare seed colonizes into an
unbranched chain with too few tips, pads distribute along the branches instead,
so no tree renders as a stick.

Rejected: recomputing every lower level and taking a running maximum (correct,
but 11 colonizations per render - ~85 ms against a 30 ms budget); tuning growth
parameters until monotonicity held by luck (unfalsifiable, and one unlucky seed
is a user with a broken tree). SPEC-ENGINE §3.3 is amended to match.

## D-018 Trunk girth quantizes to whole years
SPEC-ENGINE §3.3 gives girth as `8 + 2.2·sqrt(accountYears · 4)` with
`accountYears` fractional. Girth sets the stroke width of *every* branch, so a
continuously varying age redrew the entire skeleton every single day by an
amount no eye can resolve - breaking the day-to-day pixel stability D-005
promises, and emitting fresh bytes for every date for no visible gain.

Girth now takes whole years. The structure holds still between birthdays, and
thickening becomes an annual beat that lands with the anniversary spirit
instead of leaking out invisibly across 365 days. This also sharpened the
stability contract: day-to-day identity applies to the skeleton and its stroke
widths, *not* to the whole document, because ornaments are supposed to move -
fruit ripening over three days is a deliberate daily change. The test asserts
branch-group identity across dates rather than whole-document identity.

## D-019 The crown grows with maturity, and leans per seed
Two visual failures showed up the first time fixtures were rendered side by
side. Maturity changed only the *density* of a fixed crown ellipse, so a
level-3 newcomer and a level-7 veteran drew silhouettes of the same size -
which defeats the readable-biography premise the whole product rests on. And
sampling one shared ellipse uniformly produced near-circular crowns, which
TASTE §2 lists as an instant gate failure.

The crown region now scales from 0.52 to 1.0 of its full extent across levels
3-13, anchored at its base so young trees sit low near the pot rather than
floating (this also shortens the trunk for free, since trunk growth stops once
the crown is in reach). Each seed additionally draws its own crown lean, tilt,
and a preferred heavy direction that foliage masses toward, so silhouettes are
asymmetric the way kept bonsai are. Both are pre-gate tuning, not a taste
verdict: Gate #1 remains the binding judgement.

## D-020 The palette grows to 17 slots: firefly, glow, snow
SPEC-ENGINE §4 specified 14 palette slots, but TASTE §3 had already specified
two colours with nowhere to live: `fireflies #e8d9a0 at 70% opacity` and
`lantern glow #e0a35c`. M2.2 drew both in `accent`, and the result was visible
the first time a fixture was rendered at 2×: a firefly in the accent colour is
indistinguishable from a small unripe fruit, because the accent *is* the fruit
family. Two elements the grammar means to say different things with were
saying the same thing.

`snow` is the third addition and could not be avoided by reuse at all.
Settled snow needs a pale value in *both* colour schemes, and every existing
pale slot (`textPrimary`, `bg`, `card`) inverts across the light/dark boundary
by design (D-006) - snow drawn in `textPrimary` is near-black on washi. A
scheme-invariant element needs a scheme-invariant slot.

Rejected: hard-coding the three hexes at their draw sites (breaks the "a theme
is data" rule that makes a new theme a data change rather than a code change);
deriving them from `accent` by lightening at render time (the arithmetic is
available, but it produces a colour no one chose, and TASTE had already chosen
one). SPEC-ENGINE §4 is amended to 17 slots and all seven palettes fill them.

## D-021 Season is a palette function, not a drawing rule
Seasonal colour is applied by emitting different foliage hexes for the same
shapes, in `paletteStyles(theme, season)`, rather than by teaching each draw
site what month it is. The renderer already knows the date, so a season is a
different set of custom properties on an unchanged drawing.

This keeps the seasonal look in one place instead of threading a `season`
argument through every element, and a future biome (D-004) inherits all four
seasons without writing any seasonal code. Only the three foliage slots move:
trunk, pot, text and ornaments hold still, so the tree stays recognisably the
same tree across a year - the season is weather, not a different plant.

The shift itself is defined as hue-lerp plus saturation and lightness
multipliers, quantised back to 8-bit hex per channel (`engine/src/color.ts`),
for the same reason the date maths is hand-rolled (D-014): these values are
emitted bytes, and two hosts must not disagree about a rounding mode. One
measured correction during tuning: autumn's saturation multiplier had to go to
1.75, because the reference foliage is deliberately desaturated and rotating a
near-grey green toward amber yields khaki rather than autumn.

## D-022 Grid ceiling and winter baring are enforced by proportion, not cutoff
Two mechanisms were changed to enforce a property directly instead of happening
to satisfy it - the same failure mode that let bugs pass count-based tests
earlier in this project.

The crown may not cross into the header (TASTE §4: y<80). A heavy-topped,
fully-grown crown could overshoot, because the per-seed lean bias reaches past
the bare ellipse. Rather than clip the apex flat (a hedge) or squeeze only the
vertical axis (which packs the attractor cloud into a band and doubled twig
density on the whale seed), the mapped cloud is scaled *uniformly* toward the
pot anchor when it would breach the line (`CROWN_CEIL`, `skeleton.ts`). A
similarity transform preserves point spacing, so the crown gets smaller and
lower without getting denser.

Winter baring (`bareBranchRatio`) now removes that exact *fraction* of the
finest eligible twigs, chosen by rank, rather than every twig under an absolute
share cutoff. The old cutoff bared a density-dependent share, so a re-posed or
denser crown could shed 90% of its branches and read as a dead tree; the
rank-based set keeps winter retention a fixed function of the ratio (~60% of
branches) for every tree, dense or sparse.

## D-023 The language tint is a hashed hue rotation, not a brand-colour table
`tint=lang` nudges the foliage hue by a fixed amount per top language, so a Rust
tree and a Go tree read as subtly different plants. Two choices worth recording.

It is a *rotation of the existing green*, capped at ±20° (IMPLEMENTATION 2.5),
not a repaint toward the language's brand colour. A Go tree tinted cyan or a
Rust tree tinted orange stops being foliage; a small rotation keeps it a tree
that happens to be *this developer's* tree. Only the three foliage slots move,
and the tint is folded into the same single shift as the season so the foliage
is quantised once (D-021's foliage-only rule, one hex round-trip).

The angle is a hash of the language name (`fnv1a32(name) mod 41 − 20`), not a
curated table. A table would need maintaining as languages appear and would
invite arguing over which hue each language "deserves"; a hash gives every
language a stable, distinct angle for free, and determinism is preserved because
the result is a whole number of degrees. Only the top language counts - blending
the top five produced a muddier, less legible signature in practice, and the
top language is the one a reader would name anyway.

## D-024 The legend names every symbol on the tree, not a fixed three
The card's legend was three fixed dots (foliage, fruit, blossom). Experienced
accounts draw far more - lanterns for reviews, a bird for closed issues,
fireflies for stars, a wind chime for discussions, shoots for the week, green
fruit for open PRs - and the fixed legend left all of them undocumented, so a
maintainer's richest symbols read as unexplained decoration.

The legend is now dynamic: one row per symbol actually present on that tree
(derived from `TreeFacts.ornaments`, so it matches what full scale draws),
each dot carried in the same palette slot the symbol is drawn in, so the key
reads off the picture rather than a separate table. Order is fixed (foliage,
fruit, lanterns, blossom, shoots, green fruit, bird, fireflies, wind chime) so
a busier account never reshuffles a quieter one, and the stack is bottom-aligned
above the pot (last row y≈388, 20 px pitch) so a one-line ghost and a nine-line
whale both sit as a quiet caption. Fireflies are night-theme only, matching the
draw. Transient/ambient marks (falling petals, soil petal ring) stay off the
legend - they are events and milestones, not a stat with a running count.

This deliberately relaxes TASTE §4's "three legend dots" to "the legend dots":
the constraint that matters is *key, not chart* - flat dots + quiet text, no
boxes, no bars, no numbers - and that holds at nine rows as at one. Presence is
asserted as a property (label shown iff symbol drawn) across every fixture, so
the legend can never drift from the grammar it captions.

## D-025 The badge must be served from a third-party host to be camo-proxied
SPIKE-CAMO (dev/spikes/SPIKE-CAMO.md) established that GitHub only routes
*third-party* README image hosts through its camo proxy; a first-party
`*.githubusercontent.com` URL (including `raw.githubusercontent.com`) is served
direct, bypassing camo. The initial probe used raw URLs, found zero camo URLs,
and taught us this the hard way; re-hosting the same SVGs through jsDelivr (a
third-party CDN) produced the camo path.

kodama's production badge is served from Vercel, a third-party host, so it is
camo-proxied - the path the spike reproduced and cleared (camo is a verbatim
byte proxy: bytes, content-type, animation, and `prefers-color-scheme` all
survive; see D-006, M3.2). The consequence to hold onto: never document or
suggest serving a kodama badge from a GitHub-owned domain as a "shortcut" - it
would silently take a different, un-proxied path than the one we validated, and
would leak the viewer's IP to our host rather than hiding it behind camo.

The remaining camo unknown is cache freshness over time, which is a host-tuning
matter (Vercel `Cache-Control`), deferred to M4.5 against the real deployment,
not a rendering blocker.

## D-026 The animation layer is static CSS on per-item groups, full scale only
M3.2 adds motion (SPEC-ENGINE §6, TASTE §6): foliage sway, falling petals,
falling snow, firefly drift - and nothing else moves. Four choices, each with a
rejected alternative.

**Static, class-based CSS - not per-element or SMIL.** The whole stylesheet
(`engine/src/animate.ts`) is constant text: the sway pivots every pad about the
fixed trunk base (`BASE_X,BASE_Y`), and periods/phases are hard-coded, so the
emitted `<style>` bytes are identical for every tree and add nothing to the
determinism surface. Rules bite by class (`.kd-pad`, `.kd-petal`, `.kd-flake`,
`.kd-firefly`), so the same block sits harmlessly on a ghost (which has only
pads) and a whale (which has all four). SMIL was the alternative the spike also
cleared, but CSS keyframes desync by period without per-node timing attributes,
and one static string beats N animated nodes for both bytes and review.

**Each moving thing is wrapped in its own group.** Petals, flakes and fireflies
are now emitted inside a per-item `<g class>` (the firefly's glow and core in
one group so they wander together; the petal's tilt kept on the inner ellipse so
the fall translate composes with it rather than overwriting its `transform`).
This changed the *static* output too - the wrappers exist even with animation
off - so all 48 static goldens were regenerated. Accepted over a two-path
(static vs. animated) geometry, which would have doubled the determinism
argument to save a few bytes.

**Off is a clean strip.** `animate=off` appends nothing, so a static card is
byte-identical to one from an engine with no animation layer at all; the 48
static goldens are exactly the `animate=off` set. Asserted in the render tests.

**Full scale only.** At compact/strip/button the tree is under half size and
drifting dots read as speckle, not weather (the same reason fireflies were
already full-scale only). Motion is gated on `scale==="full"`; the small scales
never emit the block.

Guardrails, both asserted: no cycle runs faster than 3 s (WCAG 2.3.1 flash
ceiling, with margin - durations are 4-9 s), and
`@media(prefers-reduced-motion:reduce)` sets `animation:none` on all four
classes. Animate goldens: 6 fixtures × 2 themes at the summer date (12), pinning
that each fixture's own layers compose with the shared block.

## D-027 Upstash Redis via the Vercel Marketplace is the KV store
D-008 deferred the pick to free-tier math; the math is in `dev/OPS.md` §1-3.
The comparison turned out to be one-sided: Vercel KV has been sunset as a
first-party product and Vercel's changelog names the Marketplace Upstash
integration as its replacement, with existing stores migrating automatically.
So the real choice was Marketplace-provisioned versus Upstash-direct, and
Marketplace wins on the manual steps - one account, one bill, credentials
injected into the project instead of pasted.

Two consequences worth stating, because both are load-bearing.

**The history TTL is deliberately four times the CDN window** (24 h against
`s-maxage=21600`). Equal values expire the two caches together, making almost
every origin request a KV miss as well, and a miss costs a GraphQL round trip
plus ~7 commands instead of 1. Daily freshness is also the finest granularity
the engine has - `date` is a UTC day - so nothing is lost.

**A dead store degrades to a cold one, never to an error.** `guarded()` turns
every KV rejection into a miss and increments a counter for `/healthz`. This is
D-009 in code: KV is a cache, losing it costs one fetch per user, and an image
that fails to render is the one outcome the product forbids.

The free tier covers roughly 550 active badges (500 K commands/month at ~900
per badge), so paying starts early and small - about $17/month at 10 K badges.
Levers are listed in OPS.md §3, cheapest first; dropping KV is not among them,
because the PAT pool becomes the bottleneck long before Upstash does.

## D-028 The contribution calendar is the activity source, capped per day
Step 4.1 had to answer what `totals.commits` counts. The draft query asked for
`totalCommitContributions`, but that counter is per contributions-collection
window and, more importantly, cannot be capped: SPEC-ENGINE §3.1 caps *days* at
30 before summation, and only the calendar has days. So the lifetime activity
number is `Σ min(30, calendar day count)` over the stitched calendar, and the
three `total*Contributions` counters are gone from the query.

The honest caveat: a calendar day counts commits, PRs, issues and reviews
together, so `totals.commits` is "capped daily activity", not commits alone.
The name is kept because NormalizedHistory v1 freezes at M4 and the grammar
reads it as an activity magnitude, not as a commit ledger. The receipts page
says what it is. The alternative - a second per-year query shape for real
commit counts - doubles the rate-limit cost of every cold fetch to sharpen a
number the tree only ever log-scales.

**An empty today does not break a streak.** The cache refreshes on a 6 h
window, so a fetch shortly after midnight UTC sees a day with nothing in it;
counting that as a break would report every streak broken every morning and
un-break it by lunchtime. Two empty days do break it. This matches GitHub's own
profile behaviour.

**Language shares are of all bytes counted, not of the top five.** A polyglot's
five shares sum to well under 1, which is true and which `tint=lang` reads as
"no dominant language". Shares are floored to four decimals so the schema's
`sum <= 1` invariant cannot lose to float drift.

## D-029 The PAT pool needs one token per account; the fetch goes parallel
SPIKE-GRAPHQL (2026-07-21) measured three things the spec had guessed, and two
of the guesses were wrong.

**Rate limit is per user, not per token.** Two PATs on one account share one
5 000-point budget - measured by spending with token A and watching token B's
`remaining` fall. SPEC-SERVICE §3's round-robin pool assumed independent
budgets; on a single account it rotates over one pool and buys nothing. The
pool code stays, because tokens on *different* accounts are genuinely
independent, but `KODAMA_PATS` now means one token per account and `/healthz`
reports per-account budgets rather than a sum that would claim capacity that
does not exist. Rejected: dropping the pool. It is ~40 lines and it is the only
thing standing between a rate-limit incident and an outage.

**Cost is flat at 1 point per query regardless of shape**, so quota constrains
round trips, not payload. That inverts the usual instinct: the cold fetch is
now four parallel queries instead of one fat document, spending three extra
points out of 5 000 to turn a sum of latencies into a max. Sequential year
fetching measured 16 s on a 17-year account; the same windows in parallel, 1.6
s. Languages move to the top 25 repositories rather than 100 - 2 561 ms to
918 ms for a mix that is, by stars, the same list.

**The 1.5 s cold budget was not reachable and is amended** to 2.5 s p95 beyond
ten account years. After parallelizing, a whale models at ~1.8 s, of which
almost everything is GitHub's own response time. Handled as the standing
constraint requires - fix the spec in the same commit, with the measurement
attached - rather than carrying a budget we would quietly miss at 4.5. Cold is
once per user per day; the CDN and KV serve everything else.

Incidental: a whale's NormalizedHistory is ~20 KB, not the ~8 KB SPEC-ENGINE §2
estimated (791 active weeks). OPS.md storage projections updated.

## D-030 One history key, freshness by date, not by expiry
SPEC-SERVICE §2 gave KV two keys: `h1:<login>` on a 6 h TTL and `s:<login>`
holding a `{ lastGoodAt }` marker to enable serve-stale. Building 4.3 showed
the pair cannot do its job. The marker holds no history, and the history
expires on schedule - so at the moment GitHub fails, the thing we promised to
serve stale has usually just been evicted. Two keys, two writes, and no stale
path.

Collapsed to one key. `h1:<login>` holds the history for 30 days and carries
its own `fetchedAt`; freshness is `fetchedAt >= today` rather than "the store
still has it". A same-day read serves immediately, an older read triggers a
refresh, and a refresh that fails serves what is already in hand - which is
what serve-stale was always supposed to mean. One key, one read on the happy
path, one fewer write on the refresh path, and `dev/OPS.md` drops from ~900
commands per badge per month to ~400.

The cost is storage: a 30-day retention holds entries for badges nobody has
loaded in a month. At ~8 KB each that is the cheap side of the trade, and the
Fixed plan's 250 MB still covers ~30 K badges.

Also settled here: **languages come from the top 25 repositories, stars from
the top 100.** They are separate queries because the language fan-out at 100
repos costs 2 561 ms and becomes the critical path, while at 25 it costs
918 ms and hides under the year queries. Measured on the recorded fixtures,
the top 25 hold 84-95% of a heavy user's stars - but stars keep the wider net
anyway, because that query is 1 122 ms and also hides under the years. Free
accuracy is worth taking; expensive accuracy is not. The two responses are
reassembled into the single-document shape the normalizer is written against,
with the language nodes given zero stars so the top repos are not counted
twice.

## D-031 Failures cache softly, and the renderer is an injectable seam
Two small choices from building the route (4.4), both about the error table.

**A failure caches for five minutes, a tree for six hours.** SPEC-SERVICE §2
gave every image route one `Cache-Control`. Applied to the error states that
freezes a mistake into every CDN edge for six hours: a user who typos their
name, fixes the README, and reloads would still see "no seed here" until
lunchtime - and an outage that ends in ten minutes would keep serving seedlings
long after GitHub recovered. Errors and stale trees now get
`s-maxage=300`. The happy path is unchanged, which is where the cache economics
actually live (that request is 92% of origin traffic).

**The renderer is injectable, for tests only.** The spec requires the
"engine throw" row to return a designed SVG, and the honest way to test it is
to make the renderer throw. The alternative - contriving a history poisonous
enough to crash the engine - was tried first and failed: the engine survived
the malformed week label, which is a credit to it and useless as a test. That
test would have pinned the suite to whichever bug happened to exist today
rather than to the behaviour the spec asks for, which is that a throwing
renderer still leaves a picture in the README.

Also settled: error states are drawn in the engine's own theme system, which
meant exporting `paletteStyles`, `slot` and `svgDocument` from the engine. An
empty pot has to look like it belongs to the same product as a tree, and
dual-scheme theming was not worth reimplementing across the package boundary.

## D-032 The package directory is `service/`, because Vercel owns `api/`
Vercel's zero-config build treats every file under a root `api/` directory as
a serverless function - "having five files inside `api/` would create five
Vercel Functions". The workspace package was also called `api/`, so a deploy
would have compiled `api/src/route.ts`, `api/test/*.test.ts` and
`api/scripts/spike-graphql.ts` into ~20 public endpoints, blown the 12-function
Hobby ceiling, and put the spike runners on a URL.

The escape hatch exists - defining `builds` in `vercel.json` disables
zero-config entirely - and was rejected. `builds` is legacy, it is mutually
exclusive with the `functions` property that sets `maxDuration` and region, and
it makes Build Settings ignored, which means `pnpm -r build` never runs and the
workspace `dist/` the entrypoint imports would not exist. Three permanent
constraints to dodge one directory name.

So the directory moved and the **package name did not**: it is still
`@kodama/api`, so no import in the codebase changed. `service/` is now two thin
adapter files that read the container and call into the package. The rule that
falls out: `service/` holds host adapters and nothing else, and anything with logic
in it belongs one level down.

Two things surfaced while wiring it up:

**An empty `KODAMA_PATS` no longer throws at construction.** `PatPool` refused
to exist without a token, which turned a misconfigured environment variable
into a crash during boot - taking `/healthz` down with it, the one endpoint
that could have said why. `acquire()` on an empty pool already threw
`PoolExhaustedError`, and the error table already maps that to "come back
soon", so the constructor guard was subtracting a diagnosis and adding nothing.
The test that pinned the old behaviour now pins the new one.

**`/healthz` reports per-token budgets and never a sum.** Restating D-029 as a
property of the endpoint: two tokens on one account share one 5 000-point
budget, so an aggregate reads as capacity that does not exist and would hide
exhaustion until it happened. A test asserts the summed number is absent from
the body, alongside one asserting no token material is.

### D-032 addendum - what the first staging deploy taught

Two bugs, neither visible locally, both in the eight lines of adapter code.

**Vercel picks the handler signature by the shape of the export.** A bare
`export default function handler(request: Request)` is dispatched as a Node.js
`(request, response)` handler: it receives an `IncomingMessage` whose `url` is
a bare path, and the `Response` it returns is discarded, so the invocation
hangs until it fails. `/healthz` answered 5xx for exactly this reason. The Web
signature is selected by exporting an object with a `fetch` method -
`export default { fetch(request) {...} }` - which the docs state and which no
type system checks, since both shapes are valid TypeScript. Now asserted in
`test/adapters.test.ts`, which also proves the adapters' import specifier
resolves against the built package: the other way a deploy dies with no local
signal.

**A rewrite moves the path into the query string.** `vercel.json` rewrites
`/<user>.svg` to the function, and the named segment arrives as `?user=`, not
as a path. `loginFromPath` correctly refused it, which would have drawn "no
seed here" for every user on the internet - a total outage that returns 200 and
looks like a design decision. `restorePath` in `params.ts` puts the path back
before the route sees it, so the route keeps a single URL contract and the
rewrite stays a deployment detail. The login is re-encoded on the way in, so a
separator smuggled through the query cannot become one in the pathname.

The general lesson, and the reason the adapter test exists despite the adapters
being three lines each: **the deployment boundary is untested code by default,
and it is the one layer where being wrong costs a full outage.** Thin does not
mean safe. It means the bugs there are all in the seams, where nothing local
looks at them.

## D-033 The site is static, and shares the API's own constants

Step 5.1. The landing funnel is a build-time HTML page (Astro, `output:
"static"`) whose only live element is an `<img>` pointing at the real service.
No SSR, no adapter, no second runtime to operate. Two consequences are worth
stating because they were choices, not defaults.

**The preview is the product, not a mock.** The image on the landing page is a
real request to `/<user>.svg` on the real origin, so the funnel exercises the
same CDN path a README does - and a regression in the service is visible on the
home page rather than only in a probe. The cost is that the page is useless
offline, which is the correct trade for a page whose entire job is to show
someone their own tree.

**No-JS is a real target, not a courtesy.** With scripting off the visitor still
gets a rendered tree and a pasteable markdown line for the demo account, plus a
`<noscript>` block spelling the URL grammar. Only the picker needs a bundle.
That is the whole product minus the convenience, which is the right split for
something whose output is an `<img>` tag.

**The site imports `LOGIN_PATTERN` and `OPTION_DEFAULTS` from `@kodama/api`**
rather than restating them. The username field validates against the exact
regex the route refuses on, and the snippet omits an option precisely when the
parser would have defaulted it. Both are build-time imports, so nothing from
the service graph reaches the client bundle. `parseOptions(new URLSearchParams())
=== OPTION_DEFAULTS` is asserted in the service, because a defaults table that
drifts from the parser would silently rewrite every badge the site emits.

`vercel.json`'s `outputDirectory` moves from `public/` to `site/dist`, and the
staging placeholder at `public/index.html` is deleted - the site is the index
now.

### D-033 addendum - the `pattern` attribute compiles under `v`

Sharing the regex found a bug in the regex. `LOGIN_PATTERN` was
`^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$` - valid JavaScript, and valid in an HTML
`pattern` attribute right up until the browser compiles it. **Browsers compile
`pattern` with the `v` flag, where an unescaped trailing `-` in a character
class is a syntax error.** A `pattern` that fails to compile is not reported: no
console warning, no validation failure, nothing. The browser drops the
constraint and the field accepts every string.

The fix is one backslash - `[a-zA-Z0-9\-]`, identical in meaning under every
flag - but the class of bug is worth the entry. It only appeared because the
constraint was shared between two runtimes with different regex dialects, and it
failed in the direction that looks like success. `service/test/params.test.ts`
now asserts the source compiles under `v` and matches the same set of logins
there as it does here; the funnel suite asserts a bad name is refused before any
request is made, which is what the silence was costing.

## D-034 The JSON route answers with status codes; the image route never will

Step 5.2. `GET /<user>.svg` returns 200 for every failure, drawn - SPEC-SERVICE
§4 - because its consumer is a README `<img>` and a 404 there is a broken-image
icon on somebody's profile. `GET /api/<user>.json` does the opposite: 400 for a
login GitHub could not issue, 404 for an account that does not exist, 503 when
upstream is down.

Not an inconsistency. The 200-always rule is a workaround for a consumer that
cannot read a status code, and it costs something real - the image route has to
encode "no such user" *in a picture*, and a caller cannot distinguish it from a
tree without OCR. A `fetch()` caller has status codes, so paying that cost again
would be paying for nothing. A JSON 200 that means "this user does not exist" is
the same lie, without the excuse.

One case stays 200: a **stale** answer. GitHub failed, KV had an older copy, and
an older copy is a real history - the body says `stale: true` and the response
caches softly. Failure and staleness are different things and only one of them
is an error.

CORS is `*` and unconditional. Everything in the body is already public: the
figures GitHub prints on the profile page, plus arithmetic. An origin allowlist
would protect nothing and would break the only interesting use - somebody
rendering their own tree's receipts on their own site.

The `.json` shape reuses `restorePath`, which grew a second URL shape rather
than a second copy: `restorePath(url, "json")` rebuilds `/api/<user>.json` the
way the `"svg"` case rebuilds `/<user>.svg`. Same rewrite hazard, same fix, one
implementation - and the same test asserting a login smuggled through `?user=`
cannot become a path separator.

## D-035 Receipts are computed in the engine, not written on the page

The receipts layer is the project's answer to "this is generated nonsense with a
nice coat of paint" (PRD §Receipts layer). That answer is only worth anything if
it cannot drift from the drawing, so `receiptsFor(facts, locale)` lives in the
engine beside `render`, derives from the same `TreeFacts`, and is pure.

The binding between the two is the **CSS class the renderer already emits**. A
receipt's `target` is `kd-fruits`, `kd-lanterns`, `kd-bird`; the page queries the
inlined SVG with it. That makes the class list a contract rather than an
implementation detail - renaming one now breaks a test instead of quietly
emptying a page - and it means the page holds no knowledge of the grammar at
all. It matches classes to sentences and draws neither.

The property that makes this honest runs both ways, and both are asserted
against every fixture: **a receipt exists exactly when its element is drawn.** A
receipt with no element is a claim about a picture nobody is looking at; an
accountable element with no receipt is the unfalsifiable decoration the whole
layer exists to forbid. Structural groups carry no receipt and are listed
explicitly, so the exemption is a decision rather than an oversight.

The site's Playwright suite stubs the API with output from the **engine itself**
- `render`, `treeFacts` and `receiptsFor` on one fixture - rather than
hand-written JSON. A hand-written stub would let a class rename pass green,
which is precisely the failure the class-as-contract is there to catch.

### D-035 addendum - the palette needed darkening for text

Axe found the site's borrowed colours failing AA: the `paper` theme's accent
(`#b5613a`) reaches 3.5:1 on the card background and its secondary text
(`#6a6d64`) 4.2:1. Both are fine as shapes inside a drawing and neither is fine
as a link or a sentence. The site now uses `#8f4526` and `#5f6259`, measured
rather than chosen, with the scan asserting it on both pages. The engine's
palettes are untouched - a colour that works as foliage is not thereby a colour
that works as prose.

## D-036 The grammar page is a live legend, not a table of thumbnails

Step 5.3. PRD asks for "the mapping table, rendered pretty, with a live example
tree per row" - thirteen rows, so thirteen images. That reading was rejected.
Thirteen trees on one page is a third of a megabyte, thirteen chances for the
reader to lose the thread, and thirteen pictures each showing one signal
surrounded by twelve distractions.

Instead there is **one specimen and thirteen rows that point into it**. The
maintainer fixture is the only one carrying nearly every Tier-1 signal at once -
lanterns, bird, chime, fruit, blossom, shoots - so hovering or focusing a row
highlights that element on the tree everyone is already looking at. The
comparison the page wants to make ("this shape means that number") is between a
row and a part of a picture, not between pictures.

It is the same interaction as the receipts page, on the same binding: rows carry
the engine's own receipt classes, and a row can only be made interactive if the
specimen actually drew that element. Rows for signals the specimen lacks are
still listed and simply do not light up, marked with a dot so the difference is
visible rather than mysterious.

The gallery goes the other way - twenty-four full trees - and so its images are
emitted as **files** by an Astro static endpoint rather than inlined, one per
fixture × theme × season. Lazy, separately cacheable, and the HTML stays small.
That is the difference between meeting the Lighthouse budget in SPEC-SERVICE §6
and arguing about it.

### D-036 addendum - the gate artifacts and what ships have diverged

TASTE §5 says the gallery reuses the taste-gate artifacts. It re-renders them
instead: `dev/` is excluded from the deployment upload, and a gallery should
show what currently ships rather than a snapshot of what once did.

Checking that those were the same thing found they are not, quite. Since Gate #1
the animation layer (M3.2) wraps each firefly in its own `<g class="kd-firefly">`
so it can drift independently. **Every drawn shape, coordinate and colour is
identical** - the delta is exactly that wrapper, on 2 of 24 images, and the
comparison that proves it is now `engine/test/taste-gate.test.ts`.

That test is deliberately unlike the goldens. Goldens pin today's output against
yesterday's to catch accidents. This one pins today's output against **a human
decision**, and it is *meant* to fail when the drawing changes: a failure is a
re-gate request, not a bug report. The escape hatch is written in the failure
message - re-render the artifacts, walk TASTE §5 again, commit both.

Along the way the engine's `package.json` was found to export `./fixtures` at
`./dist/fixtures/index.js`, a path nothing has ever built. It now exports the
fixture JSON that actually exists, which is what the gallery imports.

## D-037 The bare-login redirect is a rewrite, not a redirect rule

`GET /<user>` → 302 `/tree/<user>` (SPEC-SERVICE §1) is what makes a pasted
`kodama.dev/octocat` land somewhere instead of 404ing.

The obvious implementation is a `redirects` entry in `vercel.json` matching
`/:user`. It is also wrong: **redirects are evaluated before the filesystem
check**, so `/gallery` and `/grammar` would both be swallowed and sent to
`/tree/gallery`. Rewrites run *after* the filesystem, so a catch-all rewrite as
the last rule only ever sees paths that matched no file - which is exactly the
set of paths that might be a username.

Belt and braces on top of that: the `bare` route shape refuses any segment
containing a dot, so a missing `/favicon.ico` cannot be read as a login, and a
non-login 404s rather than redirecting. This route is allowed to 404 for the
same reason the JSON route is (D-034) - there is no `<img>` on the other end.

## D-038 Crown = commits, age = trunk; the floor crown for a long-but-light account stays

A class of real account surfaced the question at launch prep: an established
account (multiple years old) with a modest commit total spread thinly across
its life renders at maturity 3 - the floor - with the same crown size as the
few-dozen-commit newcomer fixture. Investigated (the fixture ladder plus one
such live account modelled) before deciding.

The render is correct, and it is kept as-is. Age and volume are *separate* axes
by design (PRD): account age drives trunk girth and pot tier, commit volume
drives the crown. A seven-year account gets the same trunk girth (~19.6) and
antique pot as the maintainer fixture of the same age - so it reads as an old
tree, not a newcomer. Its crown is small only because a few hundred commits over
seven years is genuinely light activity (a couple a week), and `crownScaleFor(3)`
seats a small crown low on a short trunk: a short, thick, lightly-tended bonsai,
which is truthful and on-aesthetic rather than broken.

Rejected for launch: lowering `GU_PER_LEVEL`. It does not even help - such an
account's growth total (from `Σ log2(1+commits_per_week)`) sits below a single
level-band whether the band is 400, 300 or 250 wide, so it stays at level 3
regardless. The only lever that would lift long-but-light accounts is a
total-volume term (e.g. `√totalCommits`) folded into `growthUnits`, which lifts
every fixture and so forces a full re-gate of Taste Gate #1. Not worth
re-gating the whole ladder days before launch to make one tree a level bushier.
Deferred as a clean post-launch follow-up if the reading ever grates.

The one adjacent fix that did ship: the 88×31 button sliced the login to ten
characters flat (`orijitghos`), now fitted at font-size 7 with an ellipsis past
twelve - a pure fit bug, no ladder involved.

## D-039 A pinned `date=` moves the calendar, never the counts

The badge draws today: streaks, dormancy, the season and the shoots are all
read against the current date, so an account with a quiet fortnight shows a
quiet fortnight. That is the point, and it is also why the README of this
project could not use a live badge of my own account as its illustration - the
first thing a visitor saw was "0 day streak", which describes one person's
month rather than what the grammar can draw.

Two changes, deliberately separate.

The README now shows `/specimen/maintainer-ink-summer.svg`: the maintainer
fixture at high summer, captioned as a specimen. That path already existed for
the gallery (D-036's file-per-image split), so the illustration costs no new
asset and cannot drift from what the gallery shows. It is a demonstration, and
it says so. Nothing about a real account is claimed.

The service gains `?date=YYYY-MM-DD`, which pins the day the engine renders
against. The history is untouched - the fetch still asks for today, so the
counts are current - and only the calendar moves. That keeps the parameter
honest in the way that matters: it cannot invent a commit, a review or a star,
because those numbers come from GitHub either way. What it can do is show the
tree as it stood on a past day, which is what a "how did this look in March"
question wants.

Its limits are the interesting part. A future date is refused (the history
stops today, so a future render would draw a dormancy that has not happened).
The date is validated by the engine's own `isValidDate`, so an impossible day
is rejected rather than rolled forward into a day that looks accepted. And the
rendered header prints the pinned date next to the login, so an image drawn for
March never presents itself as today's - a reader can always see which day they
are looking at.

The honest cost: a pinned date in someone's profile README is a badge that no
longer redraws daily, which is the one promise the product makes on its face.
The parameter does not hide that (the date is on the image), but nothing stops
it either. Accepted, because the alternative is a service that cannot answer
"what did this look like last spring" at all.

## D-040 Who may spend the budget, decided before the budget is spent

Every defence built so far acts after a query is already in flight. The pool
benches a token GitHub refused (D-029, f39f0c1), the CDN and KV make the steady
state nearly free (D-030), serve-stale keeps a badge drawing through an outage,
and the "come back soon" seedling makes even total failure a picture. Nothing
decided who was *allowed* to spend the quota in the first place, and the PRD had
asked for that twice - "per-IP cache-miss limits" in §Architecture, "per-IP miss
caps" in §Risks. It was the last unbuilt line of the launch cost model.

The hole is cheap to walk through, which is what makes it worth closing before
anyone links a badge widely. A login that does not exist still costs a GraphQL
query; names are free to invent; an account's budget is 5 000 points an hour and
one token per account (D-029). So a few thousand requests for names nobody has
registered drains the hour, and every *uncached* badge in the world degrades to
the seedling until it resets. No malice required - a crawler walking a wordlist
does it by accident.

Two keys close it, and the split matters.

**`n1:<login>`, six hours.** A negative cache for logins GitHub answered
`NOT_FOUND` for. It is consulted only when nothing is cached: a login we hold a
history for has existed, so a rename or a deletion must reach the stale path and
keep drawing the tree we have, rather than being burned in as a miss. Six hours
is short enough that someone registering the name today sees their tree the same
afternoon.

**`c1:<hash>:<hour>`, forty cold fetches.** The cap. Charged *inside* the single
flight and *after* both caches, so three things are free by construction: a warm
badge, a request that only waits on someone else's fetch, and a client the
runtime gives us no way to name. Forty is sized against the honest heavy user -
browsing the gallery and pasting a few logins costs single digits - and leaves
room for an office behind one address while holding a single source under 1% of
the hour.

Three properties are load-bearing, and each one is a test.

**It fails open.** `incr` returns 0 when the store could not answer, 0 is never a
real count, and the guard reads it as "unknown" and allows the request. A cache
outage must not turn into a refusal; that would convert a degraded service into a
broken one, which is the trade the whole error-SVG table exists to refuse.

**It keeps no address.** The counter is keyed by a 32-bit hash of the first
`x-forwarded-for` hop. PRD §Privacy allows an abuse counter and nothing more, and
a counter does not need to know who it counts. That the header is spoofable is
accepted: the cap is against the cheap accidental drain, not against someone who
has decided to rotate addresses. The expensive attacker is what Action mode
(Tier 4) answers.

**A refusal is still a picture.** Over the cap the image route returns 200 with
the seedling and a `retry-after` to the top of the hour, which is the same shape
pool exhaustion already had. The JSON route answers 503, because D-034 says a
`fetch()` caller branches on status. And a client over its cap that has a stale
copy gets the stale tree, not the seedling - the refusal is thrown inside the
try, so the existing serve-stale path catches it without knowing what it was.

The cost is a fourth method on a port whose smallness was itself a decision
(D-008). A cap cannot be built from `get`/`set`/`del`: get-then-set loses every
concurrent increment, and concurrency is the only condition a cap is for. So
`incr(key, ttl)` joins the port, one round trip on Upstash's pipeline endpoint -
`INCR` then `EXPIRE` - because a cap that costs two round trips on the cold path
makes the thing it protects slower.

One consequence to watch: a refused client lands in `comeBack`, which counts
against the error-rate meter and can fire the alert. That is deliberate. The cap
only trips when something is hammering the origin, and an operator wants to hear
about that in the same breath as an outage - but it does mean the first alert
after launch may be a crawler rather than a fault, and the runbook now says so
(OPS §6.1).
