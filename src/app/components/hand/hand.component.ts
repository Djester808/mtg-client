import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable, combineLatest, map } from 'rxjs';
import { AppState, GameActions, UIActions } from '../../store';
import {
  selectLocalPlayer,
  selectCurrentPhase,
  selectCurrentStep,
  selectIsActivePlayer,
  selectHasPriority,
  selectUIMode,
  selectSelectedCardId,
} from '../../store/selectors';
import { CardDto, Phase, Step, CardType } from '../../models/game.models';
import { CardComponent } from '../card/card.component';

interface HandCardVm {
  card: CardDto;
  isCastable: boolean;
  isSelected: boolean;
  rotationClass: string;
}

@Component({
  selector: 'app-hand',
  standalone: true,
  imports: [CommonModule, CardComponent],
  templateUrl: './hand.component.html',
  styleUrls: ['./hand.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HandComponent {
  vm$: Observable<{ cards: HandCardVm[]; count: number }>;

  private readonly FAN_ROTATIONS = [
    'r-10', 'r-7', 'r-4', 'r-1', 'r1', 'r4', 'r7', 'r10'
  ];

  constructor(private store: Store<AppState>) {
    this.vm$ = combineLatest([
      this.store.select(selectLocalPlayer),
      this.store.select(selectCurrentPhase),
      this.store.select(selectCurrentStep),
      this.store.select(selectIsActivePlayer),
      this.store.select(selectHasPriority),
      this.store.select(selectUIMode),
      this.store.select(selectSelectedCardId),
    ]).pipe(
      map(([player, phase, step, isActive, hasPriority, mode, selectedCardId]) => {
        const hand = player?.hand ?? [];
        const manaPool = player?.manaPool;
        const inMain = (phase === Phase.PreCombatMain || phase === Phase.PostCombatMain)
          && step === Step.Main;
        const stackEmpty = true; // simplification — full impl uses selectStackIsEmpty

        const cards: HandCardVm[] = hand.map((card, idx) => {
          const isLand = card.cardTypes.includes(CardType.Land);
          const canCastSorcery = isActive && hasPriority && inMain && stackEmpty;
          const canCastInstant = hasPriority && mode === 'idle';

          let isCastable = false;
          if (isLand) {
            isCastable = canCastSorcery && !(player?.hasLandPlayedThisTurn ?? false);
          } else {
            const hasFlash = card.keywords.includes('Flash');
            isCastable = hasFlash ? canCastInstant : canCastSorcery;
          }

          return {
            card,
            isCastable,
            isSelected: card.cardId === selectedCardId,
            rotationClass: this.FAN_ROTATIONS[Math.min(idx, this.FAN_ROTATIONS.length - 1)],
          };
        });

        return { cards, count: hand.length };
      })
    );
  }

  trackByCard(_: number, vm: HandCardVm): string {
    return vm.card.cardId;
  }

  onCardClick(card: CardDto): void {
    this.store.dispatch(UIActions.selectCard({ cardId: card.cardId }));
  }

  onCardHover(card: CardDto): void {
    this.store.dispatch(UIActions.hoverCard({ card }));
  }

  onCardHoverLeave(): void {
    this.store.dispatch(UIActions.hoverCard({ card: null }));
  }
}
