import { isoWeekOf } from "@kodama/engine";
import type { NormalizedHistory } from "@kodama/engine";

export const TODAY = "2026-07-21";

/**
 * A history dense enough to earn most of the grammar, so the receipts page has
 * something to be interrogated about.
 *
 * Built with the engine rather than hand-written JSON: the page's whole claim
 * is that the SVG's classes and the JSON's receipts describe the same tree, and
 * a stub SVG written by hand would let that claim pass while being false.
 */
export function richHistory(login = "hana"): NormalizedHistory {
  const weeks: NormalizedHistory["weeks"] = [];
  for (let i = 200; i >= 0; i -= 1) {
    const day = new Date(Date.UTC(2026, 6, 21) - i * 7 * 86_400_000);
    const iso = day.toISOString().slice(0, 10);
    weeks.push({ w: isoWeekOf(iso), c: 5 + (i % 11) });
  }

  return {
    v: 2,
    login,
    fetchedAt: TODAY,
    createdAt: "2013-05-02",
    weeks,
    totals: {
      commits: 4200,
      prsMerged: 190,
      prsOpen: 4,
      reviews: 320,
      issuesClosed: 480,
      discussions: 60,
      starsReceived: 12_000,
    },
    streak: { current: 95, longest: 140, lastActiveDate: TODAY },
    recentPRs: [
      { mergedAt: TODAY, bucket: 3 },
      { mergedAt: "2026-07-01", bucket: 2 },
      { mergedAt: "2026-06-10", bucket: 1 },
    ],
    languages: [
      { name: "TypeScript", share: 0.6 },
      { name: "Rust", share: 0.3 },
    ],
    repoMix: {
      hhi: 0.28,
      ownShare: 0.62,
      breadth: 12,
      orgs: 3,
      anchor: { nameWithOwner: `${login}/atlas`, years: 9, share: 0.41 },
    },
  };
}
