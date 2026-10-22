import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { AppState, GameActions, UIActions } from '../store';
import { CardDto, CardType } from '../models/game.models';
import { PlayLegalityService } from './play-legality.service';

/** Starts a permitted play through the same announcement and targeting flow in every zone. */
@Injectable({ providedIn: 'root' })
export class CardCastingService {
  constructor(
    private store: Store<AppState>,
    private legality: PlayLegalityService,
  ) {}
  start(card: CardDto): void {
    if (card.cardTypes.includes(CardType.Land)) {
      this.store.dispatch(GameActions.playLand({ cardId: card.cardId }));
      return;
    }
    const targetCount = this.legality.targetsOnCast(card) ? (card.targetCount ?? 1) : 0;
    if (card.announcesVariable) {
      this.store.dispatch(UIActions.enterAnnounceMode({ sourceId: card.cardId, targetCount }));
    } else if (targetCount > 0) {
      this.store.dispatch(UIActions.enterTargetMode({ sourceCardId: card.cardId, targetCount }));
    } else {
      this.store.dispatch(GameActions.castSpell({ cardId: card.cardId, targetIds: [] }));
      this.store.dispatch(UIActions.deselectCard());
    }
  }
}
