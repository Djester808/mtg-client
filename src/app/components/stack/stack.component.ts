import { CardOptionsMenuComponent } from '../card-options-menu/card-options-menu.component';
import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { combineLatest, map } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { AppState, GameActions } from '../../store';
import {
  selectStack,
  selectPlayers,
  selectHasPriority,
  selectStackIsEmpty,
  selectCurrentPhase,
  selectCurrentStep,
  selectIsActivePlayer,
  selectIsTargeting,
} from '../../store/selectors';
import { UIActions } from '../../store/ui/ui.actions';
import { StackObjectDto } from '../../models/game.models';

@Component({
  selector: 'app-stack',
  standalone: true,
  imports: [CommonModule, CardOptionsMenuComponent],
  templateUrl: './stack.component.html',
  styleUrls: ['./stack.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StackComponent {
  contextStack: StackObjectDto | null = null;
  contextX = 0;
  contextY = 0;
  options(event: MouseEvent, obj: StackObjectDto): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextStack = obj;
    this.contextX = event.clientX;
    this.contextY = event.clientY;
    this.cdr.markForCheck();
  }
  optionsKey(event: KeyboardEvent, obj: StackObjectDto): void {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    event.stopPropagation();
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.options(new MouseEvent('contextmenu', { clientX: r.left, clientY: r.bottom }), obj);
  }
  inspect(): void {
    if (this.contextStack)
      this.store.dispatch(UIActions.selectCard({ cardId: this.contextStack.stackObjectId }));
    this.contextStack = null;
    this.cdr.markForCheck();
  }

  stack$ = combineLatest([this.store.select(selectStack), this.store.select(selectPlayers)]).pipe(
    map(([stack, players]) =>
      [...stack].reverse().map((obj) => ({
        ...obj,
        caster: players.find((p) => p.playerId === obj.controllerId)?.name ?? 'Unknown player',
      })),
    ),
  );
  hasPriority$ = this.store.select(selectHasPriority);
  isEmpty$ = this.store.select(selectStackIsEmpty);
  phase$ = this.store.select(selectCurrentPhase);
  step$ = this.store.select(selectCurrentStep);
  isActive$ = this.store.select(selectIsActivePlayer);

  constructor(
    private store: Store<AppState>,
    private cdr: ChangeDetectorRef,
  ) {}
  dismiss(): void {
    this.contextStack = null;
    this.cdr.markForCheck();
  }
  inspectObject(obj: StackObjectDto): void {
    this.store.dispatch(UIActions.selectCard({ cardId: obj.stackObjectId }));
  }
  trackTarget(_: number, target: { id: string }): string {
    return target.id;
  }

  /** True while a spell is looking for a target, which is when these become pickable. */
  isTargeting$ = this.store.select(selectIsTargeting);

  /**
   * Picking a spell on the stack as a target (CR 115.4).
   *
   * A Counterspell targets a spell, and a spell has no card on the battlefield to tap — it is
   * only here. Without this the board could target permanents and players and nothing else, so
   * a Counterspell could never be cast at all.
   */
  pick(obj: StackObjectDto): void {
    this.store.dispatch(UIActions.addTarget({ targetId: obj.stackObjectId }));
  }

  passPriority(): void {
    this.store.dispatch(GameActions.passPriority());
  }

  trackByStackObj(_: number, obj: StackObjectDto): string {
    return obj.stackObjectId;
  }

  isTopOfStack(idx: number, stack: StackObjectDto[]): boolean {
    return stack.length > 0 && idx === 0;
  }

  typeLabel(obj: StackObjectDto): string {
    return obj.type.replace(/([A-Z])/g, ' $1').trim();
  }
}
