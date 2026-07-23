/**
 * Label tables and the spoken biography.
 *
 * `toLocaleString` and `Intl` are banned in the engine (SPEC-ENGINE §1): both
 * vary with the host's ICU build, so two servers could disagree on the same
 * user's bytes. Tables are small, explicit and identical everywhere.
 *
 * Every SVG carries a one-line spoken description, so a screen-reader user gets
 * the tree rather than the word "image".
 */

import type { Season, TreeFacts } from "./types.js";

export interface Labels {
  commits: string;
  streakDays: string;
  thisWeek: string;
  legendFoliage: string;
  legendFruit: string;
  legendBlossom: string;
  legendLanterns: string;
  legendShoots: string;
  legendUnripe: string;
  legendBird: string;
  legendFireflies: string;
  legendChime: string;
  seasons: Record<Season, string>;
}

const en: Labels = {
  commits: "commits",
  streakDays: "day streak",
  thisWeek: "this week",
  legendFoliage: "foliage: commits over time",
  legendFruit: "fruit: merged pull requests",
  legendBlossom: "blossom: current streak",
  legendLanterns: "lanterns: code reviews",
  legendShoots: "shoots: commits this week",
  legendUnripe: "green fruit: open pull requests",
  legendBird: "bird: issues closed",
  legendFireflies: "fireflies: stars received",
  legendChime: "wind chime: discussions",
  seasons: { spring: "spring", summer: "summer", autumn: "autumn", winter: "winter" },
};

const ja: Labels = {
  commits: "コミット",
  streakDays: "日連続",
  thisWeek: "今週",
  legendFoliage: "葉: これまでのコミット",
  legendFruit: "実: マージされたPR",
  legendBlossom: "花: 現在の連続日数",
  legendLanterns: "灯籠: コードレビュー",
  legendShoots: "新芽: 今週のコミット",
  legendUnripe: "青い実: オープンなPR",
  legendBird: "鳥: クローズした課題",
  legendFireflies: "蛍: 獲得したスター",
  legendChime: "風鈴: ディスカッション",
  seasons: { spring: "春", summer: "夏", autumn: "秋", winter: "冬" },
};

const TABLES: Record<string, Labels> = { en, ja };

/**
 * Resolves a BCP-47 tag to a label table, falling back through the primary
 * subtag to English. Unknown locales get a readable tree rather than an error.
 */
export function labelsFor(locale: string): Labels {
  const exact = TABLES[locale];
  if (exact !== undefined) return exact;
  const primary = locale.split("-")[0]?.toLowerCase() ?? "en";
  return TABLES[primary] ?? en;
}

export interface Biography {
  title: string;
  desc: string;
}

/** "Three-year tree, 1 247 commits, in blossom: 214-day streak". */
export function biographyFor(facts: TreeFacts, locale: string): Biography {
  const labels = labelsFor(locale);
  const years = Math.floor(facts.accountYears);
  const commits = facts.totals.commits;

  const age =
    years < 1
      ? "A seedling"
      : years === 1
        ? "A one-year tree"
        : `A ${String(years)}-year tree`;

  const clauses: string[] = [`${age}, ${String(commits)} ${labels.commits}`];

  if (facts.dormant) {
    clauses.push("resting: no activity for over ninety days, foliage kept");
  } else if (facts.ornaments.blossomClusters > 0) {
    clauses.push(`in blossom: ${String(facts.streak.current)}-day streak`);
  } else if (facts.ornaments.fallingPetals > 0) {
    clauses.push("petals falling after a streak ended");
  }

  if (facts.ornaments.fruit.length > 0) {
    const count = facts.ornaments.fruit.length;
    clauses.push(`${String(count)} ripening ${count === 1 ? "persimmon" : "persimmons"}`);
  }
  if (facts.ornaments.lanterns > 0) {
    clauses.push(`${String(facts.ornaments.lanterns)} lanterns for code reviews`);
  }

  const title = `${clauses.join(", ")}.`;

  const desc = [
    `A bonsai grown from the public GitHub history of ${facts.login}, drawn for ${facts.date}.`,
    `Season: ${labels.seasons[facts.season]}. Weather: ${facts.weather}.`,
    `Maturity level ${String(facts.maturity)} of 13, in a ${facts.potTier} pot.`,
    facts.plaques.length > 0
      ? `Plaques on the pot rim: ${facts.plaques.map((p) => p.kind).join(", ")}.`
      : "",
    "Every element is recomputable from public history; nothing here is random or purchasable.",
  ]
    .filter((line) => line !== "")
    .join(" ");

  return { title, desc };
}
