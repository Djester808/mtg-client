import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { AppState, GameActions, UIActions } from '../store';
import {
  selectLocalPlayer,
  selectOpponent,
  selectLocalPermanents,
  selectOpponentPermanents,
  selectHasPriority,
  selectIsActivePlayer,
  selectCurrentPhase,
  selectCurrentStep,
  selectGameResult,
  selectUIMode,
  selectPendingAttackers,
  selectPreviewCard,
  selectStack,
  selectZoneViewerOpen,
  selectChoice,
  selectIsMyChoice,
  selectCombatState,
  selectAbilityMenu,
  selectAnnouncement,
} from '../store/selectors';
import { ChoiceDto, PermanentAbilityDto, Phase, Step } from '../models/game.models';

import { SignalRService } from '../services/signalr.service';
import { buildTypeLine } from '../utils/card.utils';
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
import { OracleSymbolsPipe } from '../pipes/oracle-symbols.pipe';

/**
 * The per-game token stored by the lobby, if this browser has one for this game.
 *
 * Returns an empty string rather than throwing or redirecting: nothing downstream uses the
 * value, and a missing or malformed one is not a reason to refuse to show the board.
 */
function readSessionToken(gameId: string): string {
  try {
    const raw = localStorage.getItem('mtg_session');
    if (!raw) {
      return '';
    }

    const session = JSON.parse(raw) as { gameId?: string; playerToken?: string };
    return session.gameId === gameId ? (session.playerToken ?? '') : '';
  } catch {
    return '';
  }
}

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
    OracleSymbolsPipe,
  ],
  templateUrl: './game-board.component.html',
  styleUrls: ['./game-board.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameBoardComponent implements OnInit {
  /**
   * The picks made so far, in order. An option repeats when the answer is an amount.
   *
   * A stream rather than a plain field, because the status bar's message is built inside the
   * view-model and only rebuilt when something in it emits. As a field, "2 left to assign"
   * stayed at 2 however many points you assigned — the buttons updated, because the template
   * calls back into the component, and the sentence above them did not.
   */
  private readonly picks$ = new BehaviorSubject<string[]>([]);

  get picks(): string[] {
    return this.picks$.value;
  }

  private setPicks(picks: string[]): void {
    this.picks$.next(picks);
  }

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
    this.store.select(selectChoice),
    this.store.select(selectIsMyChoice),
    this.store.select(selectCombatState),
    this.store.select(selectAbilityMenu),
    this.store.select(selectAnnouncement),
    this.picks$,
  ]).pipe(
    map(
      ([
        localPlayer,
        opponent,
        localPerms,
        opponentPerms,
        hasPriority,
        isActive,
        phase,
        step,
        result,
        uiMode,
        pendingAttackers,
        previewCard,
        stack,
        zoneViewerOpen,
        choice,
        isMyChoice,
        combat,
        abilityMenu,
        announcement,
        picks,
      ]) => ({
        localPlayer,
        opponent,
        localPerms,
        opponentPerms,
        hasPriority,
        isActive,
        phase,
        step,
        result,
        uiMode,
        pendingAttackers,
        previewCard,
        zoneViewerOpen,
        choice,
        isMyChoice,
        abilityMenu,
        announcement,
        // Nothing else may happen while the game is waiting to be told something, so the rest
        // of the status bar stands down.
        stopped: !!choice,
        stackCount: stack.length,
        statusMessage: this.buildStatusMessage(
          choice,
          isMyChoice,
          picks,
          phase,
          step,
          hasPriority,
          isActive,
          uiMode,
          pendingAttackers.length,
          abilityMenu?.permanent.sourceCard.name ?? announcement?.sourceName ?? '',
        ),
        // Declaring is a turn-based action taken once (CR 508.1, 509.1). The step does not end
        // when it is done — everybody gets priority in it afterwards — so the step alone is not
        // enough to say the button still means anything. Without the second half the board went
        // on offering Declare Attackers after they had been declared, and pressing it again did
        // nothing but re-declare the same empty attack.
        showDeclareAttackersBtn:
          isActive &&
          phase === Phase.Combat &&
          step === Step.DeclareAttackers &&
          uiMode === 'idle' &&
          !combat?.attackersDeclared,
        // The mode alone is not enough. It survives a step change, so a declaration begun and
        // never confirmed left "Confirm" on screen into the opponent's turn — and pressing it
        // sent an attack the engine answered with "Only the active player declares attackers
        // (CR 508.1)". The confirm has to stand on the same ground the declare button does.
        // The mode alone is not enough. It survives a step change, so a declaration begun and
        // never confirmed left "Confirm" on screen into the opponent's turn — and pressing it
        // sent an attack the engine answered with "Only the active player declares attackers
        // (CR 508.1)". The confirm has to stand on the same ground the declare button does.
        showConfirmAttackersBtn:
          uiMode === 'declaring-attackers' &&
          isActive &&
          phase === Phase.Combat &&
          step === Step.DeclareAttackers &&
          !combat?.attackersDeclared,
        showDeclareBlockersBtn:
          !isActive &&
          phase === Phase.Combat &&
          step === Step.DeclareBlockers &&
          uiMode === 'idle' &&
          !combat?.blockersDeclared,
        showConfirmBlockersBtn:
          uiMode === 'declaring-blockers' &&
          !isActive &&
          phase === Phase.Combat &&
          step === Step.DeclareBlockers &&
          !combat?.blockersDeclared,
      }),
    ),
  );

  handHeight = 400;
  private handResizing = false;
  private handResizeStartY = 0;
  private handResizeStartH = 0;

  // Default dimensions match the MTG card aspect ratio (63 × 88 mm)
  previewWidth = 220;
  previewHeight = 308;
  previewLeft = window.innerWidth - 460;
  previewTop = Math.floor(window.innerHeight / 2) - 154;

  private resizeDir: string | null = null;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeOriginLeft = 0;
  private resizeOriginTop = 0;
  private resizeOriginW = 0;
  private resizeOriginH = 0;

  private previewDragging = false;
  private previewDragStartX = 0;
  private previewDragStartY = 0;
  private previewDragOriginLeft = 0;
  private previewDragOriginTop = 0;

  startHandResize(e: MouseEvent): void {
    this.handResizing = true;
    this.handResizeStartY = e.clientY;
    this.handResizeStartH = this.handHeight;
    e.preventDefault();
  }

  startPreviewDrag(e: MouseEvent): void {
    // Let clicks on keyword links through — preventDefault() on the preceding
    // mousedown causes browsers to treat the subsequent target="_blank" click
    // as an untrusted gesture and block the navigation.
    if ((e.target as Element).closest('a')) return;
    this.previewDragging = true;
    this.previewDragStartX = e.clientX;
    this.previewDragStartY = e.clientY;
    this.previewDragOriginLeft = this.previewLeft;
    this.previewDragOriginTop = this.previewTop;
    e.preventDefault();
    e.stopPropagation();
  }

  startPreviewResize(e: MouseEvent, dir: string): void {
    this.resizeDir = dir;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;
    this.resizeOriginLeft = this.previewLeft;
    this.resizeOriginTop = this.previewTop;
    this.resizeOriginW = this.previewWidth;
    this.resizeOriginH = this.previewHeight;
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
      const minW = 120,
        maxW = 600;
      const d = this.resizeDir;

      // Diagonal delta: each corner uses the axis that grows when dragged outward
      let delta = 0;
      if (d === 'se') delta = (dx + dy) / 2;
      if (d === 'nw') delta = (-dx - dy) / 2;
      if (d === 'ne') delta = (dx - dy) / 2;
      if (d === 'sw') delta = (-dx + dy) / 2;

      const newW = Math.max(minW, Math.min(maxW, this.resizeOriginW + delta));
      const newH = Math.round(newW / aspectRatio);

      this.previewWidth = newW;
      this.previewHeight = newH;

      if (d.includes('w')) this.previewLeft = this.resizeOriginLeft + (this.resizeOriginW - newW);
      if (d.includes('n')) this.previewTop = this.resizeOriginTop + (this.resizeOriginH - newH);

      this.cdr.markForCheck();
    }
    if (this.previewDragging) {
      this.previewLeft = this.previewDragOriginLeft + (e.clientX - this.previewDragStartX);
      this.previewTop = this.previewDragOriginTop + (e.clientY - this.previewDragStartY);
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
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }
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

    if (!gameId) {
      this.router.navigate(['/']);
      return;
    }

    // The per-game token is read if it happens to be there and required from nowhere. Both
    // things that could use it stopped: the join is a plain GET of /api/games/:id, and the hub
    // authenticates with the account's own JWT and works out the seat from it. Demanding it
    // meant a game started any way other than through /lobby - which is to say every game
    // started by accepting an invitation - bounced off its own board.
    this.store.dispatch(
      GameActions.joinGame({
        gameId,
        playerToken: readSessionToken(gameId),
      }),
    );
  }

  // ---- Combat declaration ---------------------------------

  /** Aiming the spell at a player, who has no card on the board to tap. */
  targetPlayer(playerId: string | undefined): void {
    if (playerId) {
      this.store.dispatch(UIActions.addTarget({ targetId: playerId }));
    }
  }

  /** Giving up on the spell: it stays in hand, nothing is sent. */
  cancelTargeting(): void {
    this.store.dispatch(UIActions.cancelTargetMode());
    // The number named for it goes with it. The field is destroyed with the prompt but the
    // value behind it is not, so without this the next announcement opens on the last one's
    // number — for an ability that would be a cost paid for something nobody asked for.
    this.forgetAnnouncedValue();
  }

  // ---- Abilities and the number a cost is counted with -----------------------------------

  /**
   * The ability the player pressed. What it needs first is the effect's to work out (CR 602.2).
   */
  chooseAbility(permanentId: string, abilityId: string): void {
    this.forgetAnnouncedValue();
    this.store.dispatch(UIActions.chooseAbility({ permanentId, abilityId }));
  }

  closeAbilityMenu(): void {
    this.store.dispatch(UIActions.closeAbilityMenu());
  }

  trackByAbility(_: number, ability: PermanentAbilityDto): string {
    return ability.id;
  }

  /**
   * The number typed into the announcement, before it is sent (CR 601.2b).
   *
   * A plain field rather than a stream: it is only ever read back by the template that writes
   * it, and the prompt's own text comes from the store. It is reset on entry so a second
   * announcement does not open on the last one's number.
   */
  announceValue = 0;

  onAnnounceInput(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    // Negative is not a number X can be (CR 107.3), and the engine would refuse it; clamping
    // here means the refusal never has to be shown for something the board could see coming.
    this.announceValue = Number.isFinite(raw) ? Math.max(0, Math.min(99, Math.floor(raw))) : 0;
    this.cdr.markForCheck();
  }

  confirmAnnounce(): void {
    this.store.dispatch(UIActions.confirmAnnounce({ value: this.announceValue }));
    this.forgetAnnouncedValue();
  }

  cancelAnnounce(): void {
    this.store.dispatch(UIActions.cancelAnnounce());
    this.forgetAnnouncedValue();
  }

  private forgetAnnouncedValue(): void {
    this.announceValue = 0;
    this.cdr.markForCheck();
  }

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
    return buildTypeLine(card);
  }

  // ---- Status bar message ---------------------------------

  // ---- Answering the game --------------------------------------------------------------
  //
  // The engine stops and asks: keep or mulligan (CR 103.4), how to divide combat damage among
  // blockers (CR 510.1c), what order simultaneous triggers go on the stack (CR 603.3b). The
  // three are the same interaction with different rules about how many times you may pick.

  /** A single-pick decision has nothing to confirm — the tap is the answer. */
  pick(choice: ChoiceDto, optionId: string): void {
    if (choice.maxPicks === 1) {
      this.store.dispatch(GameActions.choose({ picks: [optionId] }));
      this.setPicks([]);
      return;
    }

    if (choice.isDivision) {
      // Dividing damage is answered by picking a blocker once per point, so the same option is
      // picked repeatedly — a mistake everywhere else and the whole mechanism here.
      if (this.picks.length < choice.totalToDivide) {
        this.setPicks([...this.picks, optionId]);
      }
      return;
    }

    this.setPicks(
      this.picks.includes(optionId)
        ? this.picks.filter((id) => id !== optionId)
        : [...this.picks, optionId],
    );
  }

  submitChoice(): void {
    this.store.dispatch(GameActions.choose({ picks: this.picks }));
    this.setPicks([]);
  }

  clearPicks(): void {
    this.setPicks([]);
  }

  /** Where this option sits in the answer, for an ordering (CR 603.3b). */
  pickOrder(optionId: string): number {
    return this.picks.indexOf(optionId) + 1;
  }

  /** How much has been assigned to this option, for a division (CR 510.1c). */
  assigned(optionId: string): number {
    return this.picks.filter((id) => id === optionId).length;
  }

  leftToDivide(choice: ChoiceDto): number {
    return Math.max(0, choice.totalToDivide - this.picks.length);
  }

  canSubmit(choice: ChoiceDto): boolean {
    return choice.isDivision
      ? this.picks.length === choice.totalToDivide
      : this.picks.length >= choice.minPicks && this.picks.length <= choice.maxPicks;
  }

  /**
   * What the board is in the middle of asking, or null when it is asking nothing.
   *
   * Its own method because the modes are one list and the rest of `buildStatusMessage` is a
   * different question — where in the turn the game is. Kept together the two pushed that
   * method past the complexity ceiling, which is the point at which a list is a list.
   */
  private modeMessage(
    uiMode: string,
    pendingAttackerCount: number,
    sourceName: string,
  ): string | null {
    switch (uiMode) {
      case 'declaring-attackers':
        return pendingAttackerCount > 0
          ? `${pendingAttackerCount} attacker(s) selected — confirm or cancel`
          : 'Select creatures to attack with';
      case 'declaring-blockers':
        return 'Assign blockers to attacking creatures';
      case 'targeting':
        return 'Choose a target';
      case 'choosing-ability':
        return sourceName ? `Which ability of ${sourceName}?` : 'Which ability?';
      case 'announcing':
        // Named rather than "How many?", because a board with nine permanents on it does not
        // make that a question anyone can answer.
        return sourceName
          ? `Name X for ${sourceName} — the cost is paid for what you name (CR 601.2b)`
          : 'Name X — the cost is paid for what you name (CR 601.2b)';
      default:
        return null;
    }
  }

  private buildStatusMessage(
    choice: ChoiceDto | null,
    isMyChoice: boolean,
    picks: string[],
    phase: Phase,
    step: Step,
    hasPriority: boolean,
    isActive: boolean,
    uiMode: string,
    pendingAttackerCount: number,
    sourceName: string,
  ): string {
    // A decision outranks everything else on the bar: until it is answered the game is stopped,
    // and saying "waiting for opponent" while the question is on your own screen is the worst
    // of both.
    if (choice) {
      if (!isMyChoice) {
        return 'Waiting for the other player to decide...';
      }
      if (choice.isDivision) {
        // From the picks the view-model was built with, not from the field: the message is a
        // function of what it is given, which is what makes it keep up as points are assigned.
        const left = Math.max(0, choice.totalToDivide - picks.length);
        return `${choice.prompt} — ${left} left to assign`;
      }
      return choice.prompt;
    }

    const forMode = this.modeMessage(uiMode, pendingAttackerCount, sourceName);
    if (forMode) return forMode;

    if (!hasPriority) return 'Waiting for opponent...';

    const phaseStep = `${phase} — ${step}`;
    if (phase === Phase.PreCombatMain || phase === Phase.PostCombatMain) {
      return isActive
        ? 'Main phase — cast spells, play lands, or pass priority'
        : "Waiting for opponent's main phase";
    }
    if (phase === Phase.Combat) {
      if (step === Step.DeclareAttackers && isActive)
        return 'Declare attackers or pass to skip combat';
      if (step === Step.DeclareBlockers && !isActive) return 'Declare blockers';
      if (step === Step.CombatDamage) return 'Combat damage — pass priority to resolve';
    }
    return `${phaseStep} — you have priority`;
  }
}
