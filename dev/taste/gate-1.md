# Taste Gate #1 - self-review + human verdict

Milestone: IMPLEMENTATION 2.6 (after M2 Tier-1 grammar). Procedure: TASTE §5.

**Corpus:** 6 fixtures {ghost, newcomer, grinder, maintainer, whale, veteran}
× 2 themes {ink, dusk} × 2 dates {summer 2026-07-15, winter 2026-01-20}
= 24 images. 12 judged per theme pass. Rendered by `engine/scripts/gate.ts`
to `dev/taste/gate-1/` (SVGs + `index.html`).

Legend: ✓ pass · ✓* pass, noted · ⚑ needs human judgment (see Notes).

---

## 1. Self-review against TASTE §1 (principles) and §2 (anti-patterns)

One row per image. Columns are the five §1 principles plus the §2
anti-pattern sweep.

| image | 1 static | 2 flat/matte/≤7 hue | 3 asymmetry | 4 neg-space ≥35% | 5 rewards zoom | §2 anti-patterns |
|---|---|---|---|---|---|---|
| ghost · ink · summer | ✓ | ✓ | ✓ windswept, trunk ~40% x | ✓ | ✓ | ✓ clean |
| ghost · ink · winter | ✓ | ✓ cooled foliage | ✓ | ✓ | ✓ | ✓ |
| ghost · dusk · summer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ghost · dusk · winter | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| newcomer · ink · summer | ✓ | ✓ | ✓* young crown, lean subtle | ✓ | ✓ single fruit | ✓* crown near-round at this size - watch |
| newcomer · ink · winter | ✓ | ✓ | ✓* | ✓ | ✓ | ✓* |
| newcomer · dusk · summer | ✓ | ✓ | ✓* | ✓ | ✓ | ✓* |
| newcomer · dusk · winter | ✓ | ✓ 0 this week, thinned | ✓* | ✓ | ✓ | ✓* |
| grinder · ink · summer | ✓ | ✓ | ✓ crown leans right | ✓ | ✓ fruit cluster | ✓ |
| grinder · ink · winter | ✓ | ✓ snow rim, thinned | ✓ | ✓ | ✓ | ✓ |
| grinder · dusk · summer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| grinder · dusk · winter | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| maintainer · ink · summer | ✓ | ✓ | ✓ full crown, off-center | ✓ | ✓ fruit + blossom | ✓ |
| maintainer · ink · winter | ✓ | ✓ snow rim, thinned | ✓ | ✓ | ✓ | ✓ |
| maintainer · dusk · summer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| maintainer · dusk · winter | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| whale · ink · summer | ✓ | ✓ ~7 hue holds | ✓ heavy crown, one pad breaks | ✓ | ✓ fruit + blossom | ✓ density reads kept, not confetti |
| whale · ink · winter | ✓ | ✓ cooled, thinned | ✓ | ✓ | ✓ | ⚑ pink blossoms in January (see N1) |
| whale · dusk · summer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| whale · dusk · winter | ✓ | ✓ | ✓ | ✓ | ✓ | ⚑ pink blossoms in January (see N1) |
| veteran · ink · summer | ✓ | ✓ | ✓ off-center trunk, lower-left pad breaks | ✓ | ✓ scattered fruit | ✓ |
| veteran · ink · winter | ✓ | ✓ snow rim, thinned | ✓ | ✓ | ✓ no winter bloom (streak 4) | ✓ |
| veteran · dusk · summer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| veteran · dusk · winter | ✓ | ✓ snow rim, thinned | ✓ | ✓ | ✓ no winter bloom | ✓ |

Self-review conclusion: no §2 instant-fail present (no neon on non-yozakura,
no emoji, one stats font size beyond the hero number, no drop shadows, no
progress bars, crowns are lobed not clip-art round, particle counts read as
ornament not confetti). Season modulation touches foliage only; trunk/pot/
text hold across the year, so each tree stays the same tree.

## Notes (items carried to the human review)

- **N1 - hanami blossoms under snow.** A long current streak triggers the
  blossom grammar (SPEC-ENGINE §3.4); when the render date lands in winter,
  those pink blossoms sit on a cooled, snow-rimmed tree - a January cherry
  bloom. It is spec-correct (streak, not calendar, opens the blossom window)
  but may read as an off-season glitch. **Decision needed:** accept as-is
  (blossoms = streak vitality, weather-independent), or gate blossoms behind
  a hanami-season window so winter trees never bloom. Affects the whale
  winter frames only (streak 205 → ~90 blossoms). Confirmed the trigger is
  the streak, not the calendar: veteran (streak 4) shows no winter bloom. If
  gated, it is a SPEC-ENGINE §3.4 + DECISIONS entry, not a taste-only tweak.

- **N2 - the ghost (0 commits) still grows a tree.** By the "never a broken
  image" rule the empty account renders a small windswept bonsai, not bare
  soil. Confirm this is the intended read (a seed already planted) rather
  than something that should look conspicuously empty.

---

## 2. Human verdict - *"Would you post this?"* (Arijit + ideally one friend)

Fill Y/N per image. **12/12 required per theme pass.** Any N → written
reason → tune → re-gate. Budget one external illustrator pass if this gate
fails twice.

### ink (12)

| image | Would you post this? | if N, why |
|---|---|---|
| ghost · ink · summer |  |  |
| ghost · ink · winter |  |  |
| newcomer · ink · summer |  |  |
| newcomer · ink · winter |  |  |
| grinder · ink · summer |  |  |
| grinder · ink · winter |  |  |
| maintainer · ink · summer |  |  |
| maintainer · ink · winter |  |  |
| whale · ink · summer |  |  |
| whale · ink · winter |  |  |
| veteran · ink · summer |  |  |
| veteran · ink · winter |  |  |

### dusk (12)

| image | Would you post this? | if N, why |
|---|---|---|
| ghost · dusk · summer |  |  |
| ghost · dusk · winter |  |  |
| newcomer · dusk · summer |  |  |
| newcomer · dusk · winter |  |  |
| grinder · dusk · summer |  |  |
| grinder · dusk · winter |  |  |
| maintainer · dusk · summer |  |  |
| maintainer · dusk · winter |  |  |
| whale · dusk · summer |  |  |
| whale · dusk · winter |  |  |
| veteran · dusk · summer |  |  |
| veteran · dusk · winter |  |  |

**Result:** ink 12/12 · dusk 12/12 · overall **PASS**

Reviewers: Arijit (project owner)  Date: 2026-07-20

**Verdict note:** given as a single blanket pass over all 24 images ("they all
pass"), not per-image marks - recorded verbatim rather than back-filling the
grid. N1 (winter hanami on long-streak trees) accepted as-is: blossoms track
the streak, not the calendar, and stay. N2 (the empty account still grows a
tree) accepted. No re-gate needed. M3 unlocked.
