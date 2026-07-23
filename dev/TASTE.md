# TASTE - the aesthetic contract

Beauty is a requirement, not a vibe. This file makes it testable enough to
gate milestones. When in doubt: Ghibli stillness, not video-game juice.

## 1. Design principles

1. **Static first.** Every tree must be postable as a still image. Animation
   is breath, not spectacle: nothing moves more than 1° or 12 px, nothing
   loops faster than 6 s.
2. **Flat, matte, few colors.** No gradients except the sky wash (one,
   vertical, two stops). No drop shadows; depth via one darker tone. Max ~7
   visible hues per theme at once.
3. **Asymmetry.** Bonsai composition follows real bonsai rules: trunk enters
   off-center (≈ 40% x), crown mass leans opposite the lowest branch, one
   pad always breaks the silhouette. The space-colonization params must be
   tuned until fixtures *look* deliberately kept, not random.
4. **Negative space is the luxury.** ≥ 35% of the card is empty sky. Stats
   column is quiet: no boxes, no icons except the legend dots - one dot per
   symbol actually on the tree, in the slot it is drawn in, bottom-aligned as
   a caption (D-024). A ghost shows one line; a maintainer's lanterns, bird
   and fireflies each earn theirs. It is a key, never a chart.
5. **Small things reward looking.** Ornaments are subtle at a glance,
   delightful at zoom (a lantern has a seam; the bird has a head-tilt pose).
   Nothing screams.

## 2. Anti-patterns (instant taste-gate fail)

Neon on dark unless theme=yozakura; emoji glyphs inside the SVG; more than
one font size in the stats column beyond the hero number; clip-art symmetry
(perfectly round crown); rainbow language tinting (tint=lang shifts hue ≤ 20°
from theme foliage); progress-bar anything; drop shadows; lens flare;
particle counts that read as confetti.

## 3. Reference palettes (exact; the other four themes are drafted by the
implementing model and finalized at Taste Gate #1)

### ink (default dark) - sumi-e: near-monochrome, one blood-orange accent
```
bg        #101312    card      #161a18    border    #232927
trunk     #4a4440    foliage1  #3d5245    foliage2  #4d6654    foliage3  #5f7a64
blossom1  #c98a94    blossom2  #b06d79    fruit1    #c96f3a    fruit2    #e08b4e
accent    #d97742    textPri   #e8e6e1    textSec   #9aa39d
night: true (fireflies #e8d9a0 at 70% opacity, lantern glow #e0a35c)
```

### dusk (default light-mode counterpart, also standalone) - Ghibli twilight
```
bg        #2b2f45    card      #333852    border    #454b66
trunk     #5c4f45    foliage1  #46685a    foliage2  #5a806c    foliage3  #74997f
blossom1  #e8a0b4    blossom2  #d4738f    fruit1    #d97e42    fruit2    #edaa63
accent    #e8c170    textPri   #f0eee8    textSec   #a8aec4
night: true
```

### paper (light) - unbleached washi, ink lines
Direction: bg `#f2efe6`, foliage desaturated greens `#6a8a70` family, trunk
`#6b5a4a`, blossom dusty rose, text near-black `#2a2c28`. No night layer.

### sakura / yozakura / shore - directions only
sakura: paper base, blossom-forward, spring-biased. yozakura: night bloom -
deep indigo `#1a1c2e` sky, petals catch lantern light; the beauty theme.
shore: driftwood + sea-glass greens, sand-colored pot dish.

## 4. Composition grid (full scale, 830×420)

- Margins 24. Header baseline y=40, hairline rule y=56.
- Tree region x∈[24, 470]; pot base y=396; crown must not cross y<80.
- Stats column x∈[500, 806]: hero number 34 px/700 at y≈110, its label
  13 px below; two secondary stat lines 20 px/600; legend dots + 12 px text,
  one row (20 px pitch) per present symbol, the stack bottom-aligned so its
  last row sits at y≈388 above y=396 (D-024). System font stack:
  `ui-monospace, 'Cascadia Code', Consolas, 'SF Mono', monospace` for
  numbers; `system-ui` for labels.
- compact 420×160: tree left 55%, hero number + one line right.
- strip 830×90: tree silhouette left, stats inline right, no legend.
- button 88×31: pot + crown glyph + login at 8 px, static.

## 5. The taste gates (procedure, binding)

**Gate #1** after Tier-1 grammar (IMPLEMENTATION step 2.6). **Gate #2** after
Tier-2 events (step 7.x). Procedure:

1. Render the 12 gallery images: fixtures {ghost, newcomer, grinder,
   maintainer, whale, veteran} × themes {ink, dusk}, at full scale, summer
   date + one winter date each (24 images total, 12 judged per theme pass).
2. Self-review against §1/§2 as a written checklist - one line per image per
   principle, kept in `dev/taste/gate-N.md`.
3. **Human review (Arijit + ideally one design-eyed friend):** the only
   question asked per image: *"Would you post this?"* 12/12 yes required.
   Any no → written reason → tune → re-gate. Budget one external
   illustrator pass if gate #1 fails twice.
4. Gate artifacts (images + checklist) are committed. The gallery page
   reuses them.

## 6. Motion taste

Sway origin at trunk base, ±0.6-0.9°, periods 7 s and 9 s desynced across
pads. Petals: ≤ 3 concurrent, 6 s fall, fade at 80%. Fireflies: ≤ 12, opacity
0.3→0.8 over ≥ 3 s, 12 px wander. Snow: ≤ 14 flakes. Nothing else moves.
If SPIKE-CAMO kills an effect, cut it silently - the still image was already
beautiful (see §1.1), so nothing was lost.
