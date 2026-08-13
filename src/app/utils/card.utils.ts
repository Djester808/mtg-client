import { CardDto, ManaColor } from '../models/game.models';

/** Formats the type line for a card, e.g. "Basic Land — Forest" or "Creature — Beast". */
/**
 * Reduces a collector number to a comparable numeric core.
 *
 * The two sides are written differently: a number read off a card is often zero-padded
 * ("0082") while Scryfall stores the canonical form ("82"), and printings carry variant
 * suffixes such as "82a" or "★82". Comparing the raw strings silently never matches.
 *
 * Mirrors CardVisionService.NormalizeCollectorNumber on the API.
 */
export function normalizeCollectorNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = /\d+/.exec(value)?.[0];
  if (!digits) return null;
  const trimmed = digits.replace(/^0+/, '');
  return trimmed === '' ? '0' : trimmed;
}

export function buildTypeLine(card: CardDto): string {
  const sup = card.supertypes?.length ? card.supertypes.join(' ') + ' ' : '';
  const types = card.cardTypes.join(' ');
  const sub = card.subtypes?.length ? ' — ' + card.subtypes.join(' ') : '';
  return sup + types + sub;
}

/**
 * The colors of a card's identity that fall outside a commander's — empty means legal.
 *
 * Colorless ('C') is never a violation: it is not a color, and colorless cards are
 * legal in any commander deck. This rule previously lived in four inline copies that
 * had drifted — only one excluded 'C', so the same card could pass the search panel's
 * check while the deck's validation bar flagged it.
 */
export function colorIdentityViolations(
  cardIdentity: readonly (ManaColor | string)[] | null | undefined,
  commanderIdentity: readonly (ManaColor | string)[] | null | undefined,
): string[] {
  const allowed = new Set((commanderIdentity ?? []).map((c) => String(c)));
  return (cardIdentity ?? []).map((c) => String(c)).filter((c) => c !== 'C' && !allowed.has(c));
}
