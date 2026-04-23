import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { combineLatest, map } from 'rxjs';
import { AppState } from '../../store';
import { selectHasPriority, selectPriorityPlayerId, selectPlayers } from '../../store/selectors';

@Component({
  selector: 'app-priority-indicator',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="priority" *ngIf="vm$ | async as vm" [class.has-priority]="vm.hasPriority">
      <div class="dot"></div>
      <span class="label">{{ vm.hasPriority ? 'Your Priority' : vm.priorityPlayerName + ' has Priority' }}</span>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .priority {
      display: flex; align-items: center; gap: 6px;
      padding: 3px 8px; border-radius: 12px;
      background: rgba(90,82,72,0.2);
      border: 1px solid rgba(90,82,72,0.3);
      transition: all 0.3s;
    }
    .priority.has-priority {
      background: rgba(201,168,76,0.12);
      border-color: rgba(201,168,76,0.3);
      .dot { background: var(--gold); box-shadow: 0 0 6px var(--gold); animation: pulse-gold 1.5s ease-in-out infinite; }
      .label { color: var(--gold); }
    }
    .dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--text-dim); flex-shrink: 0;
    }
    .label {
      font-family: var(--font-display); font-size: 10px;
      color: var(--text-secondary); letter-spacing: 0.08em;
      white-space: nowrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriorityIndicatorComponent {
  vm$ = combineLatest([
    this.store.select(selectHasPriority),
    this.store.select(selectPriorityPlayerId),
    this.store.select(selectPlayers),
  ]).pipe(
    map(([hasPriority, priorityId, players]) => ({
      hasPriority,
      priorityPlayerName: players.find(p => p.playerId === priorityId)?.name ?? '',
    }))
  );

  constructor(private store: Store<AppState>) {}
}
