# kodama camo probe

Throwaway repo for **SPIKE-CAMO** (kodama IMPLEMENTATION 3.1). Each image below
is an SVG in this repo, served through **jsDelivr** (`cdn.jsdelivr.net`, a
third-party CDN that mirrors public GitHub repos). GitHub only routes
*third-party* image hosts through its camo proxy (`camo.githubusercontent.com`),
so jsDelivr reproduces the exact path a kodama badge on a real CDN will take -
`raw.githubusercontent.com` is first-party and would be served direct, bypassing
camo entirely.

Eyeball each one **on this rendered page** (light *and* dark GitHub theme, and
with OS reduced-motion both off and on). Then run `probe-camo.ps1` (or
`probe-camo.sh`) to record the served bytes and headers.

> If you renamed the repo or user, update the URLs below (or run
> `sed -i "s|orijitghosh/kodama-camo-probe|YOURUSER/YOURREPO|g" README.md`).

## a. CSS `@keyframes`
Expect: the orange dot slides left-right on a 3 s loop.

![a](https://cdn.jsdelivr.net/gh/orijitghosh/kodama-camo-probe@main/a-css-keyframes.svg)

## b. SMIL `<animate>`
Expect: the green dot slides across on a 3 s loop.

![b](https://cdn.jsdelivr.net/gh/orijitghosh/kodama-camo-probe@main/b-smil.svg)

## c. `prefers-color-scheme` (critical)
Expect: background is washi-cream in light theme, near-black in dark theme.
Toggle GitHub's theme (or your OS) to check.

![c](https://cdn.jsdelivr.net/gh/orijitghosh/kodama-camo-probe@main/c-prefers-color-scheme.svg)

## d. `prefers-reduced-motion`
Expect: the amber dot pulses; with OS "reduce motion" on, it holds still.

![d](https://cdn.jsdelivr.net/gh/orijitghosh/kodama-camo-probe@main/d-prefers-reduced-motion.svg)

## e. Oversized (~210 KB)
Expect: renders fully; the "tail-marker:END" text (bottom) proves nothing was
truncated.

![e](https://cdn.jsdelivr.net/gh/orijitghosh/kodama-camo-probe@main/e-oversized.svg)

## f. `<style>` + CSS custom properties
Expect: three green dots, coloured only via `var(--a/b/c)`.

![f](https://cdn.jsdelivr.net/gh/orijitghosh/kodama-camo-probe@main/f-style-vars.svg)
