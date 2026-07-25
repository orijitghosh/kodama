# Taste Gate #3 - species (engine v2)

Status: **awaiting verdict.** The code is written and tested; gate-1 and gate-2
are failing on purpose, because the drawing changed and their approvals were
given to engine v1. Nothing is committed until this gate is walked.

Render the sheet and open it:

```bash
pnpm --filter @kodama/engine gate:3
```

Then `dev/taste/gate-3/index.html`. Each image is an `<img>` of its own file, not
inlined - inlining put 39 SVGs in one document, where the first `<symbol>` id and
the last `svg{--kd-*}` block win for everything on the page, and the first version
of this sheet was consequently a lie (every crown painted with the pine's leaf).
Worth remembering the next time a contact sheet looks wrong.

## What changed

- **`?species=` is an option, and `classic` is the default.** The tree that shipped
  is untouched: Taste Gate #1 passes on all 24 approved images, which is the
  evidence rather than a claim. An earlier draft derived the plant from the top
  language and would have restyled every existing badge - D-041 records why that
  was the wrong trade.
- **Four alternates:** Japanese maple, ginkgo, cherry, wisteria. Each changes the
  leaf mass, the autumn colour, the fruit form and the flower form, and nothing the
  account earned.
- **Butterflies.** Stars are drawn on the day themes now, at the same count and log
  scale as the fireflies on the night themes. This is the one change that touches
  the default, which is why Gate #2 needs a partial re-walk.

## Sheets

`pnpm --filter @kodama/engine gate:3` writes 21 images:

1. **Species on `maintainer`, ink** - the five plants side by side.
2. **Species on `maintainer`, paper** - the same five on a day theme, so the
   butterflies are visible.
3. **Autumn, per plant** - classic keeps the global amber; maple scarlet, ginkgo
   gold, cherry and wisteria a soft yellow.
4. **The six gallery fixtures at the default** - these must look exactly like the
   gate-1 images, because they are the same bytes.

## The two questions (PROPOSAL-VARIETALS §7.8)

For every image:

1. **Would you post it?**
2. **Could it be mistaken for a different plant's mistake?**

## Checklist

### The four alternates

- [ ] Each reads as a deliberate plant rather than as noise.
- [ ] `momiji` and `ginkgo` are distinguishable. **Known weak pair** - both are
      rounded-bump crowns, five bumps against four; the fruit differs (winged samara
      vs oval nut) and autumn differs sharply. If this pair fails, the fix is a
      flatter, wider bump for the ginkgo rather than a new leaf family.
- [ ] `sakura` (many small bumps) does not just read as the classic disc.
- [ ] `fuji` is the pointed one of the set and reads as leaflets, not as a thistle.
- [ ] The header line (`kodama · @login · Japanese maple`) does not crowd the date
      on the longest label.

### Autumn

- [ ] Four distinct autumns across five plants, and none lands in khaki.
- [ ] `classic` in October is unchanged from what gate #1 approved.

### The default, and the butterflies (this is the Gate #2 re-walk)

- [ ] Sheet 4 is indistinguishable from the gate-1 images.
- [ ] On `paper`, `sakura` and `shore`: butterflies read as butterflies at 5 px, not
      as stray petals or grit. Wings are drawn from the blossom slot for exactly
      this reason - the accent is a rust brown on washi and read as dirt.
- [ ] 15 of gate-2's 24 images now contain butterflies. Walk those 15 and record the
      verdict in `gate-2.md`, not here.

## Verdict

_Unwritten. On a pass, the artifacts for gate-1 and gate-2 get re-rendered from
v2 and their suites go green again; on a fail, the note goes here and the geometry
is tuned before anything is committed._

## Verdict

**Pass, 2026-07-24.** Owner walked the sheet: "I like all of them." The four
alternates ship as options, `classic` stays the default.

Recorded because it is the interesting part of this gate: the butterflies were
approved *after* being resized. The first report was "I didn't see butterflies",
which was not a rendering failure - eleven were on the tree - but a legibility one,
at 1× on washi. See the re-walk note in `gate-2.md`. Everything else passed as
drawn.

Not re-gated, because nothing about them changed: Taste Gate #1's 24 images are
still byte-identical under `classic`, which is the standing evidence that the
default tree did not move.
