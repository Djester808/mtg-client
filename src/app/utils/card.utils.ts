import { CardDto } from '../models/game.models';

/** Formats the type line for a card, e.g. "Basic Land — Forest" or "Creature — Beast". */
export function buildTypeLine(card: CardDto): string {
  const sup   = card.supertypes?.length  ? card.supertypes.join(' ') + ' ' : '';
  const types = card.cardTypes.join(' ');
  const sub   = card.subtypes?.length    ? ' — ' + card.subtypes.join(' ') : '';
  return sup + types + sub;
}
