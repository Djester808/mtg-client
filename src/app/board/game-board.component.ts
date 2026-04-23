import { Component, ChangeDetectionStrategy, ChangeDetectorRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { combineLatest, map } from 'rxjs';
import { AppState, GameActions, UIActions } from '../store';
import {
  selectLocalPlayer, selectOpponent,
  selectLocalPermanents, selectOpponentPermanents,
  selectHasPriority, selectIsActivePlayer,
  selectCurrentPhase, selectCurrentStep,
  selectGameResult, selectUIMode,
  selectPendingAttackers, selectPreviewCard,
  selectStack, selectZoneViewerOpen,
} from '../store/selectors';
import { Phase, Step, GameResult } from '../models/game.models';

import { SignalRService } from '../services/signalr.service';
import { CardComponent } from '../components/card/card.component';
import { ManaCostComponent } from '../components/mana-cost/mana-cost.component';
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
    ManaCostComponent,
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
    this.store.select(selectPreviewCard),
    this.store.select(selectStack),
    this.store.select(selectZoneViewerOpen),
  ]).pipe(
    map(([
      localPlayer, opponent, localPerms, opponentPerms,
      hasPriority, isActive, phase, step, result,
      uiMode, pendingAttackers, previewCard, stack, zoneViewerOpen,
    ]) => ({
      localPlayer, opponent, localPerms, opponentPerms,
      hasPriority, isActive, phase, step, result,
      uiMode, pendingAttackers, previewCard, zoneViewerOpen,
      stackCount: stack.length,
      statusMessage: this.buildStatusMessage(phase, step, hasPriority, isActive, uiMode, pendingAttackers.length),
      showDeclareAttackersBtn: isActive && phase === Phase.Combat && step === Step.DeclareAttackers && uiMode === 'idle',
      showConfirmAttackersBtn: uiMode === 'declaring-attackers',
      showDeclareBlockersBtn:  !isActive && phase === Phase.Combat && step === Step.DeclareBlockers && uiMode === 'idle',
      showConfirmBlockersBtn:  uiMode === 'declaring-blockers',
    }))
  );

  handHeight = 400;
  private handResizing = false;
  private handResizeStartY = 0;
  private handResizeStartH = 0;

  // Default dimensions match the MTG card aspect ratio (63 × 88 mm)
  previewWidth  = 220;
  previewHeight = 308;
  previewLeft   = window.innerWidth - 460;
  previewTop    = Math.floor(window.innerHeight / 2) - 154;

  private resizeDir: string | null = null;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeOriginLeft = 0;
  private resizeOriginTop  = 0;
  private resizeOriginW    = 0;
  private resizeOriginH    = 0;

  private previewDragging = false;
  private previewDragStartX = 0;
  private previewDragStartY = 0;
  private previewDragOriginLeft = 0;
  private previewDragOriginTop  = 0;

  get gridRows(): string {
    return `64px 1fr 1fr 44px ${this.handHeight}px`;
  }

  startHandResize(e: MouseEvent): void {
    this.handResizing = true;
    this.handResizeStartY = e.clientY;
    this.handResizeStartH = this.handHeight;
    e.preventDefault();
  }

  startPreviewDrag(e: MouseEvent): void {
    this.previewDragging = true;
    this.previewDragStartX = e.clientX;
    this.previewDragStartY = e.clientY;
    this.previewDragOriginLeft = this.previewLeft;
    this.previewDragOriginTop  = this.previewTop;
    e.preventDefault();
    e.stopPropagation();
  }

  startPreviewResize(e: MouseEvent, dir: string): void {
    this.resizeDir       = dir;
    this.resizeStartX    = e.clientX;
    this.resizeStartY    = e.clientY;
    this.resizeOriginLeft = this.previewLeft;
    this.resizeOriginTop  = this.previewTop;
    this.resizeOriginW    = this.previewWidth;
    this.resizeOriginH    = this.previewHeight;
    e.preventDefault();
    e.stopPropagation();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (this.handResizing) {
      const delta = this.handResizeStartY - e.clientY;
      this.handHeight = Math.max(100, Math.min(500, this.handResizeStartH + delta));
      this.cdr.markForCheck();
    }
    if (this.resizeDir) {
      const dx = e.clientX - this.resizeStartX;
      const dy = e.clientY - this.resizeStartY;
      const aspectRatio = this.resizeOriginW / this.resizeOriginH;
      const minW = 120, maxW = 600;
      const d = this.resizeDir;

      // Diagonal delta: each corner uses the axis that grows when dragged outward
      let delta = 0;
      if (d === 'se') delta = (dx + dy) / 2;
      if (d === 'nw') delta = (-dx - dy) / 2;
      if (d === 'ne') delta = (dx - dy) / 2;
      if (d === 'sw') delta = (-dx + dy) / 2;

      const newW = Math.max(minW, Math.min(maxW, this.resizeOriginW + delta));
      const newH = Math.round(newW / aspectRatio);

      this.previewWidth  = newW;
      this.previewHeight = newH;

      if (d.includes('w')) this.previewLeft = this.resizeOriginLeft + (this.resizeOriginW - newW);
      if (d.includes('n')) this.previewTop  = this.resizeOriginTop  + (this.resizeOriginH - newH);

      this.cdr.markForCheck();
    }
    if (this.previewDragging) {
      this.previewLeft = this.previewDragOriginLeft + (e.clientX - this.previewDragStartX);
      this.previewTop  = this.previewDragOriginTop  + (e.clientY - this.previewDragStartY);
      this.cdr.markForCheck();
    }
  }

  get isInteracting(): boolean {
    return !!this.resizeDir || this.previewDragging;
  }

  private suppressNextClick = false;

  @HostListener('document:mouseup')
  onMouseUp(): void {
    const wasInteracting = this.isInteracting;
    this.handResizing = false;
    this.resizeDir = null;
    this.previewDragging = false;
    if (wasInteracting) this.suppressNextClick = true;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.suppressNextClick) { this.suppressNextClick = false; return; }
    this.closePreview();
  }

  constructor(
    private store: Store<AppState>,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
    private signalr: SignalRService,
  ) {}

  ngOnInit(): void {
    const gameId = this.route.snapshot.paramMap.get('gameId');
    const raw = localStorage.getItem('mtg_session');

    if (!gameId || !raw) {
      this.router.navigate(['/']);
      return;
    }

    let session: { gameId: string; playerToken: string };
    try {
      session = JSON.parse(raw);
    } catch {
      this.router.navigate(['/']);
      return;
    }

    if (session.gameId !== gameId) {
      this.router.navigate(['/']);
      return;
    }

    this.store.dispatch(GameActions.joinGame({
      gameId,
      playerToken: session.playerToken,
    }));
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

  closePreview(): void {
    this.store.dispatch(UIActions.deselectCard());
  }

  showConcedeModal = false;

  concede(): void {
    this.showConcedeModal = true;
    this.cdr.markForCheck();
  }

  cancelConcede(): void {
    this.showConcedeModal = false;
    this.cdr.markForCheck();
  }

  confirmConcede(): void {
    this.store.dispatch(GameActions.concede());
    this.signalr.disconnect();
    localStorage.removeItem('mtg_session');
    this.router.navigate(['/']);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showConcedeModal) this.cancelConcede();
  }

  // ---- Preview helpers ------------------------------------

  previewTypeLine(card: import('../models/game.models').CardDto): string {
    const base = card.cardTypes.join(' ');
    return card.subtypes.length ? `${base} — ${card.subtypes.join(' ')}` : base;
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
