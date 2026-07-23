/**
 * Badge URL and snippet construction.
 *
 * Pure and browser-safe: the same functions run at build time for the no-JS
 * demo and in the browser to update the picker, so the snippet a visitor copies
 * comes from the same code as the one they looked at. Nothing here imports
 * `@kodama/api` - its defaults are passed in instead, since that package pulls
 * the whole service graph into a client bundle.
 */

export interface BadgeOptions {
  theme: string;
  scale: string;
  animate: boolean;
  tint: string;
  locale: string;
}

/** The subset of `RenderOptions` the picker exposes, in URL spelling. */
export type BadgeDefaults = BadgeOptions;

/**
 * Only non-default options reach the URL. A README line is something a person
 * reads, and `?theme=ink&scale=full&animate=auto&tint=none&locale=en` is five
 * facts that all mean "I changed nothing".
 */
export function badgeUrl(
  origin: string,
  login: string,
  options: BadgeOptions,
  defaults: BadgeDefaults,
): string {
  const url = new URL(`/${encodeURIComponent(login)}.svg`, origin);
  if (options.theme !== defaults.theme) url.searchParams.set("theme", options.theme);
  if (options.scale !== defaults.scale) url.searchParams.set("scale", options.scale);
  if (options.tint !== defaults.tint) url.searchParams.set("tint", options.tint);
  if (options.locale !== defaults.locale) url.searchParams.set("locale", options.locale);
  // `animate` is a tri-state in the URL grammar and a boolean here; only the
  // off case is worth spelling, since `auto` is what the default already means.
  if (options.animate !== defaults.animate) url.searchParams.set("animate", "off");
  return url.toString();
}

/** What the copy button puts on the clipboard: a README line, nothing else. */
export function markdownSnippet(login: string, url: string): string {
  return `![kodama tree for ${login}](${url})`;
}

/**
 * The shareable address of the landing page in a given configuration, so that
 * a link to a picked theme reopens on that theme. Distinct from `badgeUrl`:
 * this one carries the login as a query parameter and always spells every
 * option, because it is machinery rather than something anyone reads.
 */
export function permalinkQuery(login: string, options: BadgeOptions): string {
  const params = new URLSearchParams({
    user: login,
    theme: options.theme,
    scale: options.scale,
    tint: options.tint,
    animate: options.animate ? "auto" : "off",
  });
  return `?${params.toString()}`;
}
