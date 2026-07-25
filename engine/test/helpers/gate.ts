/**
 * Normalisation shared by the two taste-gate suites.
 *
 * A gate approval attaches to a picture: twelve (then twenty-four) images looked
 * at one by one, with "would you post this?" answered yes. So the comparison has
 * to be byte-exact over everything drawn, and must not be over anything that is
 * not drawn - otherwise editing a sentence in the alt text reads as a demand to
 * re-hold a gate about how the tree looks.
 *
 * `<title>` and `<desc>` are that second category. They are the spoken
 * biography, they were never on screen during either gate, and they change for
 * reasons that have nothing to do with the drawing - a locale table growing, or
 * a claim being withdrawn because the element behind it is not rendered yet.
 * Stripping them is argued for here rather than absorbed by a looser matcher,
 * which is what the gate-1 suite asks of any tolerated difference.
 */

/** Removes the spoken biography, which no gate ever judged. */
export function withoutSpokenText(svg: string): string {
  return svg.replace(/<title>[^<]*<\/title>/g, "").replace(/<desc>[^<]*<\/desc>/g, "");
}
