/**
 * The one rule for "does this card match the selected colour pips".
 *
 * Colour filtering had grown four separate implementations that disagreed with each other:
 * the collection/deck grid matched *any* selected colour, the commander list required the
 * identity to contain *all* of them, the forum list matched any, and the server matched
 * any. So picking Red on the collection grid listed every Boros, Grixis and five-colour
 * card that merely contained red. This module is the single answer; every caller delegates
 * here, and the server's `CardQuery.MatchesColor` mirrors it for the search endpoint.
 *
 * The rule is **"within these colours"**: a card matches when its whole colour identity
 * fits inside the selection. Red alone gives mono-red; Red+White gives mono-red, mono-white
 * and Boros. That is the question a deck-builder is actually asking — "what can I play in
 * these colours" — and it is Scryfall's `id<=rw`.
 *
 * Note this reads **colour identity**, not casting cost, which is why a card with no red
 * pip in its cost but a red activated ability counts as red. Grouping by "Color" uses cast
 * pips instead, so the two can legitimately disagree about the same card.
 */

const WUBRG = 'WUBRG';

/** The colourless pip. Its own bucket, not a sixth colour — see below. */
const COLORLESS = 'C';

/** The multicolour pip. A cardinality question, not a membership one. */
const MULTICOLOR = 'M';

/**
 * @param colorIdentity the card's colour identity, in any casing
 * @param selection the lit pips: any of W/U/B/R/G plus the pseudo-pips C and M
 */
export function matchesColorSelection(
  colorIdentity: readonly string[],
  selection: ReadonlySet<string>,
): boolean {
  if (selection.size === 0) return true;

  const identity = colorIdentity.map((c) => c.toUpperCase());
  const colors = new Set([...selection].filter((c) => WUBRG.includes(c)));
  const wantsMulti = selection.has(MULTICOLOR);
  const wantsColorless = selection.has(COLORLESS);

  // Colourless widens rather than narrows: lighting C asks to *also* see the cards that
  // belong to no colour, so it unions with the rest instead of competing with it. It has
  // to be tested before the colour branch, which deliberately excludes empty identities.
  if (wantsColorless && identity.length === 0) return true;

  if (colors.size > 0) {
    // The fix: every colour the card is must be one you asked for — not merely one of them.
    // An empty identity is excluded here so that picking Red does not list every artifact;
    // the C pip is how you ask for those.
    const fits = identity.length > 0 && identity.every((c) => colors.has(c));
    // M alongside colours reads as "the multicolour ones among these" — previously M
    // silently discarded the colour pips entirely while leaving them lit.
    return wantsMulti ? fits && identity.length >= 2 : fits;
  }

  if (wantsMulti) return identity.length >= 2;

  // Only C was lit, and this card has a colour.
  return false;
}

/**
 * The same selection as a search-query token (`c:rw`, `c:rwm`, `c:c`), for the callers that
 * filter server-side. Returns null when nothing is selected.
 *
 * The pseudo-pips ride along as letters — `m` and `c` are not colour letters, so there is
 * no ambiguity — which is what lets the server honour a combination like "multicolour,
 * within red and white" that the old one-token-wins encoding threw away.
 */
export function colorSelectionToken(selection: ReadonlySet<string>): string | null {
  if (selection.size === 0) return null;
  const order = [...WUBRG, COLORLESS, MULTICOLOR];
  const lit = order.filter((c) => selection.has(c));
  return lit.length > 0 ? `c:${lit.join('').toLowerCase()}` : null;
}
