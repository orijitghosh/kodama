# PROPOSAL - varietals: more metrics without more cards

Status: **proposal**, not binding. Nothing here supersedes SPEC-ENGINE until it
earns a DECISIONS entry. Written against engine v1 as of M6.

## 0. The problem this answers

`github-readme-stats`, `github-stats-extended` and `lowlighter/metrics` all
answer "we want more metrics" the same way: **more cards**. Metrics ships ~45
plugins; each new signal is a new panel, and the panel needs configuration to
turn on. That is a coherent product and it is the opposite of ours. The PRD
closes both doors on purpose:

- *"No config files. If a tree needs configuration beyond URL params,
  uniqueness has failed."*
- One image URL, pasted once, is the whole distribution mechanism.

So kodama cannot absorb new metrics as surface area. It has to absorb them as
**identity** - the same picture, carrying more of the person. The question is
not "what else can we draw next to the tree" but "what makes two trees look
like different trees."

Engine v1 has exactly one answer to that: ornament counts on a single silhouette
whose only structural variables are `maturity` (3-13), `trunkGirth`,
`potTier`, and a per-seed crown lean. Two five-year maintainers with different
languages, different working styles and different roles get the same plant with
different sprinkles. That is the ceiling this document is trying to lift.

## 1. Channel model

Split the grammar into five channels with **independent budgets**, so a new
metric lands in exactly one and never competes with the others for canvas.

| Channel | What it encodes | Cardinality today | Cardinality proposed |
|---|---|---|---|
| **Form** - the silhouette | *how you work* (shape of a career) | 1 | 12 bonsai styles |
| **Species** - leaf, bark, flower, fruit | *what you work in* | 1 (+ ±20° hue tint) | 11 species |
| **Ornaments** - things hung on it | *what you did, counted* | 10 | 19 |
| **Setting** - pot, soil, stand, companions | *context and standing* | 1 (pot tier) | 7 elements |
| **Time** - season, weather, events, dormancy | *when you are* | 4 seasons + 3 weathers | unchanged |

Only the first two are new *kinds* of variation, and they are the ones that
matter: form and species are multiplicative with everything else. Present
identity space is roughly `11 maturity × 5 pots × seed lean`. Proposed is
`12 forms × 11 species × 11 maturity × 5 pots × seed lean` - the "recognisably
yours, unrepeatable by anyone else" claim in the PRD stops being a promise about
a hash and becomes visible at a glance across a room.

## 2. Metric inventory

### 2.1 Free - already in NormalizedHistory v1

Derivable from `weeks[]`, `languages[]`, `totals`, `streak`, `createdAt` with no
API change whatsoever:

| Derived signal | Formula | Feeds |
|---|---|---|
| `cadenceCV` | stdev / mean over active weeks | form (steady vs bursty) |
| `declineRatio` | mean(last 26 w) / max rolling-52-week mean | form (windswept, exposed-root) |
| `burstiness` | max week / mean active week | form |
| `langTop1`, `langTop2` | `languages[0..1].share` | species, companion plant |
| `langCount15` | count of languages with share ≥ 0.15 | form (twin / clump trunk) |
| `dormancyHistory` | gaps > 180 d in `weeks[]`, and when they closed | form (deadwood) |
| `activeWeeks` | `weeks.length` | anti-gaming denominators |

**Species costs nothing.** `languages[]` has been in the schema since v1 and is
currently spent on a ±20° hue rotation behind an opt-in param (D-023). That is
the single largest unspent signal in the project.

### 2.2 Cheap - scalar fields on queries the fetcher already issues

Each is a `totalCount` or a field on a node set already being fetched. GraphQL
point cost is set by node count, so these are ~free:

| Field | Query to amend | Feeds |
|---|---|---|
| `user { followers { totalCount } }` | COUNTS | moss |
| `user { sponsors { totalCount } }` | COUNTS | shimenawa |
| `user { gists(privacy: PUBLIC) { totalCount } }` | COUNTS | pebbles |
| `user { organizations { totalCount } }` | COUNTS | display stand |
| `repositories.nodes { forkCount }` | STARS (same 100 nodes) | seedling tray |
| `repositories.nodes { releases { totalCount } }` | STARS (same 100 nodes) | pruning scars |
| `repositories.nodes { createdAt pushedAt }` | STARS (same 100 nodes) | viewing stone |

Three of those ride on `STARS_QUERY`'s existing `repositories(first: 100)` node
set - literally added fields on nodes already paid for.

### 2.3 One new branch - the repo mix

The structural unlock. `contributionsCollection` already fetched per year window
in `YEAR_QUERY`; add:

```graphql
commitContributionsByRepository(maxRepositories: 100) {
  repository { nameWithOwner isFork owner { login } createdAt }
  contributions { totalCount }
}
```

Past-year windows are immutable and already cached 30 days (D-030), so the
marginal cost is one-time per account year, then zero. From the union across
years:

| Derived | Meaning |
|---|---|
| `hhi` | Herfindahl index over commit shares - 1.0 = one repo, →0 = scattered |
| `ownShare` | fraction of commits to repos the user owns |
| `breadth` | distinct qualifying repos (see §7.4 for the anti-gaming filter) |
| `orgs` | distinct non-user owners contributed to |
| `oldestActiveOwnedRepoYears` | age of the longest-running owned repo still receiving commits |

**Store the five derived numbers, not the repo list.** NormalizedHistory's ~2 KB
budget survives; a hundred repo rows per year would not. The per-year KV entries
should likewise store per-year shares (top 20 + tail sum ≈ 1 KB/year), not the
raw response.

### 2.4 Rejected, with reasons

Worth writing down, because each of these is the obvious next import from the
reference projects and each is wrong here.

- **Hour-of-day / weekday habits** (`metrics`' `habits` plugin). Needs the REST
  events stream, which only reaches back 90 days and 300 events. Not
  recomputable from history forever ⇒ violates the receipts contract and D-015.
  Would need commit-level timestamps in the schema; not worth the KV.
- **Traffic - views and clones.** Requires push access on the repo. That is
  non-public data by the PRD's definition. Never.
- **Achievements / profile badges.** Not exposed in the GraphQL API. The only
  route is scraping the profile HTML. No.
- **Lines of code changed.** REST commit-stats pagination over every repo; the
  cost model in the PRD does not survive it.
- **Stargazer time series / worldmap.** Needs paginated `stargazers` with
  timestamps - thousands of nodes for exactly the accounts most likely to be
  fetched.
- **WakaTime, Stack Overflow, Steam, LeetCode, Spotify.** All require a user
  token or a config file. Both doors are closed by the PRD, and they are not
  about the tree anyway.

The honest summary: everything the reference projects surface that kodama should
want is either free or costs one query branch. Everything expensive is also
off-mission. That is a happy coincidence and it should be stated in the launch
post.

## 3. Form catalogue - twelve bonsai styles

Real bonsai styles are not decorative variants; they are classifications of how
a tree *grew under its conditions*. That maps onto careers almost too neatly.

Selector runs as a priority ladder, first match wins, and only when
`maturity ≥ 5` (below that everyone is a seedling and a style claim would be a
lie). Thresholds below are **placeholders pending calibration (§7.6)**.

| # | Style | Reads as | Trigger (draft) | Geometry delta |
|---|---|---|---|---|
| 0 | **Kokedama** (moss ball) | "just planted" | `maturity < 5` or zero activity | not a style - replaces the pot with a bound moss ball; the ghost/newcomer display, charming instead of empty |
| 1 | **Ikadabuki** (raft) | builds on others' work | `ownShare < 0.25 ∧ breadth ≥ 8` | fallen trunk lying along the soil, several trunks rising from it; the most literal metaphor in the catalogue |
| 2 | **Yose-ue** (forest) | spread across communities | `orgs ≥ 4 ∧ hhi < 0.12 ∧ breadth ≥ 20` | 5-7 trees of graded height in one tray; shares its primitive with Grove |
| 3 | **Kabudachi** (clump) | genuine polyglot | `langCount15 ≥ 3 ∧ hhi < 0.25` | 3-5 trunks from one root mass, tallest = top language |
| 4 | **Sokan** (twin trunk) | two worlds | `langTop1 ≥ 0.28 ∧ langTop2 ≥ 0.28` | second trunk from the base at ~60% of main height |
| 5 | **Bunjin** (literati) | wrote one thing everyone uses | `stars/commits ≥ 0.4 ∧ commits < 2000 ∧ years ≥ 3` | tall, thin, dramatically curved trunk; foliage only near the apex; 2-3 pads regardless of maturity. The high-signal, low-noise tree |
| 6 | **Seki-jōju** (root over rock) | one long-lived project | `oldestActiveOwnedRepoYears ≥ 5 ∧ that repo's share ≥ 0.3` | roots gripping a stone; the stone *is* that repo, and the receipt names it |
| 7 | **Sharimiki** (deadwood) | survived something | a dormancy ≥ 180 d that ended ≥ 180 d ago | bleached deadwood stripe beside a live vein on the trunk; permanent, healed, not a wound |
| 8 | **Fukinagashi** (windswept) | pulled away by life | `declineRatio < 0.4` but still active | all attractors biased to one side, branches trailing, pads elongated |
| 9 | **Neagari** (exposed root) | long history, quiet now | `years ≥ 8 ∧ declineRatio < 0.15` | roots lifted clear of the soil; age made structural |
| 10 | **Hokidachi** (broom) | even, wide contributor | `hhi < 0.15 ∧ cadenceCV < 0.9` | trunk splits at ~60% into a fan; hemispherical crown |
| 11 | **Chokkan** (formal upright) | the metronome | `cadenceCV < 0.55 ∧ streak.longest ≥ 180 ∧ hhi > 0.4` | straight vertical trunk, symmetric tiered pads, clean taper |
| 12 | **Shakan** (slant) | one big codebase | `0.25 ≤ ownShare ≤ 0.6 ∧ hhi > 0.35` | trunk at 15-25°, root buttress on the tension side |
| - | **Moyogi** (informal upright) | default | fallback | today's tree, unchanged |

### 3.1 Implementation shape

Nine of these are **reparameterisations of the existing attractor cloud**, not
new code paths: chokkan is an axis-symmetric column, hokidachi a hemisphere,
bunjin a small apex cluster on a long trunk, fukinagashi the existing
`heavySide` bias pushed to its extreme, shakan a rotation about `BASE_Y`.
`attractorCloud()` already takes lean/tilt/heaviness per seed - form makes those
a function of facts instead of only of the seed. Call it ~40 lines each.

Four need **one structural change**: `buildSkeleton` currently seeds a single
root node at `(BASE_X, BASE_Y)`. Multi-trunk forms (sokan, kabudachi, yose-ue,
ikadabuki) need N seeded roots colonising a shared cloud with a per-root
attractor partition. That is the only real engine work in this document, and it
pays for four styles plus the Grove feature from Tier 3.

Three are **draw-layer additions** on an unchanged skeleton: sharimiki's
deadwood stripe, neagari's exposed roots, seki-jōju's stone.

## 4. Species catalogue - eleven plants

Species changes four things: the leaf primitive, the autumn palette, whether and
how it flowers, and the fruit form. Trigger is the top language by
repo-weighted bytes - already in the schema.

| Species | Language trigger | Leaf | Autumn | Flower | Fruit (merged PR) |
|---|---|---|---|---|---|
| **Kuromatsu** (black pine) | C, C++, Rust, Zig, Assembly | needle fascicles, plated bark | evergreen, needles darken | - | cone |
| **Momiji** (Japanese maple) | JS, TS, Vue, Svelte | 5-lobe palmate | full scarlet - the best autumn in the set | - | winged samara |
| **Ginkgo** | Go | fan | pure gold, heavy simultaneous drop | - | ginkgo nut |
| **Sakura** (cherry) | Python | small ovate | soft yellow-orange | heavy spring bloom | small cherry |
| **Shimpaku** (juniper) | Shell, Dockerfile, Nix, HCL, Make | scale sprays, natural deadwood | evergreen | - | berry |
| **Fuji** (wisteria) | Ruby | pinnate compound | clear yellow | pendulous purple racemes in May | seed pod |
| **Keyaki** (zelkova) | Java, Kotlin, C#, Scala | small serrate, broom habit | russet | - | tiny nut |
| **Satsuki** (azalea) | HTML, CSS, SCSS | tiny dark leaves | semi-evergreen | very large flowers, May-June | capsule |
| **Olive** | PHP, Perl, Lua, COBOL, Fortran | narrow silver, gnarled trunk | evergreen | tiny cream | olive |
| **Ficus** | no language ≥ 25% | glossy oval, aerial roots | evergreen | - | fig |
| **Kaki** (persimmon) | fallback; docs/Markdown-dominant | broad oval | orange-red | - | persimmon (today's default) |

Three observations.

**Species is the cheapest large win available.** No schema change, no new query,
no new fetch. The work is a leaf `<symbol>` per species and a palette variant.

**It fixes an existing weakness.** D-023's hue rotation is opt-in
(`tint=lang`, default `none`) and capped at ±20°, so by default the language mix
- the single most-discussed number on every stats card - is invisible on the
tree. Species makes it the loudest signal in the picture without repainting
foliage into brand colours, which is exactly what D-023 was right to refuse.

**Species interacts with season for free.** A ginkgo in October and a pine in
October are dramatically different pictures; today every tree turns the same
red-gold. This multiplies the value of the seasonal marketing waves the PRD is
counting on.

The language→species table is a curated map, not a hash, and that is a
deliberate departure from D-023's reasoning. A hash was right for hue (nobody
can argue about 14°); it is wrong for species, because "Go is a ginkgo" is a
joke people will repeat and `fnv1a32("Go") mod 11` is not. The maintenance cost
D-023 feared is bounded: unmapped languages fall through to ficus/kaki, which is
a correct answer rather than a missing one.

## 5. Ornament and setting catalogue - nine additions

| Element | Metric | Rule (draft) | Cap | Channel |
|---|---|---|---|---|
| **Moss** on the soil | followers | coverage = `clamp(log10(1+f)/4, 0, 1)` | - | setting |
| **Shimenawa** + shide | sponsors ≥ 1 | rope round the trunk, `min(4, sponsors)` paper streamers | 4 | setting |
| **Pebbles** | public gists | `min(7, floor(log2(1+g)))` | 7 | setting |
| **Seedling tray** | forks received | `min(5, floor(2·log10(1+forks)))` | 5 | setting |
| **Pruning scars** | releases published | `min(6, floor(releases/10))` healed knots on the trunk | 6 | form |
| **Butterflies** | stars, **day** themes | same count as fireflies, day palette | 12 | ornament |
| **Companion plant** (shitakusa) | 2nd language ≥ 15% | small plant in its own dish, drawn as species #2 | 1 | setting |
| **Display stand** (dai) | orgs | none / plain / carved / lacquered at 0 / 1 / 3 / 6 | 1 | setting |
| **Viewing stone** (suiseki) | oldest owned repo ≥ 5 y | stone set beside the roots | 1 | setting |

Two of these are not additions but repairs.

**Butterflies close a real hole.** Fireflies are night-theme only (D-020,
SPEC §3.4). A user on `paper` or `sakura` currently has no representation of
stars at all - the most-cited number on GitHub, invisible for half the themes.
Same count, same log scale, same receipt; a day form of the same mark.

**Shimenawa is the lore paying rent.** A rope round a tree marks it as a dwelling
of a spirit. Kodama is named for that spirit. Sponsorship - other people
choosing to sustain your work - is the one metric that deserves it.

## 6. What this does to the picture

Worked examples against the committed fixtures:

- **`newcomer`** - kokedama moss ball, sakura (Python), 3 pads. Today: a small
  generic tree in a plastic pot.
- **`maintainer`** - hokidachi broom, keyaki, lanterns, bird, shimenawa,
  seedling tray. Today: the same silhouette as `grinder` with more lanterns.
- **`grinder`** - chokkan formal upright, momiji, dense pads, long streak
  blossom. Today: the same silhouette as `maintainer` with fewer lanterns.
- **`veteran`** - seki-jōju over a stone, kuromatsu, stone pot, decade plaque,
  crane in anniversary week.
- **`dormant`** - sharimiki deadwood beside a live vein, mist. Today: mist over
  a generic tree.
- **`whale`** - yose-ue forest, ficus (polyglot), moss, lacquered stand.
- **`ghost`** - kokedama, unplanted. Today: an empty pot.

`grinder` and `maintainer` diverging into two obviously different plants is the
whole argument in one line.

## 7. Constraint audit

Every item below is a real obstacle, not a formality. Three of them are load
bearing.

### 7.1 Determinism - clean

All inputs are facts + seed. No new clock, no new randomness. `render` stays
pure.

### 7.2 Monotonicity and pixel stability - **the hard one**

D-005 guarantees element-level monotonicity and day-to-day pixel stability. Form
is chosen from ratios (`hhi`, `ownShare`, `declineRatio`) which can move in both
directions, so a tree could flip style - and a flip re-poses everything.

Three mitigations, all needed:

1. **Form may never change `padCountFor(maturity)`.** Styles redistribute pads;
   they never remove one. Element monotonicity is preserved by construction, and
   the property suite asserts it across form changes specifically.
2. **Re-evaluate form only on maturity level-up.** Levels are monotone and rare
   (fixtures sit at 3/4/5/7/13), so a restyle becomes an earned event rather
   than a daily coin flip, and it arrives alongside growth the user can see. It
   also stays stateless: the level is recomputed from `weeks[]` every time.
3. **Wide bands + fixed priority order**, so a marginal account does not
   oscillate between two adjacent branches of the ladder.

The residual is honest and worth accepting: a restyle *is* what bonsai artists
do, the pot, plaques and rings carry continuity across it, and "your tree was
restyled" is better content than silent stasis. But it needs a receipt sentence
and a changelog line, not a shrug.

### 7.3 Receipts - every element needs one, and the legend will overflow

The bidirectional invariant (a receipt exists exactly when the element is drawn)
means 20 new elements ⇒ 20 new receipts with English provenance sentences. That
is mechanical.

D-024's dynamic legend is the problem: it already reaches nine rows at 20 px
pitch for a maintainer, and this proposal roughly doubles the symbol vocabulary.
The legend cannot grow past the card. Proposal: **cap the legend at nine rows**,
ordered by the existing fixed order, and let the site's receipts layer carry the
tail - which is what the receipts layer is for. Form and species are named in
the header line (`kodama · @login · ginkgo, literati`), not as legend dots.

### 7.4 Anti-gaming - a new attack surface

`hhi` and `breadth` are the first metrics in the project that are *cheap to
manipulate*: fifty empty repos with one commit each buys a hokidachi. Filter at
normalize time, alongside the existing daily cap:

- a repo counts toward `breadth` only with ≥ 5 commits across ≥ 2 distinct
  active weeks;
- `hhi` computed over qualifying repos only;
- `forkCount` and `followers` log-scaled at render, like stars.

Style should be reachable by working, not by scripting `gh repo create`.

### 7.5 Size budget - solvable, but measure

Full scale is capped at 60 KB. Today a pad is a cluster of `<circle>`s; a
palmate maple leaf is a path. At `padDensity` 9 across 17 pads that is 153
leaves, and 153 inline paths would blow the budget.

The fix is one `<symbol>` per species in `<defs>` and `<use>` at each site:
~200 bytes once, ~45 bytes per instance - comparable to today's circles.
Needs measuring against `whale` before anyone commits to path-based foliage.

### 7.6 Calibration - the thresholds in §3 are currently unfalsifiable

Every trigger above is a guess. Required before any of it ships: a calibration
script that runs the ladder over a corpus of public accounts and reports the
form histogram. Acceptance: **no style above 35% of accounts, none below 2%**,
and the three archetypes the PRD names (maintainer / grinder / newcomer) must
land on visibly different styles. Corpus should be public logins fetched at
calibration time and not committed - recorded responses about real accounts do
not belong in the repo.

### 7.7 Golden fixtures - additive, not multiplicative

12 forms × 11 species × 6 themes × 4 scales × 4 seasons is not a test suite
anyone can maintain. Keep it additive: one golden per **form** at a fixed
(theme, season, scale), one golden per **species** at a fixed form, and let the
existing property tests cover the cross product. ~23 new goldens.

### 7.8 Taste gate #3

Twelve silhouettes and eleven leaf treatments is a bigger illustration surface
than gates #1 and #2 combined. Budget an explicit gate: every form must be
postable at its representative fixture, and no species may read as a different
species' mistake. A mediocre form is worse than no form - it makes the tree look
procedurally generated, which is the one impression the project cannot afford.

### 7.9 Engine version - this is a v2, announced

Form and species change every existing tree. That is exactly what the PRD's
engine-versioning rule was written for: ship as `engine v2` with a public
changelog and a dated announcement. Handled well it is a re-viral event - "your
kodama has been restyled" is a better post than the original launch.

## 8. Recommended sequencing

Ordered by payoff per unit of risk, not by how interesting each is.

- **Phase A - species.** No schema change, no query change, no fetch change.
  Leaf symbols, autumn palettes, flower behaviour, species fruit. Plus
  butterflies (day-theme stars) and the companion plant, which ride the same
  `languages[]` data. **Highest ROI in the document.** Ships as engine v2.
- **Phase B - cheap scalars.** Amend COUNTS and STARS with the seven fields in
  §2.2; add moss, shimenawa, pebbles, seedling tray, pruning scars, display
  stand, viewing stone. Setting channel only - no geometry risk.
- **Phase C - form.** NormalizedHistory v2 (five derived repo-mix numbers), the
  `commitContributionsByRepository` branch, multi-root `buildSkeleton`, the
  twelve styles, calibration, taste gate #3. The big one; also unblocks Grove.
- **Phase D - the share mechanic.** A `/styles` page on the site: the twelve
  forms and eleven species with their triggers, the way the grammar page already
  documents ornaments. "What style is your tree" is a personality-quiz-shaped
  share loop that costs nothing extra and is precisely the thing a stats card
  cannot do.

Phase A alone closes most of the "two maintainers look identical" gap. Phase C
closes the rest and is where the schema-v2 cost lands.

## 9. Open questions

1. Does form re-evaluation on level-up hold up at level 13, where a whale never
   levels again and therefore never restyles? Probably needs a secondary
   re-evaluation beat - anniversary? - for capped accounts.
2. Is kokedama a style or a display? It replaces the pot, which collides with
   `potTier`. Likely: display, and `potTier` starts at kokedama below level 5.
3. Should species follow the *current* top language or the lifetime one? Current
   is more alive; lifetime is more stable and less likely to flip a tree's
   identity because of one busy month. Lean lifetime, matching the form
   stability argument.
4. Does the shimenawa read as sacred or as merchandise to a reader with no
   context? Worth a taste-gate opinion before it ships.
