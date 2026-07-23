# SPIKE-CAMO - findings

Milestone: IMPLEMENTATION 3.1. Question: what does GitHub's camo image proxy do
to a kodama badge embedded in a profile README - does it preserve the bytes,
the content type, animation, and the `prefers-color-scheme` media query the
dual-theme card (D-006) depends on?

Run date: 2026-07-20.

---

## Method

A throwaway public repo (`orijitghosh/kodama-camo-probe`) held six probe SVGs,
each carrying a `<!-- probe:NAME -->` marker and a visible render tell, embedded
in its README:

- **a - CSS `@keyframes`**: an orange dot sliding on a 3 s loop.
- **b - SMIL `<animate>`**: a green dot sliding on a 3 s loop.
- **c - `prefers-color-scheme`**: background washi-cream in light, near-black in dark.
- **d - `prefers-reduced-motion`**: an amber dot that pulses, holding still when OS reduce-motion is on.
- **e - oversized (~210 KB)**: a `tail-marker:END` text node at the very bottom, present only if nothing was truncated.
- **f - `<style>` + CSS custom properties**: three dots coloured only via `var(--a/b/c)`.

Two things were measured: a human eyeball of each render on the live README
(both GitHub themes, reduce-motion off and on), and a read-only recorder
(`probe-camo.ps1`) that pulled the rendered README HTML, extracted the camo URLs
GitHub rewrote each image to, and compared camo-served bytes against the source
bytes, plus content-type, cache Age, and tail-marker survival.

### Correction mid-spike - camo only proxies third-party hosts

The probes were first referenced by their `raw.githubusercontent.com` URLs. The
recorder found **zero** camo URLs and every image rendered - because
`raw.githubusercontent.com` is a **first-party GitHub domain and is served
direct, never routed through camo**. Camo exists to proxy *third-party* image
hosts (hiding the viewer's IP, forcing https). The fix was to serve the same
SVGs through **jsDelivr** (`cdn.jsdelivr.net/gh/<user>/<repo>@main/<file>`), a
third-party CDN mirroring the public repo; GitHub then rewrote each to a
`camo.githubusercontent.com` URL, and the spike could observe the real path.

This matters beyond the spike: the production kodama badge is served from a
third-party host (Vercel), so it **will** be camo-proxied - the path this spike
now reproduces. A badge served from any `*.githubusercontent.com` URL would
bypass camo entirely.

## Results

Recorder output (bytes are UTF-8 byte counts; Age in seconds):

```
PROBE                       SRC_BYTES     SERVED CONTENT_TYPE             AGE    TRUNC?
probe:css-keyframes               551        551 image/svg+xml            0      n/a
probe:smil                        413        413 image/svg+xml            0      n/a
probe:prefers-color-scheme        591        591 image/svg+xml            0      n/a
probe:prefers-reduced-motion      721        721 image/svg+xml            0      n/a
probe:oversized                218307     218307 image/svg+xml            0      no
probe:style-vars                  506        506 image/svg+xml            0      n/a
```

Render eyeball (live README, through camo): **a, b, c, d, e, f all pass** -
CSS animation runs, SMIL runs, the background flips with theme, the pulse stops
under reduce-motion, the oversized SVG renders with its tail marker, and the
`<style>`/`var()` dots colour correctly.

## What camo does

Camo is a **transparent, verbatim byte proxy**. For every probe the served byte
count equalled the source byte count exactly (including the 218,307-byte
oversized SVG), the `image/svg+xml` content-type was preserved, and no
truncation occurred. Camo does not parse, re-encode, minify, rasterise, or
strip the SVG - it forwards the exact bytes and sets caching headers.

Because GitHub embeds README images the same way (`<img src=...>`, SVG in secure
animated mode) regardless of whether the bytes arrive from raw or from camo,
and because camo does not alter the bytes, **every rendering capability that
works direct also works through camo**:

| Probe | Capability | Through camo |
|---|---|---|
| a | CSS `@keyframes` animation | survives |
| b | SMIL `<animate>` | survives |
| c | `prefers-color-scheme` (D-006 dual theme) | **survives** |
| d | `prefers-reduced-motion` | survives |
| e | ~210 KB SVG, no truncation | survives |
| f | `<style>` + CSS custom properties | survives |

## Decisions

- **D-006 dual-theme single SVG holds.** Probe c passed through camo, so one SVG
  serves both GitHub themes via `prefers-color-scheme`. The dual-image fallback
  is **not** needed and is dropped from M3.1's acceptance path.
- **Animation is cleared for M3.2.** CSS and SMIL both survive; the animation
  layer (sway/petals/fireflies/snow) can rely on the `<img>` secure-animated
  mode. The flash-ceiling rule (no animation < 3 s) is a taste/accessibility
  constraint, unaffected by camo.
- **Size is a non-issue.** Camo forwarded 210 KB untouched; kodama SVGs are
  KB-scale, orders of magnitude under camo's ceiling.
- See **D-025** (host must be third-party for the badge to be proxied; a
  first-party host bypasses camo).

## Residual - camo cache freshness (deferred to M4.5)

The one thing this spike could not settle is **cache behaviour over time**. Age
read 0 on every probe (fresh fetch, just primed), so the spike observed *that*
camo caches, not *how long* it holds a stale copy or whether it honours upstream
`Cache-Control` for the daily-updating bonsai. jsDelivr's own caching also sits
in front of camo here, so any TTL measured now would be jsDelivr's, not the
production host's.

This is a host-tuning question, not a camo blocker: kodama must set appropriate
`Cache-Control` on the Vercel response and confirm the badge refreshes within a
day through camo. Deferred to **M4.5** (test against the real deployment); see
OPS notes. It does not gate M3.2.

**Probe prepped 2026-07-21** - `dev/spikes/camo-probe/refresh/`, against the
live deployment rather than jsDelivr, so the TTL measured is the production
host's. The design turned out simpler than the residual assumed: no source
change is needed between readings, because the rendered SVG prints its render
date in the header and therefore differs every UTC day by itself. The recorder
reads the date out of camo's copy and the origin's copy back to back and reports
the gap.

One finding landed before the probe ran, and it sharpens the question. **Vercel
strips `s-maxage` and `stale-while-revalidate` from the response it sends
downstream**; camo receives `public, max-age=3600`, and no `ETag`. So camo is
being handed an explicit one-hour ceiling, not the six-hour one in the route,
and it has no cheap way to revalidate. A stale reading on day 1 would mean camo
overriding a specific instruction rather than filling a silence.

## Evidence - camo URLs observed

```
https://camo.githubusercontent.com/aa0712c1.../.../a-css-keyframes.svg
https://camo.githubusercontent.com/d009ef57.../.../b-smil.svg
https://camo.githubusercontent.com/34c15b8f.../.../c-prefers-color-scheme.svg
https://camo.githubusercontent.com/8aaf3b90.../.../d-prefers-reduced-motion.svg
https://camo.githubusercontent.com/53bc4f88.../.../e-oversized.svg
https://camo.githubusercontent.com/0dc38395.../.../f-style-vars.svg
```

(Each camo path hex-encodes its upstream `cdn.jsdelivr.net/gh/orijitghosh/kodama-camo-probe@main/<file>` URL.)

Probe repo and recorder scaffolding: `dev/spikes/camo-probe/`. The repo itself
is throwaway and deleted after recording.
