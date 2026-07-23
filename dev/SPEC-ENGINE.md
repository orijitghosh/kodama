# SPEC-ENGINE - the pure renderer

Package `engine/` (`@kodama/engine`). Pure TypeScript, zero runtime
dependencies, zero I/O. This file is the binding contract; where PRD and this
spec disagree, this spec wins for implementation, and the disagreement gets a
DECISIONS.md entry.

## 1. Public API

```ts
export interface RenderOptions {
  biome: "bonsai";                       // only value in v1; validate anyway
  theme: ThemeName;                      // "ink" | "dusk" | "paper" | "sakura" | "yozakura" | "shore"
  scale: "full" | "compact" | "strip" | "button";
  animate: boolean;                      // caller resolves "auto" before engine
  tint: "lang" | "none";                 // lang: foliage hue rotated ±20° by top language (D-023)
  locale: string;                        // BCP-47; only affects <title>/<desc> + labels
}

export function render(
  history: NormalizedHistory,
  date: string,                          // "YYYY-MM-DD" UTC - the ONLY time source
  opts: RenderOptions
): string;                               // complete SVG document

export function treeFacts(history: NormalizedHistory, date: string): TreeFacts;
// computed biography: maturity level, pot tier, active events, plaques,
// weather, season, spirit/visitor visibility. Used by render() internally,
// exposed for the JSON API and the receipts layer. MUST be the single source
// of truth - render() derives visuals from TreeFacts, never recomputes.

export function receiptsFor(facts: TreeFacts, locale: string): Receipt[];
// { target, label, value, provenance } per drawn element. `target` is the CSS
// class render() puts on that element's group, so the receipts page can find
// it in the SVG. Added 5.2.
```

**A receipt exists exactly when its element is drawn.** Both directions are
asserted against every fixture: a receipt whose class is absent from the SVG is
a claim about a picture nobody is looking at, and an accountable class drawn
without a receipt is precisely the unfalsifiable decoration the receipts layer
exists to forbid. Structural groups (`kd-tree`, `kd-branches`, `kd-pad`, the
singular `kd-fruit` inside `kd-fruits`) are scaffolding and carry none.

Labels come from the locale tables; **provenance sentences are English in every
locale**, matching `biographyFor`. Translated prose is a promise the project
cannot keep yet, and a half-translated receipt is worse than an untranslated
one.

Hard rules:
- No `Date.now`, no `Math.random`, no `fetch`, no `process.env`, no locale
  functions that vary by host (`toLocaleString` banned; ship a tiny label
  table per locale). ESLint rules enforce all five (`no-restricted-globals`
  / `no-restricted-properties` / `no-restricted-syntax`); CI fails on
  violation.
- Determinism: identical `(history, date, opts)` ⇒ byte-identical string.
- Output ≤ 60 KB (`full`), ≤ 24 KB (`compact`), ≤ 16 KB (`strip`), ≤ 4 KB
  (`button`). Enforced by test with 20% headroom warning at build.
- Numbers in SVG output rounded to 2 decimals (float drift kills
  byte-identity across platforms; round at the serializer, nowhere else).

## 2. NormalizedHistory schema (v1 - frozen once M4 ships)

```ts
export interface NormalizedHistory {
  v: 1;
  login: string;
  fetchedAt: string;          // "YYYY-MM-DD"
  createdAt: string;          // account creation date
  weeks: WeekCell[];          // lifetime, ascending, one per ISO week WITH activity
  totals: {
    commits: number;          // post-cap sum (see 3.1)
    prsMerged: number;
    prsOpen: number;
    reviews: number;
    issuesClosed: number;
    discussions: number;
    starsReceived: number;    // sum over owned repos, capped at fetch (top 100 by stars)
  };
  streak: {
    current: number;          // days, per GitHub contribution calendar
    longest: number;
    lastActiveDate: string;   // "YYYY-MM-DD" of last non-zero day
  };
  recentPRs: PRStub[];        // last 10 MERGED, newest first
  languages: LangShare[];     // top 5 by repo-weighted bytes, shares sum ≤ 1
}
export interface WeekCell { w: string; c: number }        // "2026-W29", capped commits
export interface PRStub  { mergedAt: string; bucket: 1|2|3 }  // additions: <100 / <1000 / ≥1000
export interface LangShare { name: string; share: number }
```

Size target ~2 KB JSON for a typical account (weeks with zero activity are
omitted; a 10-year daily committer is ~520 weeks ≈ 8 KB - acceptable KV max).
Schema is versioned; the engine refuses `v !== 1` with a typed error (the API
maps it to the "come back soon" seedling + cache purge).

## 3. Growth math (bonsai biome)

### 3.1 Anti-gaming normalization (applied at *fetch* time, not render)
- Daily commit cap: 30. Days are capped before weekly summation.
- All other totals are raw counts (they're hard to spam meaningfully); stars
  are log-scaled at render, not capped at fetch.

### 3.2 Growth units and maturity
```
gu        = Σ over weeks of log2(1 + c)          // diminishing weekly returns
maturity  = min(13, 3 + floor(gu / 400))          // integer level, 3..13
```

(The divisor was 40 in the original draft; measured against the fixtures that
pinned everything past ~8 months of activity to level 13. 400 spreads the
fixture set across levels 3/4/5/7/13 - D-016.)
Maturity gates the skeleton (below). `gu` residual within a level sets pad
*density* (leaf-cluster circle count per pad, 4..9), so growth is visible
between level-ups.

### 3.3 Skeleton: seeded space colonization, level-stable
- PRNG: mulberry32. Seed = FNV-1a 32-bit of `login` (lowercased). The PRNG
  sequence is the ONLY source of randomness in the engine.
- Attractor cloud: 260 points sampled (seeded) inside a tilted ellipse
  crown region; the attractor list is generated ONCE per seed - a fixed
  deterministic sequence.
- The skeleton for maturity level M is computed by running space
  colonization against attractor prefix `[0, 20·M)`. **Invariant
  (level-stability):** the same (seed, M) always yields the identical
  skeleton. Monotonicity is guaranteed at the *element* level (pads, girth,
  ornament slots never decrease with M), NOT at the branch-pixel level -
  a level-up may re-pose branches. This is honest and tested as such
  (property test asserts element monotonicity only). Day-to-day the level is
  stable, so day-to-day the tree is pixel-stable.
- Trunk girth (px): `8 + 2.2 · sqrt(wholeYears · 4)`, capped 26. Whole years,
  not fractional: girth drives every branch stroke width, and a continuous age
  redrew the skeleton daily by an invisible amount, breaking day-to-day pixel
  stability (D-018).
- Crown extent scales 0.52 → 1.0 across maturity 3 → 13, and each seed draws
  its own crown lean, tilt and heavy side, so growth is legible and silhouettes
  are asymmetric (D-019).
- Pads: count is `4 + maturity` (7 at level 3, 17 at level 13) - derived from
  maturity, not counted from tip clusters, because counting broke element
  monotonicity on 32.5% of level-ups when measured (D-017). Positions come
  from the skeleton by farthest-point selection over branch tips; radii
  22-38 px by the number of tips each pad gathers.

### 3.4 Ornaments (all derived from TreeFacts; each has a draw budget)
| Element | Rule | Cap |
|---|---|---|
| New shoots | `ceil(log2(1 + commitsLast7d))` bright circles on newest pads | 6 |
| Fruit | `recentPRs` with `mergedAt` within 30 d of `date`; ripeness t = clamp(days/3, 0, 1) lerps green→persimmon; radius by bucket (4/6/8 px) | 10 |
| Unripe fruit | `min(prsOpen, 4)` small green | 4 |
| Lanterns | `floor(log2(1 + reviews))` | 7 |
| Bird | shown if `issuesClosed ≥ 50`; nesting variant ≥ 250 | 1 |
| Fireflies | `round(3 · log10(1 + starsReceived))`, dusk/yozakura/ink themes only | 12 |
| Wind chime | shown if `discussions ≥ 25` | 1 |
| Blossoms | if `streak.current ≥ 14`: clusters = `min(4, floor(streak.current / 30) + 1)` | 4 |
| Falling petals | if streak broke within 7 d (detect: longest>current AND lastActiveDate gap) | 3 |
| Soil petal ring | if `streak.longest ≥ 100`, permanent | 1 |

### 3.5 Time-derived state (all from `date`, UTC)
- Season: Mar-May spring, Jun-Aug summer, Sep-Nov autumn, Dec-Feb winter.
  Hanami = Apr 1-7 (all trees gain petals). Harvest = Oct 15-21 (ripe fruit
  drawn dropping into a basket). First snow = Dec 1-3 (falling flakes),
  Dec 4-Feb: settled snow cap on pot + bare-branch ratio 0.4 (the finest 40%
  of eligible twigs, depth>4, chosen by rank so the fraction holds on any tree
  and the same twigs go every winter - see D-022).
- Weather: `r = mean(commits last 30 d) / mean(commits days 31-210)`
  (denominator floor 0.2). r > 1.25 sun rays; 0.75-1.25 calm; < 0.75 light
  overcast. Accounts younger than 90 d: always calm-sun.
- Dormancy: `date − lastActiveDate > 90 d` → mist layer, sleeping spirit,
  weather suppressed. Awakening: first active day after dormancy → 7 d of
  burst shoots (detectable from weeks, no state needed).
- Pot tier by account age: <1 y plastic, ≥1 clay, ≥3 glazed, ≥6 antique,
  ≥10 stone.

### 3.6 Spirit & visitors (deterministic event windows)
An event is visible iff `date` falls inside `[trigger, trigger + duration)`.
Triggers are *dates recomputable from history*:
| Event | Trigger date source | Duration |
|---|---|---|
| Spirit: first merged PR | oldest `recentPRs` beyond... - NOT recomputable from v1 schema if >10 PRs ago → **spirit uses only triggers the schema can prove**: account anniversary (createdAt + n years), streak record day (current == longest AND current ≥ 30), commit milestones crossed within last 72 h (totals.commits crossing 100/1k/10k - needs yesterday's total: derive from weeks minus last days) | 72 h |
| Fox | `starsReceived ≥ 1000` | while true |
| Koi pond | `starsReceived ≥ 5000` | while true |
| Crane | account age ≥ 10 y | anniversary week each year |

Rule for Opus: if a proposed trigger cannot be recomputed from
NormalizedHistory v1 + date alone, it does not ship - extend the schema (v2)
or drop the trigger. Never store event state.

### 3.7 Plaques
Pot-rim glyphs, permanent: commits ≥ 1 000 / ≥ 10 000; prsMerged ≥ 100;
account ≥ 10 y. Max 4 shown; site tooltip gives earned dates (computed from
weeks cumsum).

## 4. Themes

A theme is data: `{ name, dark: Palette, light: Palette, night: boolean }`.
`Palette` = 17 named slots (bg, card, border, trunk, foliage[3], blossom[2],
fruit[2], accent, firefly, glow, snow, textPrimary, textSecondary). Ink and
dusk palettes are specified in TASTE.md §3 with exact hex; remaining four are
drafted by Opus and finalized at Taste Gate #1. Dark/light emitted together in
one SVG via `@media (prefers-color-scheme)` + CSS custom properties;
`night: true` themes enable fireflies/lantern glow.

`firefly` and `glow` carry the hexes TASTE §3 already specified for those two
elements, which the original 14-slot list had no home for; `snow` cannot
borrow `textPrimary` because that slot inverts between colour schemes (D-020).

Season repaints the three foliage slots at emit time rather than at each draw
site: the palette is a function of `(theme, scheme, season)`, and the shapes do
not know what month it is (D-021).

## 5. Layout & composition (full scale, 830×420)

Tree occupies left 55%; right column: three stat lines (commits, streak,
this-week) + a legend with one dot per symbol present on the tree, drawn in
that symbol's slot, bottom-aligned (D-024); header row: `kodama · @login` left, season +
date right; footer: none. `compact` = tree only + one stat line. `strip` =
horizontal tree silhouette + inline stats. `button` = 88×31 static tree
glyph + login, never animated. Exact type sizes, spacing, and the
composition grid: TASTE.md §4. Fonts: system font stack only - no embedded
fonts (size budget + camo).

## 6. Animation layer

CSS-only inside `<style>`, static text (D-026). Four things move and nothing
else: foliage sway (pads rock ±0.8° about the fixed trunk base, 7-9 s desynced
by period and phase), petal fall (`.kd-petal`, 6 s linear loop, fade before the
reset), snow fall (`.kd-flake`, 7 s), firefly drift (`.kd-firefly`, opacity
0.3→0.8 + ~10 px wander over 4 s). Each moving item is wrapped in its own `<g
class>` so the animation moves it as a unit; these wrappers are emitted whether
or not animation is on, so the still card and the animated one share one
geometry. `animate=off` appends nothing - a static card is byte-identical to one
with no animation layer, and is exactly the `animate=off` golden set. Motion is
full scale only (small scales read drifting dots as speckle). Guardrails:
`@media (prefers-reduced-motion: reduce)` sets `animation:none` on all four
classes, and no cycle is faster than 3 s (WCAG 2.3.1, with margin). SPIKE-CAMO
cleared CSS keyframes and SMIL through camo (`dev/spikes/SPIKE-CAMO.md`).

## 7. Testing contract

- **Golden SVGs:** fixtures × {ink,dusk} × {full,compact} × 4 season dates,
  committed; failure shows diff summary. Regenerate only via
  `pnpm golden:update` with changelog entry.
- **Property tests** (fast-check): determinism (1 000 random histories,
  render twice, bytes equal); element monotonicity (append activity ⇒
  foliage/ornament counts never decrease at same date); size caps; SVG
  well-formedness (parse with a strict XML parser); no `NaN`/`Infinity`
  substrings; every `<circle|path|rect>` inside viewBox bounds.
- **Fixtures** (synthetic, hand-authored JSON in `engine/fixtures/`):
  `ghost` (0 contributions), `newcomer` (3 weeks), `grinder` (2 y dense),
  `maintainer` (heavy reviews/PRs), `whale` (10 y at the daily cap ⇒ ~114 k
  post-cap commits; the PRD's "300 k" describes the raw account, which §3.1
  caps to ~114 k before it ever reaches the schema - `totals.commits` is
  post-cap by definition, so no fixture can exceed `capped_days × 30`),
  `veteran` (10 y moderate), plus `streak-broken`, `dormant`, `awakening`,
  `spammer` (5 000 commits in one week - must render ≈ one strong week).
- **TreeFacts unit tests:** every rule in §3 has a table-driven test with
  boundary dates (level-up day, streak-break day ±1, season boundaries,
  leap day, dormancy day 90/91).
