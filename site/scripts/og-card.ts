/**
 * Renders the social share card to `public/og.png` (IMPLEMENTATION 6.4).
 *
 * A single static 1200×630 card for launch: the maintainer specimen (the fixture
 * carrying nearly every Tier-1 signal) beside the wordmark and the one-line
 * pitch, on the `ink` ground. The per-tree OG renderer is M8's `cards/` package;
 * until then every link preview shows this one card.
 *
 * Kept as a script rather than a hand-made image so the card regenerates from
 * the current engine: if the maintainer tree changes,
 * `pnpm --filter @kodama/site og` reproduces it instead of leaving a stale PNG
 * in `public/`.
 *
 * Uses the engine to draw the tree and Playwright (already a dev dependency for
 * the e2e suite) to rasterize the composed HTML at exactly card size.
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

import { renderSpecimen } from "../src/specimens.js";

const OUT = resolve(import.meta.dirname, "../public/og.png");
mkdirSync(resolve(import.meta.dirname, "../public"), { recursive: true });

/**
 * The card advertises a URL, so it has to track the origin the site is actually
 * built for - the same `PUBLIC_KODAMA_ORIGIN` (with the same default) that
 * `astro.config.mjs` reads. Hardcoding it here once meant the most-shared image
 * of the project could name a host that does not resolve, which no test would
 * ever catch: the PNG is bytes, and bytes do not 404.
 */
const ORIGIN = process.env.PUBLIC_KODAMA_ORIGIN ?? "https://kodama-sigma.vercel.app";
const HOST = ORIGIN.replace(/^https?:\/\//, "").replace(/\/$/, "");

// The maintainer at high summer, ink, static - the gallery's own hero render.
const tree = renderSpecimen({ fixture: "maintainer", theme: "ink", season: "summer" });

const html = `<!doctype html><meta charset="utf-8"><style>
  :root { color-scheme: dark; }
  html, body { margin: 0; }
  .card {
    width: 1200px; height: 630px; box-sizing: border-box;
    background: #101312; color: #e8e6e1;
    display: grid; grid-template-columns: 1fr 1fr; align-items: center;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .copy { padding: 0 0 0 72px; }
  .wordmark { font-size: 76px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
  .tagline { font-size: 32px; line-height: 1.3; color: #c9ccc6; margin: 20px 0 0; max-width: 15ch; }
  .url { font-family: ui-monospace, monospace; font-size: 22px; color: #9aa39d; margin-top: 40px; }
  .art { display: flex; align-items: center; justify-content: center; padding-right: 56px; }
  .art svg { width: 100%; height: auto; }
</style>
<div class="card">
  <div class="copy">
    <p class="wordmark">kodama&#x1F331;</p>
    <p class="tagline">Your GitHub life as a living bonsai.</p>
    <p class="url">${HOST}/&lt;you&gt;.svg</p>
  </div>
  <div class="art">${tree}</div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: "dark" });
await page.setContent(html);
await page.waitForTimeout(150);
await page.locator(".card").screenshot({ path: OUT });
await browser.close();

console.log(`wrote ${OUT}`);
