import { Component, Input, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { combineLatest, map } from 'rxjs';
import { AppState, GameActions, UIActions } from '../../store';
import {
  selectUIMode,
  selectPendingAttackers,
  selectSelectedPermId,
  selectCombatState,
  selectIsActivePlayer,
} from '../../store/selectors';
import {
  PermanentDto,
  PermanentAbilityDto,
  CardDto,
  CardType,
  CombatStateDto,
} from '../../models/game.models';
import { CardComponent } from '../card/card.component';
import { ToastService } from '../../services/toast.service';
import { PlayLegalityService } from '../../game/play-legality.service';

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
      mode,
      pendingAttackers,
      selectedPermId,
      combat,
      isActive,
    })),
  );

  dropActive = false;

  constructor(
    private store: Store<AppState>,
    private cdr: ChangeDetectorRef,
    private toasts: ToastService,
    private legality: PlayLegalityService,
  ) {}

  /** Delegates to the rules service; the component only draws (see CLAUDE.md). */
  canAttack(p: PermanentDto): boolean {
    return this.legality.canAttack(p);
  }

  readyAbility(permanent: PermanentDto): PermanentAbilityDto | null {
    return this.legality.readyAbility(permanent);
  }

  private activate(permanent: PermanentDto, ability: PermanentAbilityDto): void {
    if (ability.targetCount > 0) {
      // CR 602.2b: the targets are chosen as the ability is activated, so the board has to ask
      // before it sends anything.
      this.store.dispatch(
        UIActions.enterTargetMode({
          sourceCardId: permanent.permanentId,
          targetCount: ability.targetCount,
          abilityId: ability.id,
        }),
      );
      return;
    }

    this.store.dispatch(
      GameActions.activateAbility({
        permanentId: permanent.permanentId,
        abilityId: ability.id,
        targetIds: [],
      }),
    );
  }

  get creatures(): PermanentDto[] {
    return this.permanents.filter((p) => p.sourceCard.cardTypes.includes(CardType.Creature));
  }

  get nonCreatureNonLand(): PermanentDto[] {
    return this.permanents.filter(
      (p) =>
        !p.sourceCard.cardTypes.includes(CardType.Creature) &&
        !p.sourceCard.cardTypes.includes(CardType.Land),
    );
  }

  get lands(): PermanentDto[] {
    return this.permanents.filter((p) => p.sourceCard.cardTypes.includes(CardType.Land));
  }

  isAttacking(permanentId: string, combat: CombatStateDto | null): boolean {
    return combat?.attackers?.includes(permanentId) ?? false;
  }

  isBlocking(permanentId: string, combat: CombatStateDto | null): boolean {
    const blockers = Object.values(combat?.attackersToBlockers ?? {}) as string[][];
    return blockers.some((list) => list.includes(permanentId));
  }

  isPendingAttacker(permanentId: string, pendingAttackers: string[]): boolean {
    return pendingAttackers.includes(permanentId);
  }

  onCardClick(
    permanent: PermanentDto,
    mode: string,
    isActive: boolean,
    _pendingAttackers: string[],
  ): void {
    // Picking a target for a spell that is waiting on one (CR 601.2c). Either side's
    // permanents: what is a legal target is the engine's to judge, not the board's.
    if (mode === 'targeting') {
      this.store.dispatch(UIActions.addTarget({ targetId: permanent.permanentId }));
      return;
    }

    if (mode === 'declaring-attackers' && !this.isOpponent && isActive) {
      if (!this.canAttack(permanent)) {
        this.toasts.show(this.legality.whyNotAttacking(permanent), 'warn', 4000);
        return;
      }
      this.store.dispatch(UIActions.toggleAttacker({ permanentId: permanent.permanentId }));
    } else if (mode === 'declaring-blockers' && this.isOpponent) {
      // clicking an opponent creature while declaring blockers — handled by board
    } else if (!this.isOpponent && this.readyAbility(permanent)) {
      this.activate(permanent, this.readyAbility(permanent)!);
    } else if (!this.isOpponent && permanent.sourceCard.cardTypes.includes(CardType.Land)) {
      // A land whose only ability is spent. The board has always offered to untap it here; the
      // rules have no such action, and the service says so rather than sending anything.
      this.store.dispatch(GameActions.untapLand({ permanentId: permanent.permanentId }));
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
    // OnPush: the drop highlight is component state, so clearing it has to be announced. On the
    // path below where there is no card id, nothing else marks the view and the glow stayed lit.
    this.cdr.markForCheck();

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
