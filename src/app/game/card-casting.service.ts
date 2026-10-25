import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { AppState, GameActions, UIActions } from '../store';
import { CardDto, CardType } from '../models/game.models';
import { PlayLegalityService } from './play-legality.service';
import { CastDraft } from '../store/ui/ui.reducer';

/** One pending spell, shared by hand and public-zone actions. Mana is added before submission. */
@Injectable({ providedIn: 'root' })
export class CardCastingService {
  constructor(
    private store: Store<AppState>,
    private legality: PlayLegalityService,
  ) {}
  start(card: CardDto): void {
    this.store.dispatch(
      card.cardTypes.includes(CardType.Land)
        ? GameActions.playLand({ cardId: card.cardId })
        : UIActions.beginCast({ card }),
    );
  }
  cost(draft: CastDraft): string {
    return draft.card.manaCost.replace(/\{X\}/gi, '{' + draft.x + '}');
  }
  targets(draft: CastDraft): number {
    return this.legality.targetsOnCast(draft.card) ? (draft.card.targetCount ?? 1) : 0;
  }
  continue(draft: CastDraft): void {
    const count = this.targets(draft);
    if (count) {
      this.store.dispatch(UIActions.setCastStage({ stage: 'targets' }));
      this.store.dispatch(
        UIActions.enterTargetMode({
          sourceCardId: draft.card.cardId,
          targetCount: count,
          variableValue: draft.x,
        }),
      );
    } else this.store.dispatch(UIActions.setCastTargets({ targets: [] }));
  }
}
