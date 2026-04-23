import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { AppState, GameActions } from '../../store';
import {
  selectStack, selectHasPriority, selectStackIsEmpty,
  selectCurrentPhase, selectCurrentStep, selectIsActivePlayer,
} from '../../store/selectors';
import { StackObjectDto, Phase, Step } from '../../models/game.models';

@Component({
  selector: 'app-stack',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stack.component.html',
  styleUrls: ['./stack.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StackComponent {
  stack$       = this.store.select(selectStack);
  hasPriority$ = this.store.select(selectHasPriority);
  isEmpty$     = this.store.select(selectStackIsEmpty);
  phase$       = this.store.select(selectCurrentPhase);
  step$        = this.store.select(selectCurrentStep);
  isActive$    = this.store.select(selectIsActivePlayer);

  constructor(private store: Store<AppState>) {}

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
