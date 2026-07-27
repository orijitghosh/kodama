# The `/styles` page - walked 2026-07-27, pass

**Not a gate, deliberately.** A gate pins artifacts and a test fails when they
move, which is what makes a gate an approval rather than a note. This is a walk on
a page, recorded so that "somebody looked at it" is a fact in the repo rather than
a memory.

The drawings on the page are already pinned elsewhere: all fourteen specimens are
byte-compared goldens (`engine/test/golden/form-*.ink.summer.svg`), and the page
renders them through the same `render()` call at the same date. What is *not*
pinned is the copy, the layout and the ordering - and inventing a gate to hold
those would be ceremony, not rigour.

## What was walked

`/styles`, built from `ade515f`, viewed on the dev server. The ladder table, the
fourteen specimens with their readings, and the closing section.

**Verdict, owner, 2026-07-27: "I checked the website myself, it looks great."**

That covers the page as it stood at that commit. It is not a verdict on the
fourteen silhouettes themselves - those were approved separately at Taste Gate #4,
and this page draws the same fourteen images that gate walked.

## What this page is allowed to claim

Worth writing down, because it is the first public surface that *explains* form
rather than just drawing it, and the failure mode is a personality quiz:

- A style is **a reading, not a ranking.** No best one, no rare one worth chasing.
- The ladder's order is **specificity, not worth** - narrow structural questions
  before broad ones about rhythm.
- `moyogi` is **the tree kodama always drew**, not a failure state, and the page
  says so where a reader can see it.

## Still open around it

- **`mayRestyle` is not wired.** `treeFacts` re-runs `selectForm` on every render,
  so a style can change on any request when a signal crosses a threshold. D-042
  promised level-up and anniversary beats. This matters more now that a public
  page tells people their style means something about them - the page implies a
  stability the engine does not currently provide.
- **No `/styles` entry in the sitemap or OG card work**, if either is wanted
  before launch.
