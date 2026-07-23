/**
 * Renders one fixture large, for inspecting elements that are only a few pixels
 * across at true size - birds, blossoms, fireflies.
 *
 * Small elements are exactly the ones that fail silently: they are present in
 * the markup, pass every count assertion, and are invisible on the card. This
 * is the only way to see that.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "../src/render.js";
import { assertHistoryV1 } from "../src/validate.js";
import type { RenderOptions } from "../src/types.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures");
const outDir = resolve(import.meta.dirname, "../debug");
mkdirSync(outDir, { recursive: true });

const name = process.argv[2] ?? "whale";
const date = process.argv[3] ?? "2026-07-15";

const history = assertHistoryV1(
  JSON.parse(readFileSync(resolve(fixturesDir, `${name}.json`), "utf8")),
);

const opts: RenderOptions = {
  biome: "bonsai",
  theme: "ink",
  scale: "full",
  animate: false,
  tint: "none",
  locale: "en",
};

const svg = render(history, date, opts);

writeFileSync(
  resolve(outDir, "zoom.html"),
  `<!doctype html><meta charset="utf-8"><title>zoom · ${name}</title>
<style>
  body{background:#0c0e0d;color:#9aa39d;font:12px ui-monospace,monospace;margin:0;padding:16px}
  .wrap{width:1660px}
  svg{width:1660px;height:840px;display:block}
</style>
<p>${name} · ${date} · 2×</p>
<div class="wrap">${svg}</div>`,
  "utf8",
);

console.log(`wrote engine/debug/zoom.html (${name}, ${date})`);
