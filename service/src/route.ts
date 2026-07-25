/**
 * The image route (SPEC-SERVICE §1-4).
 *
 * Written against the Web `Request`/`Response` pair rather than a framework's,
 * so it runs on Vercel's node runtime, runs in a test with no server, and
 * ports to Workers without touching this file (D-007's other half).
 *
 * The invariant it holds: every path returns 200 with a valid SVG. No branch
 * below returns a status code a README could render as a broken image.
 */

import { byteLength, fnv1a32, render } from "@kodama/engine";
import type { NormalizedHistory, RenderOptions, Scale } from "@kodama/engine";

import { errorSvg, markStale } from "./error-svg.js";
import type { ErrorKind } from "./error-svg.js";
import type { Fetcher } from "./fetcher.js";
import { ColdBudgetError, clientOf } from "./guard.js";
import { GitHubError } from "./github/client.js";
import { PoolExhaustedError } from "./github/pool.js";
import { warn } from "./log.js";
import type { Meter } from "./meter.js";
import { isValidLogin, loginFromPath, parseOptions, restorePath } from "./params.js";

/**
 * The grammar version, announced rather than silent (PRD §Engine versioning).
 *
 * v2 is species: the leaf mass, the autumn colour, the flower and the fruit now
 * follow the top language, and stars are drawn on every theme instead of only the
 * night ones. Every existing tree changes, which is exactly the case this header
 * and the changelog were put here for - and it is why rollback is a pin on this
 * value (OPS §6.4) rather than a revert of the drawing.
 */
export const ENGINE_VERSION = "v2";

/** Content type, byte-for-byte what camo proxied intact (SPIKE-CAMO). */
const SVG_TYPE = "image/svg+xml; charset=utf-8";

/**
 * A good tree caches for the full window. A failure caches for five minutes:
 * a user who fixes their typo, or an outage that ends, should not be frozen
 * into every CDN edge for six hours.
 */
const CACHE_OK = "public, s-maxage=21600, stale-while-revalidate=86400, max-age=3600";
const CACHE_SOFT = "public, s-maxage=300, stale-while-revalidate=3600, max-age=60";

export interface RouteDeps {
  fetcher: Fetcher;
  /** The request's UTC date. The only clock the render path sees. */
  today: () => string;
  /**
   * The renderer, injectable only so the failure-injection suite can exercise
   * the "engine threw" row of the error table. Production omits it.
   *
   * The alternative was contriving a history poisonous enough to crash the
   * engine, which pins the test to today's bugs rather than to the behaviour
   * the spec requires: a renderer that throws must still leave a picture.
   */
  render?: typeof render;
  /**
   * The error-rate meter. Optional so the failure-injection and unit suites can
   * drive the route without one; production always passes the container's.
   */
  meter?: Meter;
  /**
   * Wall clock, only ever used to turn a bench deadline into a `retry-after`
   * duration. The render path still sees nothing finer than `today()`.
   */
  nowMs?: () => number;
}

/**
 * Which terminal states count against the error rate.
 *
 * Only *our* failures, served as a 200 (route invariant), belong here:
 * `comeBack` is a fetch we could not complete (pool exhausted, GitHub down, KV
 * out), and `broken` is the engine throwing. A `notFound` or a `noSeed` is the
 * user asking for an account that does not exist or a name that cannot - the
 * service worked correctly and drew the right seedling, so it is not degradation
 * and must not drown out a real outage in the window.
 *
 * A client refused by the cold-fetch cap lands in `comeBack` and so does count.
 * That is deliberate: the cap only trips when something is hammering the origin,
 * and an operator wants to be told about that in the same breath as an outage.
 */
const DEGRADED_STATES = new Set(["comeBack", "broken"]);

export async function handleTree(request: Request, deps: RouteDeps): Promise<Response> {
  // Rewritten by the host before it reached us, if the host rewrites.
  const url = restorePath(new URL(request.url));
  const { options, date, warnings } = parseOptions(url.searchParams);
  const login = loginFromPath(url.pathname);

  // Refused before any API spend: an invalid name cannot become a valid user.
  // A bad name is the user's, not ours - it does not count against the rate.
  if (login === null || !isValidLogin(login)) {
    deps.meter?.record(false);
    return svgResponse(errorFor("noSeed", options), { warnings, cache: CACHE_SOFT });
  }

  const today = deps.today();

  // A pinned date may look backwards, never forwards: the history ends today,
  // so a future date would draw a dormancy and a broken streak that have not
  // happened yet.
  let renderDate = today;
  if (date !== null) {
    if (date <= today) renderDate = date;
    else warnings.push(`date=${date} is in the future; using today`);
  }

  let history: NormalizedHistory;
  let stale = false;

  try {
    const result = await deps.fetcher.fetch(login, today, clientOf(request));
    history = result.history;
    stale = result.source === "stale";
  } catch (err) {
    const state = kindFor(err);
    deps.meter?.record(DEGRADED_STATES.has(state));
    return svgResponse(errorFor(state, options), {
      warnings,
      cache: CACHE_SOFT,
      state,
      retryAfterS: retryAfterFor(err, (deps.nowMs ?? Date.now)()),
    });
  }

  try {
    const svg = (deps.render ?? render)(history, renderDate, options);
    // A served-stale image is success by design (D-030), not degradation.
    deps.meter?.record(false);
    return svgResponse(stale ? markStale(svg, history.fetchedAt) : svg, {
      warnings,
      cache: stale ? CACHE_SOFT : CACHE_OK,
      state: stale ? "stale" : "ok",
    });
  } catch (err) {
    // An engine throw is a bug in the renderer, and the history that triggered
    // it is the reproduction. Log its hash, never its contents.
    warn("engine threw while rendering", {
      login,
      historyHash: fnv1a32(JSON.stringify(history)).toString(16),
      reason: err instanceof Error ? err.message : "unknown",
    });
    deps.meter?.record(true);
    return svgResponse(errorFor("broken", options), {
      warnings,
      cache: CACHE_SOFT,
      state: "broken",
    });
  }
}

// ---------------------------------------------------------------------------

function kindFor(err: unknown): ErrorKind {
  if (err instanceof GitHubError) return err.kind === "notFound" ? "notFound" : "comeBack";
  if (err instanceof PoolExhaustedError) return "comeBack";
  return "comeBack";
}

/**
 * How long to tell the caller to wait, when the failure named a moment.
 *
 * Two failures know one: an exhausted pool is benched until GitHub's reset, and
 * a client over its cold-fetch allowance is held until its hour rolls (guard.ts).
 * Floored at a minute so the header agrees with the picture the seedling is
 * drawing ("come back soon"), capped at an hour because that is the longest
 * window either of them spans.
 *
 * It rides on a 200, so no cache acts on it - it is for the landing page and for
 * whoever is reading headers during an incident, not for camo.
 */
function retryAfterFor(err: unknown, nowMs: number): number | null {
  const retryAtMs =
    err instanceof PoolExhaustedError || err instanceof ColdBudgetError ? err.retryAtMs : null;
  if (retryAtMs === null) return null;
  const seconds = Math.ceil((retryAtMs - nowMs) / 1000);
  return Math.min(Math.max(seconds, 60), 3600);
}

function errorFor(kind: ErrorKind, options: RenderOptions): string {
  return errorSvg(kind, {
    theme: options.theme,
    scale: options.scale,
    locale: options.locale,
  });
}

interface ResponseOptions {
  warnings: string[];
  cache: string;
  state?: string;
  retryAfterS?: number | null;
}

function svgResponse(svg: string, options: ResponseOptions): Response {
  const headers = new Headers({
    "content-type": SVG_TYPE,
    "cache-control": options.cache,
    "x-kodama-engine": ENGINE_VERSION,
  });
  if (options.state !== undefined && options.state !== "ok") {
    headers.set("x-kodama-state", options.state);
  }
  if (options.retryAfterS !== undefined && options.retryAfterS !== null) {
    headers.set("retry-after", String(options.retryAfterS));
  }
  // Debuggability without breakage: the image is correct, the header explains
  // why it is not the one that was asked for.
  if (options.warnings.length > 0) headers.set("x-kodama-warn", options.warnings.join("; "));
  return new Response(svg, { status: 200, headers });
}

/** Size ceilings from SPEC-ENGINE §1, re-asserted on what actually ships. */
export const SIZE_CAPS: Record<Scale, number> = {
  full: 60_000,
  compact: 24_000,
  strip: 16_000,
  button: 4_000,
};

export { byteLength };
