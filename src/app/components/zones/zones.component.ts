import { Component, Input, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { combineLatest, map, Observable } from 'rxjs';
import { AppState, GameActions, UIActions } from '../../store';
import {
  selectUIMode, selectPendingAttackers, selectSelectedPermId,
  selectCombatState, selectIsActivePlayer,
} from '../../store/selectors';
import { PermanentDto, CardDto, CardType } from '../../models/game.models';
import { CardComponent } from '../card/card.component';

@Component({
  selector: 'app-zones',
  standalone: true,
  imports: [CommonModule, CardComponent],
  templateUrl: './zones.component.html',
  styleUrls: ['./zones.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZonesComponent {
  @Input() permanents: PermanentDto[] = [];
  @Input() isOpponent = false;
  @Input() label = '';

  ui$ = combineLatest([
    this.store.select(selectUIMode),
    this.store.select(selectPendingAttackers),
    this.store.select(selectSelectedPermId),
    this.store.select(selectCombatState),
    this.store.select(selectIsActivePlayer),
  ]).pipe(
    map(([mode, pendingAttackers, selectedPermId, combat, isActive]) => ({
      mode, pendingAttackers, selectedPermId, combat, isActive,
    }))
  );

  dropActive = false;

  constructor(private store: Store<AppState>, private cdr: ChangeDetectorRef) {}

  get creatures(): PermanentDto[] {
    return this.permanents.filter(p =>
      p.sourceCard.cardTypes.includes(CardType.Creature)
    );
  }

  get nonCreatureNonLand(): PermanentDto[] {
    return this.permanents.filter(p =>
      !p.sourceCard.cardTypes.includes(CardType.Creature) &&
      !p.sourceCard.cardTypes.includes(CardType.Land)
    );
  }

  get lands(): PermanentDto[] {
    return this.permanents.filter(p =>
      p.sourceCard.cardTypes.includes(CardType.Land)
    );
  }

  isAttacking(permanentId: string, combat: any): boolean {
    return combat?.attackers?.includes(permanentId) ?? false;
  }

  isBlocking(permanentId: string, combat: any): boolean {
    const blockers = Object.values(combat?.attackersToBlockers ?? {}) as string[][];
    return blockers.some(list => list.includes(permanentId));
  }

  isPendingAttacker(permanentId: string, pendingAttackers: string[]): boolean {
    return pendingAttackers.includes(permanentId);
  }

  onCardClick(permanent: PermanentDto, mode: string, isActive: boolean, pendingAttackers: string[]): void {
    if (mode === 'declaring-attackers' && !this.isOpponent && isActive) {
      this.store.dispatch(UIActions.toggleAttacker({ permanentId: permanent.permanentId }));
    } else if (mode === 'declaring-blockers' && this.isOpponent) {
      // clicking an opponent creature while declaring blockers — handled by board
    } else if (!this.isOpponent && permanent.sourceCard.cardTypes.includes(CardType.Land)) {
      if (!permanent.isTapped) {
        this.store.dispatch(GameActions.activateMana({ permanentId: permanent.permanentId }));
      } else {
        this.store.dispatch(GameActions.untapLand({ permanentId: permanent.permanentId }));
      }
    } else {
      this.store.dispatch(UIActions.selectCard({ permanentId: permanent.permanentId }));
    }
  }

  onCardHover(card: CardDto): void {
    this.store.dispatch(UIActions.hoverCard({ card }));
  }

  onCardHoverLeave(): void {
    this.store.dispatch(UIActions.hoverCard({ card: null }));
  }

  onBattlefieldClick(): void {
    this.store.dispatch(UIActions.deselectCard());
  }

  onZoneDragOver(event: DragEvent): void {
    if (this.isOpponent) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    if (!this.dropActive) {
      this.dropActive = true;
      this.cdr.markForCheck();
    }
  }

  onZoneDragLeave(): void {
    this.dropActive = false;
    this.cdr.markForCheck();
  }

  onZoneDrop(event: DragEvent): void {
    if (this.isOpponent) return;
    event.preventDefault();
    this.dropActive = false;
    const cardId = event.dataTransfer?.getData('cardId');
    const isLand = event.dataTransfer?.getData('isLand') === '1';
    if (!cardId) return;
    if (isLand) {
      this.store.dispatch(GameActions.playLand({ cardId }));
    } else {
      this.store.dispatch(GameActions.castSpell({ cardId, targetIds: [] }));
    }
    this.cdr.markForCheck();
  }

  trackByPermanent(_: number, p: PermanentDto): string {
    return p.permanentId;
  }
}
