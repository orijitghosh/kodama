# PRD: kodama

**One-liner:** Your GitHub life as a living bonsai with a spirit in it - commits
grow foliage, merged PRs ripen into fruit, reviews hang lanterns, streaks
blossom, milestones engrave a plaque on the pot. One image URL in your profile
README; the tree is unique to you, grows daily, remembers everything, and
never lies.

**Name:** `kodama` (木霊 - the tree spirit of Japanese folklore; a small
glowing spirit appears *in* your tree at milestones). Domain target
`kodama.dev`; fallbacks `kodama.garden`, `growkodama.dev`. Working prefix in
code: `kd`. (Prior "gitgarden" name dropped - taken.)

**Delivery:** Hosted service on Vercel. Zero-install adoption:

```md
![my kodama](https://kodama.dev/orijitghosh.svg)
```

**Stack:** TypeScript monorepo - `engine/` (pure SVG renderer, zero I/O),
`service/` (fetch/cache/serve, published as `@kodama/api`; the thin Vercel
function adapters live in `api/`), `cards/` (PNG/OG renderer via satori/resvg),
`site/` (landing, live preview, theme picker, gallery).

**Prior art / positioning:** github-readme-stats (~70k stars) proved
paste-a-URL distribution; the contribution-snake proved animated SVG survives
GitHub's camo proxy; cbonsai proved people love watching a bonsai grow;
vscode-pets (1M+ installs) proved ambient companions stick. Nobody has
combined them: a persistent, personal, data-grown *organism with memory* on
the profile. Badges are stats tables; kodama is a pet with a biography.

---

## Why this wins

- **Uniqueness + earnedness.** Deterministic from (username seed × full
  history × date): recognizably yours, stable day-to-day, unrepeatable by
  anyone else. Stats cards are interchangeable; trees get screenshot-compared.
- **Readable biography.** Maintainer = lanterns and fruit; grinder = dense
  foliage; newcomer = sprout in a plastic pot; veteran = thick trunk, antique
  pot, engraved plaque. Legible at a glance = shareable.
- **Memory creates loyalty.** The tree records milestones permanently
  (plaques, pot upgrades, the spirit's appearances). You can't get that by
  forking someone's README - you have to live it.
- **Four free marketing waves a year:** real seasons (hanami bloom week in
  spring, deep summer green, autumn color, snow on the pot) synchronize
  everyone's trees - "check your kodama" trends itself quarterly.
- **Gentle by design.** Streak break drops blossoms for a week; the tree is
  never harmed. Comeback ("my blossoms are back") is content. Anti-Duolingo.

## Non-goals

- No accounts, no login, no user database, ever, in any tier. URL is the
  product; a KV cache is not a database of record.
- No NFTs, no crypto, no paid rarity. Rare events are earned, never bought.
- No dark-pattern retention (no decay-unless-you-commit mechanics; absence
  changes details - see dormancy - but never destroys).
- No non-public data. Private contributions only as the public count GitHub
  exposes when the user enables it; the Action mode (Tier 4) is the
  legitimate private-count path.
- No config files. If a tree needs configuration beyond URL params,
  uniqueness has failed.

---

# Feature tiers

## Tier 1 - The tree (launch)

### The image URL

```
https://kodama.dev/<user>.svg
  ?theme=ink|dusk|paper|sakura|yozakura|shore     (default auto dark/light)
  &scale=full|compact|strip|button                 (830×420 / 420×160 / 830×90 / 88×31 retro)
  &animate=auto|off                                (auto respects prefers-reduced-motion)
  &tint=lang|none                                  (language leaf-tinting, default none)
  &lang=en|ja|...                                    (alt-text + label locale)
```

Dark/light inside the SVG via `prefers-color-scheme`; GitHub's
`#gh-dark-mode-only` dual-image pattern documented as fallback. Every SVG
embeds `<title>/<desc>` - a one-line spoken biography ("Three-year tree,
1,247 commits, in blossom: 214-day streak") so screen readers get the tree
too. The 88×31 retro button is a deliberate wink at old-web badge culture -
costs an afternoon, earns a subculture.

### The growth grammar (engine contract)

| Signal (GraphQL `contributionsCollection`) | Visual | Rule sketch |
|---|---|---|
| Account age | Trunk girth + bends; pot tier: plastic → clay → glazed → antique → stone | Upgrades at 1 / 3 / 6 / 10 years; the decade pot is a monument |
| Total commits | Foliage pads: count + density | Pads accrete; **the tree only ever grows** |
| Last 7 days | Bright new shoots | The "I was here this week" signal |
| Merged PRs | Persimmons; size ∝ additions bucket | Green → ripe over 3 days; merge day looks *good* |
| Open PRs | Unripe green fruit | Converts on merge |
| Code reviews | Paper lanterns on branches | The maintainer's glow; lit in dusk themes |
| Issues closed | A bird perched / nesting at volume | Rare enough to feel special |
| Stars received | Fireflies at dusk | Log-scaled; whales don't white-out |
| Discussions answered | Wind chime | Sound culture without sound |
| Current streak | Blossom clusters | Break → petals fall 7 days, tree unharmed |
| Longest-ever streak | Faint ring of petals pressed into the soil | Permanent memory of your best run |
| Calendar quarter | Season: hanami / deep green / red-gold / bare + snow | Real time, globally synchronized |
| Top languages | Optional leaf tint | `tint=lang` |

**Determinism invariant:** `render(seed, history, date)` is pure -
byte-identical output for identical inputs. No stored state; cache flush
costs nothing. This is simultaneously the testing story, the ops story, and
the product story (your tree is yours, not a roll per request).

**Aesthetic bar:** seeded space-colonization branching, hand-tuned flat
palettes, CSS-only animation (leaf sway, petal fall, firefly drift), ≤ 60 KB
per SVG, flash rate ≤ 3 Hz (WCAG 2.3.1), gorgeous *static first* - animation
is seasoning. Design target = GitHub README column (~830 px).

## Tier 2 - Memory, events, and the spirit (fast follow, same engine)

- **The kodama itself.** A small glowing spirit appears in the tree only on
  earned occasions: first PR ever merged, 100th/1000th commit, streak
  records, account anniversaries - visible 72 h, then gone. Deterministic
  from history + date, so it appears honestly for everyone and can't be
  summoned. Scarcity is the feature; screenshots are the proof.
- **Plaques & milestones.** Permanent tiny engravings on the pot rim:
  ⚑ 1k commits, ⚑ 100 PRs, ⚑ 10-year account. Hover on the site shows the
  date earned. The pot becomes a trophy shelf that never resets.
- **Rare visitors** (deterministic, threshold-triggered, days-long): a fox
  sleeping under the tree at 1 000 stars; koi pond replaces the soil dish at
  5 000; a crane at 10 years. Rarity table published - hunting them is the
  meta-game.
- **Dormancy, done kindly.** 90+ days inactive → tree rests: soft mist, a
  sleeping spirit, foliage kept. First commit back = visible awakening
  (mist lifts, shoots burst). Absence is a state, not a punishment.
- **Weather = momentum.** Rolling 30-day activity vs. *personal* baseline:
  sun rays when above, still air at, light overcast below. Personal baseline
  (not absolute volume) so casual coders get sunny days too.
- **Seasonal events, opt-out via param:** hanami week (extra petals, all
  trees at once), first-snow day, autumn harvest week (fruit drops into a
  basket). Synchronized world moments = synchronized posting.
- **Anti-gaming:** volume signals log-bucketed with daily caps (500 commits
  in a day = one day of strong growth, not a redwood); the grammar favors
  breadth (reviews, PRs, longevity) over raw commit count - quietly a better
  signal than the green wall it decorates.

## Tier 3 - Sharing, time, and surfaces

- **Growth rings recap** (`/rings/<user>/2026.svg` + PNG): cross-section
  year-in-review - one ring per year, this year's ring annotated with
  milestone notches. The December viral shot.
- **Time travel:** `?date=2024-06-01` renders the tree as it stood then -
  free, because pure function. Anniversary side-by-sides.
- **Timelapse GIF/WebM** (`/timelapse/<user>.gif`, queued, rate-limited,
  monthly per-user quota): 365 daily renders stitched - the single most
  shareable artifact the platform can produce.
- **OG share cards** (`/card/<user>.png` via satori/resvg): rich-preview
  image - tree + name + three stats. Every shared kodama link advertises
  kodama.
- **JSON API** (`/api/<user>.json`): NormalizedHistory + computed tree facts
  (age, pads, fruit, plaques). Feeds third-party toys - terminal renderers,
  stream overlays, the R companion.
- **Receipts layer (site):** hover any element → its provenance ("this
  persimmon: PR #412, merged 2026-03-14, +2 310 lines"). GitHub embed stays
  static; the site is where the tree is explorable. Also the anti-cynicism
  feature: every pixel auditable.
- **Grove:** `/grove?users=a,b,c` - up to 8 trees on a shared hillside (team
  README, org page, conference speakers). No ranking, just a forest - team
  identity without leaderboard toxicity.
- **Embeds beyond GitHub:** same SVG works in any Markdown/HTML - personal
  sites, dev.to, GitLab profiles. Zero extra work; document loudly. OBS
  stream-overlay mode via `?bg=transparent`.

## Tier 4 - Platform (v2+)

- **GitHub Action mode:** renders with the user's own `GITHUB_TOKEN` in
  their profile repo - private-contribution counts, zero shared rate-limit
  exposure, Marketplace discoverability. Engine purity makes it a thin
  wrapper; the permanent pressure valve if hosted traffic spikes.
- **Provider adapters:** `NormalizedHistory` is provider-agnostic by design;
  GitLab second, Codeberg third. One tree, any forge.
- **Community themes:** themes are data (palette + params JSON + author).
  Contributed via PR against the golden-fixture harness; curated gallery,
  credited. The community-growth lever.
- **Editor companions:** VS Code webview + RStudio Viewer pane (tiny R
  package on the JSON API - the daydream/garden ecosystem tie-in).
- **kodama for orgs (sustainability):** the one paid surface, if ever:
  org groves + private-instance deploys. Personal trees free forever, stated
  as a covenant on the site.

---

## Architecture (Vercel)

```
GET /<user>.svg
  → edge cache (s-maxage=21600, stale-while-revalidate=86400) hit? serve
  → KV hit (NormalizedHistory, 6 h TTL)? render (≤30 ms) → serve
  → GitHub GraphQL via PAT pool → normalize (~2 KB) → KV → render → serve
```

- **`engine/`** - pure TS: `(history, opts, date) → string`. No fetch, no
  env, no `Date.now`. Golden-SVG snapshots per (fixture × theme × scale ×
  season), property tests (monotone growth: more commits ⇒ never fewer
  foliage nodes; determinism across 1 000 renders; size cap), rarity table
  unit-tested against synthetic histories.
- **`service/`** - param validation (username charset-checked before any API
  spend), cache orchestration, per-year history paging (history > 1 year old
  refreshes weekly, not per request), designed error SVGs: unknown user →
  tasteful empty pot; rate-limited → stale tree if available, else a "come
  back soon" seedling. **Never a broken image.**
- **`cards/`** - satori → resvg PNG pipeline for OG cards and rings;
  timelapse as queued background job.
- **PAT pool:** rotated tokens, per-token budget tracking, alert at 70%
  consumption (readme-stats published the playbook; steal it). Per-IP
  cache-miss limits.
- **Cost model:** 6 h cache ⇒ viral README ≈ 4 renders/day. Budget doc with
  real numbers at 10 k / 100 k users; Cloudflare Workers port documented as
  the escape hatch - engine purity is deliberate ops insurance.
- **Engine versioning:** grammar changes ship as `engine vN+1` with a public
  changelog; trees change on *announced* upgrades, never silently. People
  notice their tree. That's the point. Respect it.

## Behaviors that must be right

1. **Never a broken image** - every failure path returns valid SVG with
   correct Content-Type. Dead badge in a README = instant removal.
2. **Fast:** cached ≤ 50 ms edge; cold ≤ 1.5 s p95; render ≤ 30 ms (layout
   is seeded computation, not simulation-per-request).
3. **Camo reality:** CI fetches through GitHub's actual camo proxy and
   asserts animation classes + size survive. Empirical spike on current camo
   behavior (CSS vs SMIL, caching quirks) *before* building the animation
   layer - the M3.10 pattern.
4. **Giants and ghosts:** 300 k-commit whale stays composed (log buckets);
   zero-contribution account gets a charming sprout, not an embarrassment.
   Both are landing-page fixtures.
5. **The taste gate:** 12 fixture trees (ghost, newcomer, grinder,
   maintainer, whale, decade-veteran × two themes) must *all* be postable -
   beauty reviewed as an explicit milestone gate, one illustrator-eye pass
   budgeted. A mediocre tree kills the premise.
6. **Privacy stance:** public data only, no tracking pixels, no IP retention
   beyond abuse counters, one-paragraph policy on the site.
7. **Honesty of events:** every spirit appearance, visitor, and plaque is
   recomputable from public history - the receipts layer proves it. Nothing
   random, nothing purchasable, nothing fake-able.

## Milestones

- **M1 Engine core** - NormalizedHistory, seeded branching, trunk/pot/
  foliage, ink + dusk themes, golden + property harness, whale/ghost
  fixtures.
- **M2 Full Tier-1 grammar** - fruit, lanterns, blossoms, birds, fireflies,
  seasons, scales, tinting. **Taste gate #1.**
- **M3 Camo spike + animation layer** - embed empirics first, then
  sway/petals/fireflies; reduced-motion + `animate=off`.
- **M4 API + ops** - Vercel function, KV/edge caching, PAT pool, abuse
  guards, all error states designed, p95 budgets measured in CI, runbook.
- **M5 Site** - 30-second funnel (username → live tree → copy snippet),
  theme picker, receipts layer, grammar explainer, gallery.
- **M6 Launch** - remaining themes, budget alerting, launch posts (the
  grammar table IS the post), r/github + HN + badge listicles.
- **M7 Memory tier** - spirit, plaques, visitors, dormancy, weather,
  seasonal events, rarity page. **Taste gate #2.**
- **M8 Share tier** - rings, time travel, OG cards, JSON API, grove;
  timelapse queue last (heaviest infra).

## Risks

- **Rate limits at virality** - the success failure-mode. Layered: 6 h
  cache, SWR, PAT pool alerts, per-IP miss caps, Action mode as pressure
  valve. Runbook written before launch, not during the incident.
- **Taste risk** - two explicit gates + illustrator pass; cheaper than a
  failed launch.
- **Scope gravity** - Tier 2+ is deliberately *content on a stable engine*
  (same defense as daydream's catalog): every event/visitor is data + one
  draw function; the tier system is the contract for what launch requires
  (Tier 1 only).
- **GitHub API/camo policy shifts** - engine purity + NormalizedHistory
  isolate both; REST fallback for the contribution calendar documented.
- **Ops burden** - the only project on this list with a pager; steady state
  is nearly-static via cache, alerting is budget-based, Action mode is the
  permanent de-risk path.

## Addendum: biomes (architectural commitment, Tier-4 content)

The bonsai is a **biome** - one renderer over the shared
`render(seed, NormalizedHistory, date)` contract - not the product itself.
Future biomes (coral reef, tapestry/weave, island) are content drops on the
same engine and the same grammar *semantics* (growth is monotone, events are
earned, everything recomputable). Launch ships bonsai only, but the engine
API must never assume "tree": the element vocabulary in code is generic
(`masses`, `ornaments`, `inhabitants`, `substrate`) and the bonsai biome maps
them (foliage pads, fruit/lanterns, birds/spirit, pot). A second biome is the
re-viral update; the rings recap may ship as the tapestry biome's first
appearance. `?biome=bonsai` reserved in the URL grammar from day one,
default `bonsai`.

## Success criteria

Landing → badge in README < 30 s; cached p95 ≤ 50 ms; zero broken images
across the failure-injection suite; 12/12 fixtures pass both taste gates;
determinism suite byte-identical across 1 000 renders; every Tier-2 event
recomputable from public history (receipts test); first stranger theme PR
within a month; first unsolicited "look at my kodama" post within a week.
