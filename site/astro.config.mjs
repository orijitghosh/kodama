// @ts-check
import { defineConfig } from "astro/config";

/**
 * Static-first (SPEC-SERVICE §5). The site has no server of its own: every page
 * is HTML at build time, and the only live thing on it is an `<img>` pointing at
 * the real API - which is the point, since that dogfoods the CDN path a README
 * takes.
 *
 * `site` is the canonical origin the copy-snippet pastes. It is also the origin
 * the preview image is fetched from, so a local `astro dev` shows real trees
 * instead of a broken image.
 */
export default defineConfig({
  site: process.env.PUBLIC_KODAMA_ORIGIN ?? "https://kodama-sigma.vercel.app",
  output: "static",
  // The functions in `api/` are the same deployment, so a build hash in the
  // filename is the only cache-busting the site needs.
  build: { assets: "_assets" },
  devToolbar: { enabled: false },
});
