import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { map, combineLatest } from 'rxjs';
import { AppState } from '../../store';
import { selectCurrentPhase, selectCurrentStep, selectTurn, selectActivePlayerId, selectPlayers } from '../../store/selectors';
import { Phase, Step } from '../../models/game.models';

interface PhasePip {
  label: string;
  phase: Phase;
  step: Step;
  state: 'done' | 'active' | 'upcoming';
}

const PHASE_PIPS: { label: string; phase: Phase; step: Step }[] = [
  { label: 'UNT', phase: Phase.Beginning,      step: Step.Untap  },
  { label: 'UPK', phase: Phase.Beginning,      step: Step.Upkeep },
  { label: 'DRW', phase: Phase.Beginning,      step: Step.Draw   },
  { label: 'M1',  phase: Phase.PreCombatMain,  step: Step.Main   },
  { label: 'CMB', phase: Phase.Combat,         step: Step.DeclareAttackers },
  { label: 'M2',  phase: Phase.PostCombatMain, step: Step.Main   },
  { label: 'END', phase: Phase.Ending,         step: Step.End    },
];

const PHASE_ORDER = [
  Phase.Beginning,
  Phase.PreCombatMain,
  Phase.Combat,
  Phase.PostCombatMain,
  Phase.Ending,
];

@Component({
  selector: 'app-phase-track',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './phase-track.component.html',
  styleUrls: ['./phase-track.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhaseTrackComponent {
  vm$ = combineLatest([
    this.store.select(selectCurrentPhase),
    this.store.select(selectCurrentStep),
    this.store.select(selectTurn),
    this.store.select(selectActivePlayerId),
    this.store.select(selectPlayers),
  ]).pipe(
    map(([phase, step, turn, activeId, players]) => {
      const activePlayer = players.find(p => p.playerId === activeId);
      const currentPhaseIdx = PHASE_ORDER.indexOf(phase);

      const pips: PhasePip[] = PHASE_PIPS.map(pip => {
        const pipPhaseIdx = PHASE_ORDER.indexOf(pip.phase);
        let state: PhasePip['state'];
        if (pipPhaseIdx < currentPhaseIdx) {
          state = 'done';
        } else if (pipPhaseIdx === currentPhaseIdx) {
          state = 'active';
        } else {
          state = 'upcoming';
        }
        return { ...pip, state };
      });

      return { pips, turn, activePlayerName: activePlayer?.name ?? '' };
    })
  );

  constructor(private store: Store<AppState>) {}

  trackByPip(_: number, pip: PhasePip): string {
    return pip.label;
  }
}
