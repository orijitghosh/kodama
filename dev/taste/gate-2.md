# Taste Gate #2 - self-review + human verdict (the four remaining themes)

Milestone: IMPLEMENTATION 6.1. Procedure: TASTE §5, the mini pass.

**Corpus:** 6 fixtures {ghost, newcomer, grinder, maintainer, whale, veteran}
× 4 themes {paper, sakura, yozakura, shore} × 1 date {summer 2026-07-15}
= 24 images, **6 judged per theme.** Rendered by `engine/scripts/gate-2.ts`
to `dev/taste/gate-2/` (SVGs + `index.html`).

Half the size of Gate #1 by design. These palettes were authored from TASTE
§3's written directions and locked as drafts (`engine/src/themes.ts` header);
Gate #1 judged only ink and dusk. This pass puts the other four in front of an
eye at full scale for the first time.

**Why one date, not two.** The tree *geometry* - asymmetry, negative space,
what rewards a zoom, that it holds still - is a function of the fixture and the
date, not the theme: these 24 renders reuse the exact shapes Gate #1 already
judged (same six fixtures, same summer date, same engine). Only the palette is
new. So this gate re-judges colour, and columns 1/3/4/5 below inherit their
verdict from Gate #1 rather than being re-argued. Season modulation is
theme-independent (it shifts foliage hue by a fixed rule) and was judged at
Gate #1 too; the winter frames add nothing a colourist needs here.

**Scheme.** Each theme is judged in the scheme it was authored for: paper,
sakura and shore in their light palette, yozakura in its dark (night) one. The
SVGs on disk are the real dual-scheme badge output (like gate #1's); `index.html`
**pins** each figure to its authored scheme with an outer CSS rule that outranks
the SVG's own palette, so the ground is what you see regardless of your OS. (A
viewer that leaned on `color-scheme` instead showed every figure light, where
the four near-white grounds read as one theme and yozakura's night never
appeared.)

Legend: ✓ pass · ✓* pass, noted · ⚑ needs human judgment (see Notes).

---

## 1. Self-review against TASTE §1 (principles) and §2 (anti-patterns)

Grouped by theme. Columns 1/3/4/5 are inherited from Gate #1 (identical
geometry) and marked ✓ᵍ. Columns 2 (flat/matte/≤7 hue) and §2 are re-judged
here against the new palette.

| image | 1 static | 2 flat/matte/≤7 hue | 3 asymmetry | 4 neg-space ≥35% | 5 rewards zoom | §2 anti-patterns |
|---|---|---|---|---|---|---|
| **paper** - unbleached washi, sage foliage, day (no night layer) | | | | | | |
| ghost · paper | ✓ᵍ | ✓ warm neutral ground, one green family | ✓ᵍ | ✓ᵍ | ✓ᵍ | ✓ clean |
| newcomer · paper | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ single fruit | ✓ |
| grinder · paper | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ fruit cluster | ✓ |
| maintainer · paper | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ fruit | ✓ |
| whale · paper | ✓ᵍ | ✓ ~7 hue holds w/ blossom | ✓ᵍ | ✓ᵍ | ✓ᵍ fruit + blossom | ✓ density reads as ornament |
| veteran · paper | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ scattered fruit | ✓ |
| **sakura** - pale-pink washi, spring-biased | | | | | | |
| ghost · sakura | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ | ✓* near-twin of paper at summer (N1) |
| newcomer · sakura | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ | ✓* (N1) |
| grinder · sakura | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ | ✓* (N1) |
| maintainer · sakura | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ | ✓* (N1) |
| whale · sakura | ✓ᵍ | ✓ blossom carries the theme | ✓ᵍ | ✓ᵍ | ✓ᵍ pink bloom on warm ground | ✓ this is sakura at its intent |
| veteran · sakura | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ | ✓* (N1) |
| **yozakura** - indigo night, slate foliage, lantern-lit (night layer on) | | | | | | |
| ghost · yozakura | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ | ✓ |
| newcomer · yozakura | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ fireflies read | ✓ |
| grinder · yozakura | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ glow + fireflies | ✓ |
| maintainer · yozakura | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ lantern glow | ✓ |
| whale · yozakura | ✓ᵍ | ✓* saturated by design (the beauty theme) | ✓ᵍ | ✓ᵍ | ✓ᵍ pink bloom catches lantern light | ✓ the strongest frame in the gate |
| veteran · yozakura | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ | ✓ |
| **shore** - sandy ground, teal/sea-glass foliage, driftwood (no night layer) | | | | | | |
| ghost · shore | ✓ᵍ | ✓ teal foliage, distinct from paper | ✓ᵍ | ✓ᵍ | ✓ᵍ | ✓ |
| newcomer · shore | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ | ✓ |
| grinder · shore | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ | ✓ |
| maintainer · shore | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ | ✓ |
| whale · shore | ✓ᵍ | ✓ blossom pink vs teal reads, not clashes | ✓ᵍ | ✓ᵍ | ✓ᵍ fruit + blossom | ✓ |
| veteran · shore | ✓ᵍ | ✓ | ✓ᵍ | ✓ᵍ | ✓ᵍ | ✓ |

Self-review conclusion: no §2 instant-fail present in any of the 24. No neon
(yozakura runs saturated, which §2 exempts it as the beauty theme; it does not
cross into neon), no emoji, one stats font size beyond the hero number, no drop
shadows, no progress bars, crowns lobed not clip-art round, particle counts -
fireflies and lantern glow on yozakura included - read as ornament, not
confetti. One green family per theme, warm neutral or indigo ground; hue counts
stay at or under seven.

## Notes (items carried to the human review)

- **N1 - sakura reads as paper at summer unless the tree is blossoming.** Its
  identity is the pink blossom, and the blossom grammar is spring/streak-driven
  (SPEC-ENGINE §3.4): at a summer date only a long-streak tree (whale) blooms,
  so the other five sakura frames differ from paper only by a faint pink cast in
  the washi. This is the theme working as specified - sakura is *spring-biased*,
  and it comes alive in spring and on active accounts - not a palette bug. The
  question for the human: is that acceptable, or should sakura's non-blossom
  differentiation (ground tint, accent) be pushed harder so it stands apart from
  paper year-round? Pushing it is a `themes.ts` palette edit, not a grammar
  change.

- **N2 - yozakura foliage is blue-slate, not green.** Deliberate: moonlit
  leaves read cool (TASTE §3, "the beauty theme"). Confirm this reads as *leaves
  at night* rather than an unwell tree. In the render the lantern glow and warm
  fruit against the cool foliage sell the night reading, but it is the one
  colour choice in this gate that departs from "a tree is green," so it wants an
  explicit yes.

- **N3 - in-SVG legend text (light themes) uses the palette's `textSecondary`,
  a lighter grey than the site's.** M5.3 darkened the *site's* secondary text to
  clear WCAG AA as HTML; the engine palettes kept the original lighter
  `textSecondary` for the legend rendered *inside* the SVG. Image text is out of
  axe's scope, so nothing flags it, but it is the same legibility question at the
  same small size. Legible in the montage; noted so the human can call whether
  the in-SVG legend should track the site's darker value. A palette edit if so.

---

## 2. Human verdict - *"Would you post this?"* (Arijit + ideally one friend)

Fill Y/N per image. **6/6 required per theme pass.** Any N → written reason →
tune → re-gate. Budget one external illustrator pass if this gate fails twice.

### paper (6)

| image | Would you post this? | if N, why |
|---|---|---|
| ghost · paper | Y |  |
| newcomer · paper | Y |  |
| grinder · paper | Y |  |
| maintainer · paper | Y |  |
| whale · paper | Y |  |
| veteran · paper | Y |  |

### sakura (6)

| image | Would you post this? | if N, why |
|---|---|---|
| ghost · sakura | Y |  |
| newcomer · sakura | Y |  |
| grinder · sakura | Y |  |
| maintainer · sakura | Y |  |
| whale · sakura | Y |  |
| veteran · sakura | Y |  |

### yozakura (6)

| image | Would you post this? | if N, why |
|---|---|---|
| ghost · yozakura | Y |  |
| newcomer · yozakura | Y |  |
| grinder · yozakura | Y |  |
| maintainer · yozakura | Y |  |
| whale · yozakura | Y |  |
| veteran · yozakura | Y |  |

### shore (6)

| image | Would you post this? | if N, why |
|---|---|---|
| ghost · shore | Y |  |
| newcomer · shore | Y |  |
| grinder · shore | Y |  |
| maintainer · shore | Y |  |
| whale · shore | Y |  |
| veteran · shore | Y |  |

**Result:** paper 6/6 · sakura 6/6 · yozakura 6/6 · shore 6/6 · overall **PASS**

Reviewers: Arijit (owner)  Date: 2026-07-23

**Disposition of N3** (in-SVG legend `textSecondary` on light themes): closed as
*no change*. The verdict was given on these exact renders with the note in view,
so the lighter in-SVG value is what shipped approval attaches to. Reopening it
means a palette edit and a re-gate, not a patch.

**On pass - done 2026-07-23:**

- [x] Dropped the "drafts, finalized at Taste Gate #1" line from
      `engine/src/themes.ts` (stale - this gate is what finalized them).
- [x] Added `engine/test/taste-gate-2.test.ts`, pinning these 24 renders the way
      `taste-gate.test.ts` pins Gate #1's. The lock attaches to the approved
      pictures, so a failure here is a re-gate request, not a bug report.

---

## Re-walk 2026-07-24 - butterflies (engine v2, D-041)

Stars are now drawn on the day themes as butterflies, so 15 of these 24 images
changed: every one where the account has stars. The other nine (ghost, newcomer,
and yozakura being a night theme) were untouched.

**Verdict: pass.** Owner walked the sheet and approved. Artifacts re-rendered and
`taste-gate-2.test.ts` pins the new set.

One thing changed *after* the walk and is worth recording, because it is the sort
of note that otherwise gets lost. The owner's report was "I didn't see butterflies"
- and they were there, eleven of them, correctly drawn. They were simply too small
to notice at 1×: a 2.6 × 1.5 wing at 0.9 opacity in a pale rose, on washi, is about
seven pixels of low-contrast smudge. A firefly gets away with that size because its
glow halo doubles its footprint; a butterfly has no halo. The mark is now a 3.5 × 2
wing at full opacity with a dark trunk-coloured body between the wings, which is
what makes it read as an insect rather than as a fallen petal. The pinned artifacts
are the larger version.

**The lesson is about reviewing, not about butterflies:** a sheet judged at 3× is
not a sheet judged at 1×, and this project's output is read at 1× inside a README.
Any future gate on a small mark - the spirit, a visitor, a plaque - should be walked
at actual size before it is walked zoomed in.

---

## Re-walk 2026-07-27 - form (engine v3)

Same cause as gate #1's re-walk: C.4 changed the silhouette, all 24 images moved,
the owner re-rendered the set himself (`pnpm --filter @kodama/engine gate:2`) and
walked it.

**Result: PASS** - "I checked gates 1 and 2 now. They look beautiful."

The `<desc>` change recorded at the end of `gate-1.md` applies to these 24
artifacts as well. It was first written up there as an accessibility regression and
is not one: the removed clauses named plaques and weather, neither of which is
drawn. The correction is at the end of that file.
