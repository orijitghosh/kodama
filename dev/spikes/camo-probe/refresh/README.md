# kodama camo refresh probe

Throwaway repo for the **SPIKE-CAMO residual** (D-025, closed at IMPLEMENTATION
4.5). SPIKE-CAMO established that camo forwards bytes verbatim. It could not
establish *how long camo holds a copy*, because every probe read `Age: 0`.

This repo answers that. Both images below are live kodama badges served from
Vercel - a third-party host, so GitHub routes them through
`camo.githubusercontent.com` (a `*.githubusercontent.com` source would bypass
camo entirely and measure nothing).

**The badge changes itself.** The rendered SVG prints its render date in the
header (`秋 · 2026-07-21`), so the bytes differ every UTC day whether or not the
account contributed. That is the change signal the probe watches - no commit,
no source edit, just two runs a day apart.

## full scale

![kodama full](https://kodama-sigma.vercel.app/orijitghosh.svg)

## button scale

A second entry under a different query string, to check that camo keys per-URL
and refreshes both on the same schedule.

![kodama button](https://kodama-sigma.vercel.app/orijitghosh.svg?scale=button)

---

Run `probe-camo-refresh.ps1` once now and once a day later. It records, for each
image, the date baked into camo's copy against the date baked into the origin's,
and prints how far behind camo is.
