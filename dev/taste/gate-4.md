# Taste Gate #4 - form (engine v3)

Status: **awaiting verdict.** The code is written, tested and committed locally;
gates #1 and #2 are failing on purpose - 48 assertions across all six gallery
fixtures - because the drawing changed and their approvals were given to engine v2.
A gate test failure is a re-gate request, never a repoint.

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

### The marks

- [ ] The deadwood vein reads as bleached wood on the trunk, not as a highlight or
      a scratch. Check on **paper** especially.
- [ ] `neagari`'s flare reads as roots lifted clear of the soil. Note the honest
      limit: the skeleton is untouched by contract, so the trunk still reaches the
      soil at full girth - there is no void under the tree, and what reads as
      lifted is the flare alone. If that is not enough, say so here.
- [ ] `sekijoju`'s stone reads as a rock the roots grip, not as a second pot. The
      three roots over it are graded in width; an earlier uniform version read as a
      printed triple line.
- [ ] `kokedama` reads as a bound moss ball. Two flat discs and no gradient, per
      TASTE §1.2.
- [ ] Sheet 3: all four marks still read at 420x160.

### The gallery re-walk (this is the Gate #1 and #2 request)

- [x] Sheet 4: each of the six is still postable with its new form. Owner, 2026-07-27:
      "this part actually looks great."
- [x] `ghost` and `newcomer` as moss balls - a seedling in a moss ball should read
      as *new*, not as *broken*.
- [x] `maintainer` and `veteran` with the stone - the stone names a real repository
      in the receipt, and an account with no anchor never gets one.
- [ ] No fixture renders `moyogi` any more. Decide whether that is acceptable for
      the gallery, and if not, whether the fix is a new fixture or a threshold.
- [ ] On a pass, re-render gate-1 and gate-2 from v3 and record the verdicts in
      their own files, not here.

### Separately, and pre-existing

Drift found before C.4 started, unrelated to form, still unrecorded:

- [ ] Fireflies gained a `<g class="kd-firefly">` wrapper.
- [ ] `<desc>` lost `Weather: calm.` and `Plaques on the pot rim: ...`.

## Verdict

**Pass on the drawing, 2026-07-27, partial.** Both shape sheets and the gallery
sheet are approved. Recorded in the owner's own terms: the six gallery fixtures
"actually look great", and on a second look at the fourteen, "they are growing on
me, I think they are fine as they are right now".

The interesting part of this gate is that the second look reversed the first. The
initial report was that the fourteen "look weird at times", and measurement then
found two real defects - short multi-trunk crowns and a `bunjin` that is neither
tall nor thin. Neither was what the owner had reacted to, and on re-reading the
sheet the reaction went away on its own. Nothing was changed to earn this pass,
which is why the acceptance is written down explicitly above rather than left as
an unticked box next to a measurement.

### Still open

This verdict covers the pictures on sheets 1, 2 and 4. It does not cover:

- **Sheet 3**, the four marks at compact scale. Not reported on.
- **The moss ball is clipped by the card.** `kokedama` puts the ball at cy 407 with
  r 32.4, so it reaches y 439 against a card that ends at 420 - about 19px is cut
  off by the bottom edge. Visible in the `ghost` and `newcomer` images. The pot
  legitimately overflows downward (a stone pot reaches 442) so this may be the same
  accepted overflow, but the pot is a flat base and a sphere reads differently when
  its bottom is sliced. Needs a decision, not an assumption.
- **No fixture renders `moyogi`.** A coverage question, not a drawing one.
- **Gates #1 and #2 themselves.** 48 assertions, 24 images each, across every theme
  and season. What has been walked is six fixtures at ink and summer. Re-pointing
  the pinned artifacts on that basis would be forging the rest of the approval.
