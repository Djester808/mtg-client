import { CardDto, ChoiceDto } from '../../models/game.models';
import { LibraryInspectionPresentation } from './library-inspection-presentation';

describe('LibraryInspectionPresentation', () => {
  const card = (cardId: string, name: string): CardDto => ({ cardId, name }) as CardDto;
  it('groups offered instances first and sorts names without changing library or answer order', () => {
    const cards = Object.freeze([
      card('1', 'Forest'),
      card('2', 'Mountain'),
      card('3', 'Forest'),
      card('4', 'Island'),
    ]);
    const options = [
      { id: 'second', card: cards[1] },
      { id: 'first', card: cards[2] },
    ];
    const choice = { options, isOrdering: true } as ChoiceDto;
    const groups = LibraryInspectionPresentation.groups(cards, choice);
    expect(groups.map((group) => group.cards.map((c) => c.cardId))).toEqual([
      ['3', '2'],
      ['1', '4'],
    ]);
    expect(cards.map((c) => c.cardId)).toEqual(['1', '2', '3', '4']);
    expect(options.map((o) => o.id)).toEqual(['second', 'first']);
    expect(groups[0].label).toBe('Available in current prompt');
  });
  it('uses castable IDs only when no choice is pending and never adds unauthorized cards', () => {
    const cards = [card('1', 'Forest'), card('2', 'Island')];
    expect(LibraryInspectionPresentation.groups(cards, null, ['2', 'hidden'])[0]).toEqual({
      label: 'Available to cast',
      cards: [cards[1]],
    });
    expect(
      LibraryInspectionPresentation.groups(cards, { options: null } as ChoiceDto, ['2']),
    ).toEqual([{ label: null, cards }]);
  });
  it('groups only inspected playable lands and keeps pending choices authoritative', () => {
    const cards = [card('1', 'Forest'), card('2', 'Island')];
    expect(LibraryInspectionPresentation.groups(cards, null, [], ['2', 'hidden'])[0]).toEqual({
      label: 'Available to play',
      cards: [cards[1]],
    });
    expect(
      LibraryInspectionPresentation.groups(cards, { options: null } as ChoiceDto, [], ['2']),
    ).toEqual([{ label: null, cards }]);
  });
  it('handles empty lists, non-card options and equal names with stable instance order', () => {
    expect(LibraryInspectionPresentation.groups([])).toEqual([{ label: null, cards: [] }]);
    const cards = [card('2', 'Forest'), card('1', 'Forest')];
    expect(
      LibraryInspectionPresentation.groups(cards, { options: [{ id: 'none' }] } as ChoiceDto)[0]
        .cards,
    ).toEqual(cards);
    expect(LibraryInspectionPresentation.groups(cards, null, ['1', '2']).length).toBe(1);
  });
});
