# Taste Gate #4 - form (engine v3)

Status: **passed 2026-07-27, all four sheets.** Gates #1 and #2 were re-pointed the
same day on their own recorded verdict (`17226e5`), after failing on purpose - 48
assertions across all six gallery fixtures - because the drawing changed and their
approvals had been given to engine v2. A gate test failure is a re-gate request,
never a repoint.

Render the sheet and open it:

```bash
pnpm --filter @kodama/engine gate:4
```

Then `dev/taste/gate-4/index.html`. 42 images, each an `<img>` of its own file -
see `gate-3.md` for the document that painted every crown with one species' leaf.

## What changed

Form is the first thing this project has changed about the *outline* of an existing
tree. Everything before it was volume, age or costume.

- **Fourteen forms**, chosen by a calibrated priority ladder from how someone works
  (`engine/src/form.ts`). Nine are reparameterisations of the attractor cloud, four
  are trunk plans, four are a mark on the tree, and `moyogi` is today's tree
  unchanged as the fallback.
- **Four draw-layer marks** (`engine/src/biomes/form-marks.ts`): a bleached deadwood
  vein on the trunk, roots flaring clear of the soil, a stone the roots grip, and a
  bound moss ball in place of the pot.
- **All ten fixtures select a form, and not one of them is moyogi.** Three moss
  balls (ghost, newcomer, spammer), three metronomes (grinder, whale,
  streak-broken), three stones (maintainer, veteran, dormant) and one slant
  (awakening). That is why every pinned artifact moved.

  Worth sitting with before the verdict: **the fallback has no fixture**, so the
  tree that actually shipped is drawn nowhere in this gate except as one of the
  fourteen crafted accounts. The gallery no longer contains the default. Whether
  that is the fixtures being unrepresentative or the ladder being too eager is a
  question this sheet can raise but not answer - the calibration run over 159 real
  accounts is the thing that can, and it put every style inside the 3.0-15.2% band.

## The accounts on the sheet

Not the ten real fixtures. **Only four of the fourteen forms are reachable from
those**, so a sheet built on them would have judged four styles and guessed at ten.
Sheets 1-3 draw the fourteen crafted accounts in `engine/test/helpers/form-cases.ts`,
which are the same accounts the reachability suite selects.

Nothing forces a form. Each case carries its own `repoMix` and goes through
`selectForm` exactly as a real account does, and `gate-4.ts` refuses to write a
single file if any case has drifted off its rung - a sheet illustrating a style the
ladder no longer produces would be worse than no sheet.

Every case is maturity 5 except the moss ball (3) and the windswept (6), so what
differs between the images is the form and not the size.

## Sheets

1. **The fourteen forms, ink, summer** - the reference sheet.
2. **The fourteen forms, paper, summer** - the deadwood vein is drawn in `snow`, the
   one slot pale in both schemes. This is where it has to survive a pale ground.
3. **The four marks at compact scale (420x160)** - compact draws at `reduced`
   detail, which still draws marks; `strip` and `button` do not. Trap #2: the
   butterflies were correct and invisible.
4. **The six gallery fixtures as they now render** - the real accounts, and the
   sheet gates #1 and #2 are being asked to re-approve.

## Measured before the walk

Two things fall out of the geometry without needing an eye on them. Neither is a
verdict; both are here so the walk does not have to rediscover them.

**The four multi-trunk forms are short.** Crown top in px, against `moyogi` at 189
and `chokkan` at 144: `kabudachi` 244, `sokan` 245, `yoseUe` 252, `ikadabuki` 273.
That last is 123px of tree where a normal one is 207. The cause is C.3's shared
node budget - `ceil(MAX_SKELETON_NODES / trunks.length)` - so each stem runs out of
nodes and stops climbing. `padCountFor(maturity)` cannot fall (C.6 rule 1), so nine
pads pack into a crown two-thirds the height.

**`bunjin` is neither tall nor thin.** 202px tall - shorter than `moyogi` - and
271px wide, the widest of all fourteen. The crown is shrunk by `ryScale: 0.5` but
lifted only 30px, so the branches sprawl at ordinary height before reaching it. The
docblock claims a long bare trunk with foliage gathered at the apex; the drawing is
not that.

## The two questions

For every image:

1. **Would you post it?**
2. **Could it be mistaken for a different form's mistake?**

**Judge at 1x, not zoomed.**

## Checklist

### The shapes - walked 2026-07-27, pass

- [x] Each of the fourteen reads as a deliberate silhouette rather than as a tree
      that came out wrong.
- [x] The multi-trunk four - `sokan` (twin), `kabudachi` (clump), `yoseUe` (forest),
      `ikadabuki` (raft) - are distinguishable from each other.
- [x] `chokkan` (formal upright) does not just read as `moyogi` with a straight stem.
- [x] `bunjin` reads as literati.
- [x] `fukinagashi` and `shakan` are distinguishable.

The two defects under "Measured before the walk" were put to the owner before this
pass and **accepted as drawn**: the multi-trunk four stay short, and `bunjin` stays
shorter and wider than the style nominally wants. First read was that the sheet
looked odd in places; second read, unprompted, was that the forms had grown on him
and are fine as they are.

That is a deliberate decision and not an oversight, which matters because the
measurements are still sitting in this file and would otherwise read as open work.
If a later session wants to lift the multi-trunk crowns, it is re-opening a walked
decision and needs a new verdict, not a bug fix.

### The marks - walked 2026-07-27, pass

Walked on the re-rendered sheet, after the scheme-pinning fix below. The owner's
verdict on the whole set, in his words: **"I checked all... all OKAY! approved."**
A single verdict over the five boxes rather than five separate answers, which is
why they are ticked together and attributed together.

- [x] The deadwood vein reads as bleached wood on the trunk, not as a highlight or
      a scratch. Check on **paper** especially.
- [x] `neagari`'s flare reads as roots lifted clear of the soil. Note the honest
      limit: the skeleton is untouched by contract, so the trunk still reaches the
      soil at full girth - there is no void under the tree, and what reads as
      lifted is the flare alone. If that is not enough, say so here.

      Approved with that limit standing. The flare alone is accepted as enough;
      lifting the skeleton later re-opens this, and needs a new verdict.
- [x] `sekijoju`'s stone reads as a rock the roots grip, not as a second pot. The
      three roots over it are graded in width; an earlier uniform version read as a
      printed triple line.
- [x] `kokedama` reads as a bound moss ball. Two flat discs and no gradient, per
      TASTE §1.2.
- [x] Sheet 3: all four marks still read at 420x160.

**The sheet this was walked on is not the sheet the partial verdict was walked
on.** Sheets 1-3 were re-rendered first, because the document could not answer its
own paper question - see "The sheet was showing one ground" below. The marks pass
is therefore the first one taken on a sheet where the pale ground was actually
pale.

### The gallery re-walk (this is the Gate #1 and #2 request)

- [x] Sheet 4: each of the six is still postable with its new form. Owner, 2026-07-27:
      "this part actually looks great."
- [x] `ghost` and `newcomer` as moss balls - a seedling in a moss ball should read
      as *new*, not as *broken*.
- [x] `maintainer` and `veteran` with the stone - the stone names a real repository
      in the receipt, and an account with no anchor never gets one.
- [x] No fixture renders `moyogi` any more. Decide whether that is acceptable for
      the gallery, and if not, whether the fix is a new fixture or a threshold.

      Owner, 2026-07-27: **"i checked moyogi ones, good fallback."** Accepted as
      is - **no new fixture and no threshold move.** Read carefully, what was
      answered is that the fallback tree itself is good, judged on
      `form-moyogi-ink.svg` and `form-moyogi-paper.svg` from sheets 1 and 2. The
      coverage half - that the *gallery* contains no moyogi - is accepted on the
      same breath as the rest of "all OKAY", and is recorded here as accepted
      rather than as separately argued. If a later session wants a moyogi fixture,
      it is adding coverage, not fixing a defect.
- [x] On a pass, re-render gate-1 and gate-2 from v3 and record the verdicts in
      their own files, not here. Done 2026-07-27 in `17226e5`; see `gate-1.md`
      and `gate-2.md`.

### Separately, and pre-existing

Drift found before C.4 started, unrelated to form, still unrecorded:

- [ ] Fireflies gained a `<g class="kd-firefly">` wrapper. Still unrecorded, and
      still nothing to do with form.
- [x] `<desc>` lost `Weather: calm.` and `Plaques on the pot rim: ...`. Resolved in
      `d7fc26a`: this was a **fix, not a regression** - neither plaques nor weather
      are drawn, so naming them handed a screen-reader user a different tree than a
      sighted one. Written up in `gate-1.md`, not here.

## The sheet was showing one ground

Found during the marks walk, and fixed in `b099d3d` before the walk could be
completed. `form-sharimiki-ink.svg` and `form-sharimiki-paper.svg` both rendered
dark, and were byte-identical - as were twelve of the other thirteen pairs.

Every theme is a **pair**. `paletteStyles` puts the light palette in the base
`svg{}` rule and the dark one inside `@media(prefers-color-scheme:dark)`, so which
one a reader sees is chosen by their operating system, not by the `theme=` they
asked for. An `<img>` resolves that query against the OS too. On a machine set to
dark mode, every image on all four sheets came out dark - **including the sheet
whose only purpose is to ask whether the deadwood vein survives a pale ground.**
The document could not answer the question it was asking. This is trap #1 wearing
a different hat, and it is now trap #8.

Second, narrower, and not a bug: `ink` and `paper` share both palettes and differ
only in `night`, so for the twelve cases with no fireflies the two files really
are the same tree. `bunjin` has 40 000 stars and is the one pair that legitimately
differed. The sheet note says so now instead of implying a second theme.

`gate-4.ts` now pins each sheet to the scheme it claims - the query is stripped for
the light sheet and hoisted over the base rule for the dark one - and throws rather
than guess if `paletteStyles` changes shape. **The shipped SVG is untouched.**

## Verdict

**Pass, 2026-07-27, complete.** All four sheets approved. The marks were walked
last, on a re-rendered sheet, and carried in the owner's words: "I checked all...
all OKAY! approved."

### The partial verdict this replaces, kept as written

Sheets 1, 2 and 4 were approved earlier the same day, in the owner's own terms:
the six gallery fixtures "actually look great", and on a second look at the
fourteen, "they are growing on me, I think they are fine as they are right now".

The interesting part of this gate is that the second look reversed the first. The
initial report was that the fourteen "look weird at times", and measurement then
found two real defects - short multi-trunk crowns and a `bunjin` that is neither
tall nor thin. Neither was what the owner had reacted to, and on re-reading the
sheet the reaction went away on its own. Nothing was changed to earn this pass,
which is why the acceptance is written down explicitly above rather than left as
an unticked box next to a measurement.

### Decided, not fixed

**The moss ball stays clipped.** `kokedama` puts the ball at cy 407 with r 32.4, so
it reaches y 439 against a card that ends at 420 - about 19px is cut off by the
bottom edge, visible in the `ghost` and `newcomer` images. Owner, 2026-07-27:
**"for the moss ball, lets keep it clipped for now."**

"For now" is recorded as written. This is an accepted overflow and not an open
bug, and it joins the two walked decisions from the partial verdict - the short
multi-trunk crowns and the wide `bunjin`. **Un-clipping it later re-opens a walked
decision and needs a new verdict, not a fix.** What would argue for re-opening is
new information, not a fresh opinion: the pot overflows downward too (a stone pot
reaches 442), so the question was only ever whether a sliced sphere reads worse
than a flat base, and the answer on the sheet was that it does not.

### Still open

Nothing in this gate. Two things sit outside it:

- **Fireflies gained a `<g class="kd-firefly">` wrapper.** Pre-existing drift,
  unrelated to form, still unrecorded anywhere.
- **The light half of gates #1 and #2 has never been walked.** Those gates pin
  `ink` and `dusk`, which have different *dark* palettes but the *same* light one -
  so in dark mode their 24 images are two themes, and in light mode they collapse
  to one. The 2026-07-27 re-point was walked in one scheme. This is the same
  pair-of-palettes fact that broke this sheet, applied to a gate that was never
  asked about it. Not a re-gate request - nobody has claimed those images are
  wrong - but the coverage is thinner than "48 assertions" makes it sound.
