/**
 * Vercel function entrypoint for the tree image.
 *
 * Kept thin. Everything this file could contain lives in `@kodama/api` instead,
 * where it runs under vitest with no server, and a port to another host means
 * rewriting this adapter alone (D-007, D-032).
 *
 * The `fetch` shape is required. Vercel dispatches a bare
 * `export default function` to the Node.js `(request, response)` signature, so
 * a handler written that way is handed an `IncomingMessage` - whose `url` is a
 * bare path - and its returned `Response` is discarded. Exporting an object
 * with a `fetch` method selects the Web signature this package is written
 * against.
 *
 * `vercel.json` rewrites `/<user>.svg` here and moves the login into the query
 * string; `restorePath` inside the route puts it back, so the route only ever
 * sees the one URL shape.
 */

import { container, handleTree } from "@kodama/api";

export default {
  async fetch(request: Request): Promise<Response> {
    const c = container();
    return handleTree(request, { fetcher: c.fetcher, today: c.today, meter: c.meter });
  },
};
