import { CardDto, ChoiceDto } from '../../models/game.models';

export interface LibraryInspectionGroup {
  label: string | null;
  cards: CardDto[];
}

/** Display order only: never changes the library or an ordered choice answer. */
export class LibraryInspectionPresentation {
  static groups(
    cards: readonly CardDto[],
    choice?: ChoiceDto | null,
    castableCards: readonly string[] = [],
    playableLands: readonly string[] = [],
  ): LibraryInspectionGroup[] {
    const available = new Set(
      choice
        ? (choice.options ?? []).flatMap((option) => (option.card ? [option.card.cardId] : []))
        : [...castableCards, ...playableLands],
    );
    const ordered = [...cards].sort((a, b) => a.name.localeCompare(b.name));
    const actionable = ordered.filter((card) => available.has(card.cardId));
    const inspectionOnly = ordered.filter((card) => !available.has(card.cardId));
    if (!actionable.length) return [{ label: null, cards: inspectionOnly }];
    return [
      {
        label: choice
          ? 'Available in current prompt'
          : playableLands.length
            ? 'Available to play'
            : 'Available to cast',
        cards: actionable,
      },
      ...(inspectionOnly.length ? [{ label: 'Other inspected cards', cards: inspectionOnly }] : []),
    ];
  }
}
