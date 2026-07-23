/**
 * `GET /api/<user>.json` - the sidecar the receipts page reads (SPEC-SERVICE
 * §1, §5).
 *
 * This route breaks the 200-always rule on purpose. The image route answers 200
 * with a drawn explanation for every failure because its consumer is a README
 * `<img>`, where anything else is a broken-image icon. This endpoint is read by
 * `fetch()`, where the status code is what a caller branches on, so real codes
 * are more useful than a 200 carrying an error body.
 *
 * CORS is `*` because everything served is already public: the same figures
 * GitHub shows on the profile page, plus arithmetic. Restricting the origin
 * would protect nothing and would block rendering your own receipts on your own
 * site.
 */

import { receiptsFor, treeFacts } from "@kodama/engine";
import type { NormalizedHistory, Receipt, TreeFacts } from "@kodama/engine";

import type { Fetcher } from "./fetcher.js";
import { GitHubError } from "./github/client.js";
import { PoolExhaustedError } from "./github/pool.js";
import { isValidLogin, loginFromPath, parseOptions, restorePath } from "./params.js";
import { ENGINE_VERSION } from "./route.js";

/** Mirrors the image route's policy so the two cannot disagree about freshness. */
const CACHE_OK = "public, s-maxage=21600, stale-while-revalidate=86400, max-age=3600";
const CACHE_SOFT = "public, s-maxage=300, stale-while-revalidate=3600, max-age=60";

const JSON_TYPE = "application/json; charset=utf-8";

export interface FactsDeps {
  fetcher: Fetcher;
  today: () => string;
}

export interface FactsBody {
  v: 1;
  engine: string;
  login: string;
  /** The render date the facts were computed for, UTC. */
  date: string;
  /** True when GitHub failed and this is the copy we had (SPEC-SERVICE §4). */
  stale: boolean;
  facts: TreeFacts;
  receipts: Receipt[];
  history: NormalizedHistory;
}

export interface FactsError {
  error: "invalidLogin" | "notFound" | "unavailable";
  message: string;
}

export async function handleFacts(request: Request, deps: FactsDeps): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(),
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-max-age": "86400",
      },
    });
  }

  const url = restorePath(new URL(request.url), "json");
  const login = loginFromPath(url.pathname, "json");

  if (login === null) {
    return fail(400, "invalidLogin", "Expected /api/<user>.json.");
  }
  // The image route's own validation, reused: the site puts the same regex in
  // an HTML `pattern`, so all three refuse exactly the same strings.
  if (!isValidLogin(login)) {
    return fail(400, "invalidLogin", "Not a GitHub username.");
  }
  const { options } = parseOptions(url.searchParams);

  const today = deps.today();

  let history: NormalizedHistory;
  let stale: boolean;
  try {
    const result = await deps.fetcher.fetch(login, today);
    history = result.history;
    stale = result.source === "stale";
  } catch (err) {
    if (err instanceof GitHubError && err.kind === "notFound") {
      return fail(404, "notFound", "No such GitHub account.");
    }
    if (err instanceof GitHubError || err instanceof PoolExhaustedError) {
      return fail(503, "unavailable", "Upstream is unavailable; try again shortly.");
    }
    return fail(503, "unavailable", "Could not build this history.");
  }

  const facts = treeFacts(history, today);
  const body: FactsBody = {
    v: 1,
    engine: ENGINE_VERSION,
    login: history.login,
    date: today,
    stale,
    facts,
    // The same locale the image would have used, so the page's tooltips and
    // its `<img>` cannot end up in two different languages.
    receipts: receiptsFor(facts, options.locale),
    history,
  };

  return json(200, body, stale ? CACHE_SOFT : CACHE_OK);
}

// ---------------------------------------------------------------------------

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    // Public data, so nothing here is credentialed and nothing should be.
    "vary": "accept-encoding",
  };
}

function json(status: number, body: unknown, cache: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "content-type": JSON_TYPE,
      "cache-control": cache,
      "x-kodama-engine": ENGINE_VERSION,
    },
  });
}

function fail(status: number, error: FactsError["error"], message: string): Response {
  // Failures cache softly for the same reason the image route's do: a typo
  // fixed a minute later should not be frozen at every edge for six hours.
  return json(status, { error, message } satisfies FactsError, CACHE_SOFT);
}
