import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { combineLatest, map } from 'rxjs';
import { AppState, GameActions, UIActions } from '../store';
import {
  selectLocalPlayer, selectOpponent,
  selectLocalPermanents, selectOpponentPermanents,
  selectHasPriority, selectIsActivePlayer,
  selectCurrentPhase, selectCurrentStep,
  selectGameResult, selectUIMode,
  selectPendingAttackers, selectHoveredCard,
  selectStack, selectZoneViewerOpen,
} from '../store/selectors';
import { Phase, Step, GameResult } from '../models/game.models';

import { CardComponent } from '../components/card/card.component';
import { HandComponent } from '../components/hand/hand.component';
import { StackComponent } from '../components/stack/stack.component';
import { ZonesComponent } from '../components/zones/zones.component';
import { PlayerSidebarComponent } from '../components/player-sidebar/player-sidebar.component';
import { PhaseTrackComponent } from '../components/phase-track/phase-track.component';
import { PriorityIndicatorComponent } from '../components/priority-indicator/priority-indicator.component';
import { ZoneViewerComponent } from '../components/zone-viewer/zone-viewer.component';
import { ToastContainerComponent } from '../components/toast/toast-container.component';
import { AttackArrowsComponent } from '../components/attack-arrows/attack-arrows.component';

@Component({
  selector: 'app-game-board',
  standalone: true,
  imports: [
    CommonModule,
    CardComponent,
    HandComponent,
    StackComponent,
    ZonesComponent,
    PlayerSidebarComponent,
    PhaseTrackComponent,
    PriorityIndicatorComponent,
    ZoneViewerComponent,
    ToastContainerComponent,
    AttackArrowsComponent,
  ],
  templateUrl: './game-board.component.html',
  styleUrls: ['./game-board.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameBoardComponent implements OnInit {

  vm$ = combineLatest([
    this.store.select(selectLocalPlayer),
    this.store.select(selectOpponent),
    this.store.select(selectLocalPermanents),
    this.store.select(selectOpponentPermanents),
    this.store.select(selectHasPriority),
    this.store.select(selectIsActivePlayer),
    this.store.select(selectCurrentPhase),
    this.store.select(selectCurrentStep),
    this.store.select(selectGameResult),
    this.store.select(selectUIMode),
    this.store.select(selectPendingAttackers),
    this.store.select(selectHoveredCard),
    this.store.select(selectStack),
    this.store.select(selectZoneViewerOpen),
  ]).pipe(
    map(([
      localPlayer, opponent, localPerms, opponentPerms,
      hasPriority, isActive, phase, step, result,
      uiMode, pendingAttackers, hoveredCard, stack, zoneViewerOpen,
    ]) => ({
      localPlayer, opponent, localPerms, opponentPerms,
      hasPriority, isActive, phase, step, result,
      uiMode, pendingAttackers, hoveredCard, zoneViewerOpen,
      stackCount: stack.length,
      statusMessage: this.buildStatusMessage(phase, step, hasPriority, isActive, uiMode, pendingAttackers.length),
      showDeclareAttackersBtn: isActive && phase === Phase.Combat && step === Step.DeclareAttackers && uiMode === 'idle',
      showConfirmAttackersBtn: uiMode === 'declaring-attackers',
      showDeclareBlockersBtn:  !isActive && phase === Phase.Combat && step === Step.DeclareBlockers && uiMode === 'idle',
      showConfirmBlockersBtn:  uiMode === 'declaring-blockers',
    }))
  );

  constructor(private store: Store<AppState>) {}

  ngOnInit(): void {
    // In a real app, gameId + playerToken come from route params / lobby
    // For dev, you'd dispatch joinGame here:
    // this.store.dispatch(GameActions.joinGame({ gameId: '...', playerToken: '...' }));
  }

  // ---- Combat declaration ---------------------------------

  enterAttackMode(): void {
    this.store.dispatch(UIActions.enterAttackMode());
  }

  confirmAttackers(): void {
    this.store.dispatch(UIActions.confirmAttackers());
  }

  cancelAttackMode(): void {
    this.store.dispatch(UIActions.cancelAttackMode());
  }

  enterBlockMode(): void {
    this.store.dispatch(UIActions.enterBlockMode());
  }

  confirmBlockers(): void {
    this.store.dispatch(UIActions.confirmBlockers());
  }

  cancelBlockMode(): void {
    this.store.dispatch(UIActions.cancelBlockMode());
  }

  // ---- Priority -------------------------------------------

  passPriority(): void {
    this.store.dispatch(GameActions.passPriority());
  }

  concede(): void {
    if (confirm('Are you sure you want to concede?')) {
      this.store.dispatch(GameActions.concede());
    }
  }

  // ---- Status bar message ---------------------------------

  private buildStatusMessage(
    phase: Phase, step: Step,
    hasPriority: boolean, isActive: boolean,
    uiMode: string, pendingAttackerCount: number,
  ): string {
    if (uiMode === 'declaring-attackers') {
      return pendingAttackerCount > 0
        ? `${pendingAttackerCount} attacker(s) selected — confirm or cancel`
        : 'Select creatures to attack with';
    }
    if (uiMode === 'declaring-blockers') return 'Assign blockers to attacking creatures';
    if (uiMode === 'targeting') return 'Choose a target';

    if (!hasPriority) return 'Waiting for opponent...';

    const phaseStep = `${phase} — ${step}`;
    if (phase === Phase.PreCombatMain || phase === Phase.PostCombatMain) {
      return isActive ? 'Main phase — cast spells, play lands, or pass priority' : 'Waiting for opponent\'s main phase';
    }
    if (phase === Phase.Combat) {
      if (step === Step.DeclareAttackers && isActive) return 'Declare attackers or pass to skip combat';
      if (step === Step.DeclareBlockers && !isActive) return 'Declare blockers';
      if (step === Step.CombatDamage) return 'Combat damage — pass priority to resolve';
    }
    return `${phaseStep} — you have priority`;
  }
}
