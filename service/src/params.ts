/**
 * Request validation (SPEC-SERVICE §1).
 *
 * Two different jobs with two different answers. The username is checked
 * against GitHub's own rule before any API spend, and a bad one is refused -
 * with an image, but refused. Every option is best-effort: an unknown
 * value falls back to the default and says so in `X-Kodama-Warn`, because a
 * typo in `theme=inkk` should still leave a tree in the README.
 */

import { BIOMES, isValidDate, SCALES, THEME_NAMES } from "@kodama/engine";
import type { Biome, RenderOptions, Scale, ThemeName } from "@kodama/engine";

/**
 * GitHub's rule: 1-39 chars, alphanumeric or hyphen, no leading hyphen.
 *
 * The hyphen is escaped, which JavaScript does not require here - but the site
 * puts this exact source string in an HTML `pattern` attribute, and browsers
 * compile that with the `v` flag, under which a trailing unescaped `-` in a
 * character class is a syntax error. A `pattern` that fails to compile is not
 * reported anywhere: the browser silently drops the constraint and the field
 * accepts everything. Escaping costs nothing and is identical in every mode.
 */
// eslint-disable-next-line no-useless-escape -- useless here, load-bearing in `v` mode
export const LOGIN_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,38})$/;

export function isValidLogin(value: string): boolean {
  // GitHub also refuses a trailing hyphen and doubled hyphens; the pattern
  // above is the documented one, and the API rejects the rest for us.
  return LOGIN_PATTERN.test(value);
}

/** The two public URL shapes a login can arrive in. */
export type RouteShape = "svg" | "json" | "bare";

const SHAPES: Record<RouteShape, { pattern: RegExp; path: (login: string) => string }> = {
  svg: { pattern: /^\/([^/]+)\.svg$/, path: (login) => `/${login}.svg` },
  json: { pattern: /^\/api\/([^/]+)\.json$/, path: (login) => `/api/${login}.json` },
  // A bare login has no suffix to recognise it by, so anything with a dot in
  // it is excluded: that is what tells `/octocat` apart from `/favicon.ico`.
  bare: { pattern: /^\/([^/.]+)$/, path: (login) => `/${login}` },
};

/** `/<user>.svg` → `user`. Returns null when the path is not a tree request. */
export function loginFromPath(pathname: string, shape: RouteShape = "svg"): string | null {
  const match = SHAPES[shape].pattern.exec(decodeURIComponent(pathname));
  return match?.[1] ?? null;
}

/**
 * Undo a host's path rewrite before the route sees the request.
 *
 * Vercel rewrites `/<user>.svg` to the function path and moves the named
 * segment into the query string, so the handler is asked for `/api/tree?user=`
 * - a path `loginFromPath` correctly refuses, which would draw "no seed here"
 * for every user on the internet.
 *
 * Restoring the path here rather than teaching the route about `?user=` keeps
 * the route's contract to one shape, and keeps the rewrite a deployment detail
 * that the next host can spell differently. A request that already has the
 * real path is returned untouched, so a direct call and a rewritten one arrive
 * identical.
 */
export function restorePath(url: URL, shape: RouteShape = "svg"): URL {
  if (loginFromPath(url.pathname, shape) !== null) return url;
  const user = url.searchParams.get("user");
  if (user === null) return url;

  const restored = new URL(url);
  restored.searchParams.delete("user");
  // The login goes through encodeURIComponent, so a path separator smuggled
  // into the query cannot become one in the pathname.
  restored.pathname = SHAPES[shape].path(encodeURIComponent(user));
  return restored;
}

export interface ParsedOptions {
  options: RenderOptions;
  /**
   * The day to draw, from `?date=`, or null for today.
   *
   * The history is always the current one; only the calendar the engine reads
   * moves. That is what makes a pinned date a view of a real past rather than
   * an invented one - the counts are today's, the date they are judged against
   * is the caller's.
   */
  date: string | null;
  /** One entry per parameter that was supplied but not understood. */
  warnings: string[];
}

/**
 * Exported because the site's picker has to know which values are defaults: a
 * snippet that spells out `?theme=ink&scale=full&animate=auto` when those are
 * already the defaults is noise in someone's README. The site reads this rather
 * than restating it, so the two cannot drift.
 */
export const OPTION_DEFAULTS: RenderOptions = {
  biome: "bonsai",
  theme: "ink",
  scale: "full",
  animate: true,
  tint: "none",
  locale: "en",
};

/** BCP-47 shape only - the label table does its own fallback. */
const LOCALE_PATTERN = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/;

export function parseOptions(params: URLSearchParams): ParsedOptions {
  const warnings: string[] = [];

  const pick = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
    const raw = params.get(name);
    if (raw === null) return fallback;
    if ((allowed as readonly string[]).includes(raw)) return raw as T;
    warnings.push(`${name}=${raw} is not a known value; using ${fallback}`);
    return fallback;
  };

  const theme = pick<ThemeName>("theme", THEME_NAMES, OPTION_DEFAULTS.theme);
  const scale = pick<Scale>("scale", SCALES, OPTION_DEFAULTS.scale);
  const biome = pick<Biome>("biome", BIOMES, OPTION_DEFAULTS.biome);
  const tint = pick<"lang" | "none">("tint", ["lang", "none"], OPTION_DEFAULTS.tint);

  // `animate=auto` is the documented default and means "let the client decide";
  // the engine takes a boolean, so the media query in the emitted CSS is what
  // actually honours prefers-reduced-motion (D-026).
  const rawAnimate = params.get("animate");
  let animate = OPTION_DEFAULTS.animate;
  if (rawAnimate !== null) {
    if (rawAnimate === "off" || rawAnimate === "false") animate = false;
    else if (rawAnimate === "on" || rawAnimate === "true" || rawAnimate === "auto") animate = true;
    else warnings.push(`animate=${rawAnimate} is not a known value; using auto`);
  }

  // `lang` and `locale` are the same knob. `locale` is what the picker emits
  // and the spec's canonical name; `lang` is the shorter name the README and
  // PRD have always shown, so both resolve here rather than one silently doing
  // nothing. `locale` wins if a caller somehow sends both.
  const rawLocale = params.get("locale") ?? params.get("lang");
  const localeName = params.has("locale") ? "locale" : "lang";
  let locale = OPTION_DEFAULTS.locale;
  if (rawLocale !== null) {
    if (LOCALE_PATTERN.test(rawLocale)) locale = rawLocale;
    else warnings.push(`${localeName}=${rawLocale} is not a language tag; using ${OPTION_DEFAULTS.locale}`);
  }

  // A calendar date, not a timestamp: the engine's whole date layer is civil
  // "YYYY-MM-DD" arithmetic (D-014), so anything with a clock in it is refused
  // rather than truncated into something that looks accepted.
  const rawDate = params.get("date");
  let date: string | null = null;
  if (rawDate !== null) {
    if (isValidDate(rawDate)) date = rawDate;
    else warnings.push(`date=${rawDate} is not a YYYY-MM-DD calendar date; using today`);
  }

  return { options: { biome, theme, scale, animate, tint, locale }, date, warnings };
}
