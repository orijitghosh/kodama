# Contributing to kodama

Thanks for wanting to help the tree grow. This is a small, opinionated
codebase; a few rules keep it that way.

## Ground rules

- **The engine is pure.** `engine/` has no clock, no network, and no randomness
  beyond its seeded PRNG. `render(history, date, options)` must be a pure
  function of its arguments - this is enforced by lint and by the determinism
  tests, and it is the whole reason the project is testable and cheap to run.
- **Determinism is product law.** Byte-identical output for identical inputs, or
  it's a bug. If your change moves a pixel, that is a deliberate act with a
  golden update and (for the shipped themes) a taste re-gate - never a silent
  diff.
- **Never a broken image.** Every failure path in `service/` returns a valid SVG
  with HTTP 200. A README `<img>` renders a broken glyph for anything else.
- **Conventional commits**, present-tense, explaining *why* in the body when the
  change isn't obvious. Keep unrelated changes in separate commits.

## Setup

```bash
pnpm install
pnpm -r build      # engine and service; the api/ adapters resolve the built package
pnpm -r test       # engine + service suites
pnpm -r lint
```

The engine and service each have their own `test` and `typecheck` scripts; run
the one for the package you touched, plus a full `pnpm -r test` before opening a
PR.

## Adding a theme

Themes are the most welcome contribution, and the palette system is designed to
make them a small, safe diff: **a theme is data.** A palette is 17 named colour
slots (`engine/src/themes.ts`), and a theme pairs a dark and a light palette with
one flag for whether it has a night layer (fireflies and lantern glow).

1. **Read [dev/TASTE.md](dev/TASTE.md) §3 first.** It is the aesthetic contract -
   flat matte palettes, at most ~7 hues, one green family, a warm-neutral or deep
   ground. A theme that fails §2's anti-patterns (neon outside `yozakura`, drop
   shadows, clip-art crowns) will not merge.
2. **Add the palette(s)** in `engine/src/themes.ts`. Fill *every* slot even for a
   light-only theme - a half-filled palette is a landmine for the next renderer.
   Wire it into the `THEMES` record with its `dark`/`light`/`night` choice.
3. **Add the name** to `THEME_NAMES` in `engine/src/types.ts`. That is the single
   source of truth: the render option type, the service's URL validation
   (`service/src/params.ts`), and the site's theme picker all derive from it, so
   nothing else needs touching to make `?theme=yours` valid.
4. **Look at it.** `npx tsx engine/scripts/gate-2.ts` renders all six gallery
   fixtures across the non-`ink`/`dusk` themes to `dev/taste/gate-2/index.html`;
   add your theme to its list and open the file. A theme is judged by eye at full
   scale, not by its hex values.
5. **Run the golden harness.** `pnpm --filter @kodama/engine test` includes the
   golden suite. Goldens pin `ink` and `dusk` - the shipped themes - so *your*
   theme doesn't add goldens unless you also add it to `GOLDEN_THEMES`
   (`engine/test/helpers/golden.js`); do that only once it has passed a taste
   gate. What the golden suite proves for your PR is that you did **not** change
   the existing themes' output: if it goes red, your diff touched shared drawing
   code, not just a palette, and that needs explaining.
6. **Never bless a regression.** If you legitimately changed drawing shared by
   `ink`/`dusk`, regenerate goldens with `pnpm --filter @kodama/engine golden:update`
   and describe the visual change in the PR - the update script is deliberately
   separate from the test so a test run can never approve its own diff.

A new theme ships only after a **taste gate**: six images per theme, reviewed
one at a time against TASTE §5's "would you post this?" bar. See
[dev/taste/gate-2.md](dev/taste/gate-2.md) for the procedure and the current
pass.

## Data and privacy

kodama reads only public GitHub data and stores no user records - a change that
would read private data, persist anything keyed to a person beyond the short
render cache, or put user data in a URL or log line will not merge. `service/`'s
logging scrubs tokens and never logs a history's contents, only its hash; keep
it that way.

## What lives where

`dev/*.md` is the complete design and ships in the repo but never in a deploy;
read `dev/README.md` for the map. `engine/` is pure, `service/` is everything
impure, `site/` is the pages, `api/` is the thin Vercel adapters. Where the PRD
and a SPEC disagree, the SPEC wins.
