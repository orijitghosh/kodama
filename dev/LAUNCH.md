# LAUNCH - the v1 checklist (M0-M6)

The Definition of Done, made checkable. An item is `[x]` only when it is
*verified*, not merely built; `[ ]` means genuinely open. Items that need an
account, a card, or my own judgment are marked **[manual]**.

Source of truth for scope: IMPLEMENTATION.md "Definition of done (v1 launch =
M0-M6)". This file is where that definition is walked.

---

## 1. Code and CI gates

- [x] Engine determinism + property suites green (`pnpm --filter @kodama/engine test`).
- [x] Golden suite green - the drawing regression net for `ink`/`dusk`.
- [x] Taste Gate #1 passed with artifacts committed (`dev/taste/gate-1.md`, 24 SVGs).
- [x] Failure-injection suite: every error-table row returns 200 with a valid SVG.
- [x] Service adapters proven to export the Web `fetch` shape; `vercel.json`
      guarded against comment keys and rule-order regressions.
- [x] Lint clean across the workspace, engine purity enforced.
- [ ] **Full green run recorded here immediately before the production cutover**
      - `pnpm -r lint && pnpm -r build && pnpm -r test`, plus the site e2e
      (`pnpm --filter @kodama/site test:e2e`) and Lighthouse gate
      (`pnpm --filter @kodama/site lighthouse`, ≥95 perf/a11y).

## 2. Site

- [x] Landing funnel on a static Astro build (paste-a-URL in under 30 s, no scroll).
- [x] Receipts page - every drawn element traced to its number.
- [x] Grammar page (the launch post's canonical link) - 13 Tier-1 signals, each
      pointing at the element it draws.
- [x] Gallery - every judged specimen, served as cacheable SVG files.
- [x] Bare-login redirect (`/<user>` → `/tree/<user>`), catch-all last.
- [x] axe clean (wcag2a/2aa/21a/21aa) on landing, grammar, gallery.
- [x] **OG / Twitter card meta present and the card image renders** (6.4) -
      `Page.astro` emits `og:*` + `twitter:card`; `public/og.png` is a valid
      1200×630 PNG matching the declared dimensions. The card's URL line now
      reads `PUBLIC_KODAMA_ORIGIN` like `astro.config.mjs` instead of hardcoding
      a host, so it cannot advertise a domain that does not resolve.
- [x] Lighthouse ≥95 perf/a11y, measured 2026-07-23 against the built site on
      `astro preview`: landing 100/100, grammar 100/100, gallery 100/100
      (best-practices 96 on landing, reported but not gated). The harness now
      refuses to run without a server up - an unreachable page used to score 0
      in every category and read as a quality failure.
- [ ] Re-run Lighthouse against the deployed origin once live (§4). Preview and
      production differ in headers and CDN, so the numbers above are the floor,
      not the record.

## 3. Themes

- [x] `ink` and `dusk` shipped and gated (Gate #1).
- [x] **`paper` / `sakura` / `yozakura` / `shore` passed Taste Gate #2** -
      24/24, owner verdict recorded 2026-07-23 (`dev/taste/gate-2.md`). N3
      (in-SVG legend `textSecondary` on light themes) closed as no-change: the
      verdict was given on these renders with the note in view.
- [x] On pass: dropped the "drafts" note in `engine/src/themes.ts`, added
      `engine/test/taste-gate-2.test.ts` pinning the 24 approved renders, and
      added `gate` / `gate:2` scripts so a re-gate has a command to run.
      All six themes are now approved palettes.

## 4. Measurement (OPS.md §4, §4b)

- [x] Cold end-to-end p95 against 5 real logins, inside the 2 500 ms budget.
- [x] `x-vercel-cache: HIT` on the second request, byte-identical.
- [x] `/healthz` leaks no token material; reports `kind: upstash`, tokens > 0.
- [ ] **Cold p95 for an account under ten years, target ≤ 1.5 s** - every probe
      login so far is an old account; the young tier is unmeasured.
- [ ] **Camo refresh latency** - the SPIKE-CAMO residual (D-025). Recorder is
      prepped at `dev/spikes/camo-probe/refresh/`; needs two runs a day apart. **[manual]**
- [ ] Re-measure all budgets on the live origin (`kodama-sigma.vercel.app`) once
      the production deploy is up. Not blocked on a domain - §6 is deferred.
- [ ] Origin-request fan-out per badge - needs live README traffic; **cannot
      close before launch**, tracked as the largest error bar in OPS §2.

## 5. Alerting and ops (M6.2)

- [x] `/healthz` budget dashboard: per-account PAT budgets (never summed).
- [x] PAT 70% consumption alert; benched-token alert.
- [x] Image error-rate meter + alert (the only place a 200'd failure is counted).
- [x] Runbook written: rate-limit, KV outage, camo change, rollback = engine pin
      (OPS.md §6).
- [x] **Per-client cold-fetch cap and negative cache for unknown logins** (D-040)
      - the PRD's "per-IP cache-miss limits", the last unbuilt line of the cost
      model. Both fail open; a refused client still gets a tree and a
      `retry-after`. Runbook entry in OPS §6.1.
- [ ] **Uptime check configured to poll `/healthz` and page on a non-empty
      `alerts` array.** **[manual]**

## 6. Domain cutover (M6.4) - **DEFERRED, not a launch blocker**

**Decision 2026-07-23 (owner): launch on `kodama-sigma.vercel.app`. No domain is
being purchased for v1.** Every user-facing URL - README, site canonical/OG meta,
and the OG card's own URL line - now names that origin, so nothing advertises a
host that does not resolve. The steps below are kept for whenever a domain does
get bought; none of them gate launch.

When that day comes, the only build-side change is the origin, and it is now in
one place: `PUBLIC_KODAMA_ORIGIN`. Set it and rebuild - `astro.config.mjs`,
`Page.astro`, `index.astro`, and `site/scripts/og-card.ts` all read it. Then
regenerate the card (`pnpm --filter @kodama/site og`) and sweep `README.md`,
which is plain prose and not templated.

Prereq (manual steps): domain purchased (`kodama.dev`, or a fallback
`kodama.garden` / `growkodama.dev`) with DNS reachable.

1. **Add the domain in Vercel** - project → Settings → Domains → add `kodama.dev`
   and `www.kodama.dev`. Vercel shows the exact DNS records to set.
2. **Set DNS at the registrar** - an `A` record for the apex to Vercel's IP (or
   the registrar's ALIAS/ANAME to `cname.vercel-dns.com`), and a `CNAME` for
   `www`. Redirect `www` → apex (or the reverse) in Vercel so there is one
   canonical host.
3. **Wait for the certificate** - Vercel issues TLS automatically once DNS
   resolves; the domain shows "Valid Configuration" when ready.
4. **Set the canonical origin in the build.** Set `PUBLIC_KODAMA_ORIGIN` to
   `https://kodama.dev` - `astro.config.mjs`, `Page.astro`, `index.astro` and
   `site/scripts/og-card.ts` all read it, so canonical links, the OG meta, the
   card's own URL line, and the badge snippets follow in one move. Then
   `pnpm --filter @kodama/site og` to redraw the card, and sweep `README.md` by
   hand (prose, not templated). One commit, then redeploy.
5. **Verify the examples resolve.** Every URL in `README.md` and on the site uses
   `kodama.dev`; confirm `https://kodama.dev/<a-real-login>.svg`, `/grammar`,
   `/gallery`, `/tree/<login>`, and `/healthz` all answer on the live domain.
6. **Re-run the probe on the production domain** -
   `pnpm --filter @kodama/api probe https://kodama.dev` - and paste the numbers
   into OPS.md §4. Budgets are only "green on prod" once measured there.

## 7. Launch day - **[manual]**

- [ ] Post(s) with screenshots; the grammar page as the explainer link.
- [ ] Own kodama in the profile README (the first real badge in the wild).
- [ ] Watch `/healthz` and the Vercel/Upstash dashboards through the first spike.
- [ ] Community replies.

Success criteria past launch (PRD §Success criteria) are tracked at +7 d and
+30 d, not here.
