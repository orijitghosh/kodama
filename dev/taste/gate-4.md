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
- **Six of the ten fixtures now select a form** - ghost, newcomer and spammer take
  the moss ball; dormant, maintainer and veteran take the stone. That is why the
  pinned artifacts moved.

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

## The two questions

For every image:

1. **Would you post it?**
2. **Could it be mistaken for a different form's mistake?**

**Judge at 1x, not zoomed.**

## Checklist

### The shapes

- [ ] Each of the fourteen reads as a deliberate silhouette rather than as a tree
      that came out wrong.
- [ ] The multi-trunk four - `sokan` (twin), `kabudachi` (clump), `yoseUe` (forest),
      `ikadabuki` (raft) - are distinguishable from each other. **Known weak set**:
      they share a partitioned attractor cloud and differ only in base offsets and
      reach. If a pair fails, the fix is the plan's spacing, not a new mechanism.
- [ ] `chokkan` (formal upright) does not just read as `moyogi` with a straight
      stem. If it does, the honest answer may be that the metronome deserves a
      different signal rather than a straighter trunk.
- [ ] `bunjin` reads as literati - tall, bare, foliage at the apex - and not as a
      tree that lost its pads.
- [ ] `fukinagashi` and `shakan` are distinguishable: windswept is a lean with the
      crown dragged, slant is a lean with the crown intact.

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

- [ ] Sheet 4: each of the six is still postable with its new form.
- [ ] `ghost` and `newcomer` as moss balls - a seedling in a moss ball should read
      as *new*, not as *broken*.
- [ ] `maintainer` and `veteran` with the stone - the stone names a real repository
      in the receipt, and an account with no anchor never gets one.
- [ ] On a pass, re-render gate-1 and gate-2 from v3 and record the verdicts in
      their own files, not here.

### Separately, and pre-existing

Drift found before C.4 started, unrelated to form, still unrecorded:

- [ ] Fireflies gained a `<g class="kd-firefly">` wrapper.
- [ ] `<desc>` lost `Weather: calm.` and `Plaques on the pot rim: ...`.

## Verdict

_Unwritten._
