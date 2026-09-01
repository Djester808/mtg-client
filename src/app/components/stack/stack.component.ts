import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { AppState, GameActions } from '../../store';
import {
  selectStack,
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
  imports: [CommonModule],
  templateUrl: './stack.component.html',
  styleUrls: ['./stack.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StackComponent {
  stack$ = this.store.select(selectStack);
  hasPriority$ = this.store.select(selectHasPriority);
  isEmpty$ = this.store.select(selectStackIsEmpty);
  phase$ = this.store.select(selectCurrentPhase);
  step$ = this.store.select(selectCurrentStep);
  isActive$ = this.store.select(selectIsActivePlayer);

  constructor(private store: Store<AppState>) {}

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
    return idx === stack.length - 1;
  }

  typeLabel(obj: StackObjectDto): string {
    return obj.type.replace(/([A-Z])/g, ' $1').trim();
  }
}
