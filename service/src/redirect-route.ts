/**
 * `GET /<user>` → 302 `/tree/<user>` (SPEC-SERVICE §1).
 *
 * This covers a bare kodama link pasted into Slack or a tweet. Without it,
 * `kodama.dev/octocat` is a 404; with it, the shortest URL anyone will type
 * lands on the receipts page.
 *
 * The route only ever sees paths that do not exist as files. The host checks
 * its filesystem before applying rewrites, so `/gallery` and `/grammar` are
 * served as pages and never arrive here, which is what makes claiming a
 * catch-all single segment safe. A redirect rule in `vercel.json` would run
 * before the filesystem check and would swallow both.
 *
 * 302 rather than 301: the destination of a bare login is a product decision
 * and 301 is close to irreversible in browser caches.
 */

import { isValidLogin, loginFromPath, restorePath } from "./params.js";

/** Not `CACHE_SOFT`: a redirect is cheap, and caching it hides a rename. */
const CACHE = "public, max-age=300";

export function handleUserRedirect(request: Request): Response {
  const url = restorePath(new URL(request.url), "bare");
  const login = loginFromPath(url.pathname, "bare");

  if (login === null || !isValidLogin(login)) {
    // Nothing here is a login and nothing on disk matched it either, so this
    // is a genuine 404 - and unlike the image route there is no `<img>` on the
    // other end to be disappointed by one.
    return new Response("Not found.\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": CACHE },
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: `/tree/${encodeURIComponent(login)}`,
      "cache-control": CACHE,
    },
  });
}
