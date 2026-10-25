import { CollectionCardDto } from '../models/game.models';
import { DeckDetailDto } from '../services/deck-api.service';

/** Shared selection identity for every deck view; eligibility is validated by the API. */
export class DeckCommanders {
  static isSelected(deck: DeckDetailDto, card: CollectionCardDto): boolean {
    return (
      card.oracleId === deck.commanderOracleId || card.oracleId === deck.secondaryCommanderOracleId
    );
  }

  static cards(deck: DeckDetailDto): CollectionCardDto[] {
    return deck.cards.filter(
      (card) => (card.board ?? 'main') === 'main' && this.isSelected(deck, card),
    );
  }

  static candidates(deck: DeckDetailDto): CollectionCardDto[] {
    const seen = new Set<string>();
    return deck.cards.filter((card) => {
      if (
        (card.board ?? 'main') !== 'main' ||
        card.oracleId === deck.commanderOracleId ||
        seen.has(card.oracleId) ||
        !card.cardDetails?.supertypes?.includes('Legendary')
      )
        return false;
      seen.add(card.oracleId);
      return true;
    });
  }
}
