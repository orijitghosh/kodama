/**
 * The designed failure states (SPEC-SERVICE §4).
 *
 * Every one of these is an HTTP 200 with a real image. A GitHub `<img>` given a
 * 4xx renders a broken-image glyph in someone's README, so the error table is
 * treated as a design surface rather than an exception path.
 *
 * They are drawn in the engine's theme system and sized to the requested scale,
 * so a failure still looks like part of the product.
 */

import { paletteStyles, slot, svgDocument, SCALE_SIZES, themeByName } from "@kodama/engine";
import type { Scale, ThemeName } from "@kodama/engine";

export type ErrorKind = "noSeed" | "notFound" | "comeBack" | "broken";

interface Copy {
  /** Drawn on the card at full and compact; the small scales get no text. */
  line: string;
  /** Spoken by assistive technology, always. */
  spoken: string;
  /** A seedling says "there could be a tree here later". A bare pot does not. */
  sprout: boolean;
}

const COPY: Record<string, Record<ErrorKind, Copy>> = {
  en: {
    noSeed: { line: "no seed here", spoken: "That is not a GitHub username.", sprout: false },
    notFound: { line: "user not found", spoken: "No GitHub user by that name.", sprout: false },
    comeBack: {
      line: "come back soon",
      spoken: "The garden could not be read just now. Try again shortly.",
      sprout: true,
    },
    broken: {
      line: "come back soon",
      spoken: "Something went wrong growing this tree. Try again shortly.",
      sprout: true,
    },
  },
  ja: {
    noSeed: { line: "種がありません", spoken: "GitHubのユーザー名ではありません。", sprout: false },
    notFound: { line: "見つかりません", spoken: "そのユーザーは見つかりませんでした。", sprout: false },
    comeBack: {
      line: "またあとで",
      spoken: "今は庭を読み込めませんでした。しばらくしてからお試しください。",
      sprout: true,
    },
    broken: {
      line: "またあとで",
      spoken: "木を育てる途中で問題が起きました。しばらくしてからお試しください。",
      sprout: true,
    },
  },
};

function copyFor(locale: string, kind: ErrorKind): Copy {
  const primary = locale.split("-")[0]?.toLowerCase() ?? "en";
  return (COPY[locale] ?? COPY[primary] ?? COPY["en"]!)[kind];
}

export interface ErrorSvgOptions {
  theme: ThemeName;
  scale: Scale;
  locale: string;
}

/** An empty pot, with a seedling when the state is "try again", not "no". */
export function errorSvg(kind: ErrorKind, options: ErrorSvgOptions): string {
  const { width, height } = SCALE_SIZES[options.scale];
  const copy = copyFor(options.locale, kind);
  const theme = themeByName(options.theme);

  const cx = width / 2;
  // The pot sits on the lower third at every scale, where a real tree's does.
  const potWidth = Math.min(width * 0.22, 96);
  const potHeight = Math.min(height * 0.18, 42);
  const potTop = height * (options.scale === "button" ? 0.42 : 0.58);
  const showText = options.scale === "full" || options.scale === "compact";

  const body = [
    `<rect width="${String(width)}" height="${String(height)}" fill="${slot("bg")}"/>`,
    `<rect x="0.5" y="0.5" width="${String(width - 1)}" height="${String(height - 1)}" fill="none" stroke="${slot("border")}" stroke-width="1" rx="6"/>`,
    // A trapezoid: the same silhouette the plastic pot tier draws.
    `<path d="M${String(cx - potWidth / 2)} ${String(potTop)}H${String(cx + potWidth / 2)}l${String(-potWidth * 0.12)} ${String(potHeight)}H${String(cx - potWidth / 2 + potWidth * 0.12)}Z" fill="${slot("trunk")}" opacity="0.55"/>`,
    `<rect x="${String(cx - potWidth / 2)}" y="${String(potTop - potHeight * 0.14)}" width="${String(potWidth)}" height="${String(potHeight * 0.14)}" fill="${slot("trunk")}" opacity="0.75"/>`,
    copy.sprout ? sprout(cx, potTop, potHeight) : "",
    showText
      ? `<text x="${String(cx)}" y="${String(potTop + potHeight + 28)}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" fill="${slot("textSecondary")}">${escape(copy.line)}</text>`
      : "",
  ].join("");

  return svgDocument(
    {
      width,
      height,
      title: copy.spoken,
      desc: copy.spoken,
      locale: options.locale,
      style: paletteStyles(theme),
    },
    body,
  );
}

/** Two leaves on a short stem - the smallest thing that reads as alive. */
function sprout(cx: number, potTop: number, potHeight: number): string {
  const stem = potHeight * 0.9;
  return [
    `<path d="M${String(cx)} ${String(potTop)}v${String(-stem)}" stroke="${slot("trunk")}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    `<ellipse cx="${String(cx - 6)}" cy="${String(potTop - stem * 0.75)}" rx="7" ry="4" fill="${slot("foliage2")}" transform="rotate(-20 ${String(cx - 6)} ${String(potTop - stem * 0.75)})"/>`,
    `<ellipse cx="${String(cx + 6)}" cy="${String(potTop - stem)}" rx="7" ry="4" fill="${slot("foliage1")}" transform="rotate(20 ${String(cx + 6)} ${String(potTop - stem)})"/>`,
  ].join("");
}

/**
 * The "cached" mark for a stale tree (SPEC-SERVICE §4).
 *
 * A small leaf in the corner rather than a banner: the tree on screen is the
 * user's real tree, just from yesterday. Anything louder would read as an
 * error, which this is not.
 */
export function markStale(svg: string, fetchedAt: string): string {
  const mark =
    `<g class="kd-stale" opacity="0.55">` +
    `<title>cached from ${escape(fetchedAt)}</title>` +
    `<path d="M14 20c0-4 3-7 7-7 0 4-3 7-7 7Z" fill="${slot("foliage3")}"/>` +
    `<path d="M14 20c1.6-1.6 3.4-2.8 5.2-3.6" stroke="${slot("trunk")}" stroke-width="0.8" fill="none" opacity="0.7"/>` +
    `</g>`;
  return svg.replace(/<\/svg>$/, `${mark}</svg>`);
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
