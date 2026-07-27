/**
 * The news entries.
 *
 * Reader-facing, not a changelog: an entry earns its place by changing something
 * a person can see on their own tree, not by being a release. "Refactored the
 * skeleton builder" is not news; "every tree now has a style" is.
 *
 * Kept as data rather than as prose in the page so the entries stay uniform and
 * the newest one can be surfaced elsewhere later without re-parsing HTML.
 *
 * Dates are the day the change reached readers, which is the deploy and not the
 * commit. An entry may be written before it ships - `published: false` keeps it
 * off the page until the deploy that makes it true.
 */

export interface NewsEntry {
  /** ISO date the change reached readers. */
  date: string;
  title: string;
  /** The engine version this shipped with, when it moved. */
  engine?: string;
  /** Paragraphs. Plain text; no markup is interpreted. */
  body: string[];
  /** One place to read more, rendered after the body. Prose stays link-free. */
  more?: { href: string; label: string };
  published: boolean;
}

export const NEWS: NewsEntry[] = [
  {
    date: "2026-07-27",
    title: "Every tree now has a style",
    engine: "v3",
    // True because this entry and the change it announces are the same deploy:
    // the site and the service ship together from one repo. The flag exists for
    // the other case - an entry written ahead of a change that lands separately -
    // and this one would be a lie only in the window between commit and push.
    published: true,
    body: [
      "Until today every kodama tree had the same outline and differed only in what was hanging on it - how many pads, which ornaments, what pot. Now the silhouette itself is derived. Fourteen bonsai styles, chosen from how an account actually works: whether the commits go to one long-lived project or thirty, whether they are spread across communities or concentrated, whether the rhythm is a metronome or a burst.",
      "This is the first change kodama has made to the shape of a tree that already existed. If yours looks different today, that is why - nothing broke, and nothing about your history changed. The style is read from public data like everything else here.",
      "Two things worth knowing. Accounts with less than a year of active weeks are drawn as a moss ball rather than a tree: there is not enough evidence to claim a style, and inventing one would be the dishonest option. And moyogi, the informal upright, is the tree kodama has always drawn - if that is what you get, it is the fallback doing its job, not a failure.",
      "The style is recomputed every time the tree is drawn, so it follows your work rather than being assigned once. It is not a ranking, there is no rare one, and none of it is purchasable.",
    ],
    more: { href: "/styles", label: "All fourteen styles, and what each one reads as" },
  },
];

/** Newest first, and only what has actually shipped. */
export function publishedNews(): NewsEntry[] {
  return NEWS.filter((entry) => entry.published).sort((a, b) => b.date.localeCompare(a.date));
}
