import { Injectable, inject } from '@angular/core';
import { CardDto, ChoiceDto } from '../models/game.models';
import { ChoiceSelectionService } from './choices/choice-selection.service';

/** Local ordering draft; never a server choice and never a second ordering algorithm. */
@Injectable()
export class LibraryArrangementDraftService {
  readonly selection = inject(ChoiceSelectionService);
  choice: ChoiceDto | null = null;
  private snapshot = '';

  begin(cards: readonly CardDto[], ownerId: string): void {
    this.cancel();
    if (
      cards.length < 2 ||
      cards.some((card) => card.ownerId !== ownerId) ||
      new Set(cards.map((card) => card.cardId)).size !== cards.length
    )
      return;
    this.snapshot = this.identity(cards);
    this.choice = {
      id: 'manual-library-order:' + crypto.randomUUID(),
      playerId: ownerId,
      kind: 'manual-library-order',
      prompt: 'Arrange library from top to bottom.',
      minPicks: cards.length,
      maxPicks: cards.length,
      isOrdering: true,
      isDivision: false,
      totalToDivide: 0,
      options: cards.map((card) => ({ id: card.cardId, label: card.name, card })),
    };
    this.selection.bind(this.choice);
    for (const card of cards) this.selection.select(this.choice, card.cardId);
  }

  reconcile(cards: readonly CardDto[], ownerId: string, allowed: boolean): void {
    if (
      this.choice &&
      (!allowed || this.choice.playerId !== ownerId || this.snapshot !== this.identity(cards))
    )
      this.cancel();
  }

  get order(): string[] | null {
    return this.choice && this.selection.canSubmit(this.choice) ? [...this.selection.picks] : null;
  }

  cancel(): void {
    this.choice = null;
    this.snapshot = '';
    this.selection.reset();
  }

  private identity(cards: readonly CardDto[]): string {
    return JSON.stringify(cards.map((card) => [card.cardId, card.ownerId]));
  }
}
