import { LibraryActionsService } from '../game/library-actions.service';
import { ToastService } from '../services/toast.service';
import { LibraryRevealComponent } from '../components/library-reveal/library-reveal.component';
import { ChoiceControlsComponent } from '../components/choice-controls/choice-controls.component';
import { ChoiceSelectionService } from '../game/choices/choice-selection.service';
import { CastPromptComponent } from '../components/cast-prompt/cast-prompt.component';
import { BreakpointsService } from '../shared/breakpoints.service';
import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
  OnInit,
  OnDestroy,
  DestroyRef,
  inject,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { BehaviorSubject, combineLatest, map, distinctUntilChanged } from 'rxjs';
import { AppState, GameActions, UIActions } from '../store';
import {
  selectLocalPlayer,
  selectGameReady,
  selectOutcomeSummary,
  selectTableSeats,
  selectAttackDefender,
  selectActivePlayerId,
  selectPriorityPlayerId,
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
  selectCastDraft,
  selectUIFeature,
  selectStack,
  selectZoneViewerOpen,
  selectChoice,
  selectIsMyChoice,
  selectCombatState,
  selectAbilityMenu,
  selectAnnouncement,
} from '../store/selectors';
import { ChoiceDto, PermanentAbilityDto, Phase, Step } from '../models/game.models';
import { readSessionToken } from '../utils/session.utils';

import { SignalRService } from '../services/signalr.service';
import { CardModalComponent } from '../components/card-modal/card-modal.component';
import { ManaCostComponent } from '../components/mana-cost/mana-cost.component';
import { HandComponent } from '../components/hand/hand.component';
import { StackComponent } from '../components/stack/stack.component';
import { TableSeatComponent } from './table-seat.component';
import { PhaseTrackComponent } from '../components/phase-track/phase-track.component';
import { PriorityIndicatorComponent } from '../components/priority-indicator/priority-indicator.component';
import { ZoneViewerComponent } from '../components/zone-viewer/zone-viewer.component';
import { AttackArrowsComponent } from '../components/attack-arrows/attack-arrows.component';
import { OracleSymbolsPipe } from '../pipes/oracle-symbols.pipe';
import { ManualControlsComponent } from './manual-controls.component';
import { ManualControlsService } from './manual-controls.service';

@Component({
  selector: 'app-game-board',
  providers: [ChoiceSelectionService],
  standalone: true,
  imports: [
    CommonModule,
    CastPromptComponent,
    ChoiceControlsComponent,
    RouterLink,
    CardModalComponent,
    ManaCostComponent,
    HandComponent,
    StackComponent,
    TableSeatComponent,
    PhaseTrackComponent,
    PriorityIndicatorComponent,
    ZoneViewerComponent,
    AttackArrowsComponent,
    OracleSymbolsPipe,
    ManualControlsComponent,
    LibraryRevealComponent,
  ],
  templateUrl: './game-board.component.html',
  styleUrls: ['./game-board.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameBoardComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly libraryActions = inject(LibraryActionsService);
  private readonly libraryToasts = inject(ToastService);
  libraryRepositionBusy = false;
  async repositionLibrary(action: { cardId: string; position: number }): Promise<void> {
    if (this.libraryRepositionBusy) return;
    this.libraryRepositionBusy = true;
    try {
      await this.libraryActions.reposition(action.cardId, action.position);
    } catch {
      this.libraryToasts.show(
        'Library move was not confirmed. Retry to check it safely.',
        'warn',
        4000,
      );
    } finally {
      this.libraryRepositionBusy = false;
      this.cdr.markForCheck();
    }
  }
  readonly breakpoints = inject(BreakpointsService);
  get shownOpponentView(): 'focus' | 'table' {
    return this.breakpoints.isShortViewport() ? 'focus' : this.opponentView;
  }
  @ViewChild('cardDetails') set cardDetails(ref: ElementRef<HTMLDialogElement> | undefined) {
    const dialog = ref?.nativeElement;
    if (dialog)
      queueMicrotask(() => {
        if (dialog.isConnected && !dialog.open) dialog.showModal();
      });
  }
  readonly outcome$ = this.store.select(selectOutcomeSummary);
  /**
   * The picks made so far, in order. An option repeats when the answer is an amount.
   *
   * A stream rather than a plain field, because the status bar's message is built inside the
   * view-model and only rebuilt when something in it emits. As a field, "2 left to assign"
   * stayed at 2 however many points you assigned — the buttons updated, because the template
   * calls back into the component, and the sentence above them did not.
   */
  private readonly selection = inject(ChoiceSelectionService);
  private readonly picks$ = this.selection.picks$;

  /** The honour system: which objects its panel is for, and what each of its controls sends. */
  private readonly manual = inject(ManualControlsService);

  get picks(): string[] {
    return this.selection.picks;
  }

  opponentView: 'focus' | 'table' = 'focus';
  private readonly focus$ = new BehaviorSubject<string | null>(null);
  setOpponentView(view: 'focus' | 'table'): void {
    this.opponentView = view;
    this.cdr.markForCheck();
  }
  focusOpponent(id: string): void {
    this.opponentView = 'focus';
    this.focus$.next(id);
    this.cdr.markForCheck();
  }
  followTurn(): void {
    this.focus$.next(null);
    this.cdr.markForCheck();
  }
  stepOpponent(
    seats: { player: { playerId: string } }[],
    current: string | undefined,
    delta: number,
  ): void {
    if (!seats.length) return;
    const index = seats.findIndex((s) => s.player.playerId === current);
    this.focusOpponent(seats[(index + delta + seats.length) % seats.length].player.playerId);
  }
  toggleStack(): void {
    this.stackCollapsed = !this.stackCollapsed;
    this.cdr.markForCheck();
  }
  toggleHand(): void {
    this.handCollapsed = !this.handCollapsed;
    this.cdr.markForCheck();
  }
  trackId(_: number, item: { id: string }): string {
    return item.id;
  }

  libraryReady$ = this.store.select(selectGameReady);
  casting$ = this.store.select(selectCastDraft);
  quickCard$ = this.store.select(selectUIFeature).pipe(map((ui) => ui.hoveredCard));

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
    this.store.select(selectTableSeats),
    this.store.select(selectActivePlayerId),
    this.store.select(selectPriorityPlayerId),
    this.store.select(selectAttackDefender),
    this.focus$,
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
        tableSeats,
        activePlayerId,
        priorityPlayerId,
        attackDefenderId,
        focusId,
      ]) => ({
        focusedId:
          tableSeats.find((s) => !s.isLocal && s.player.playerId === focusId)?.player.playerId ??
          tableSeats.find((s) => !s.isLocal && s.player.playerId === activePlayerId)?.player
            .playerId ??
          tableSeats.find((s) => !s.isLocal)?.player.playerId,
        opponents: tableSeats
          .filter((s) => !s.isLocal)
          .map((s) => ({
            ...s,
            damageToYou: s.player.commanderName
              ? (localPlayer?.commanderDamage?.[s.player.commanderName] ?? 0)
              : 0,
            attackingYou: s.permanents.some(
              (p) => combat?.attackersToDefenders?.[p.permanentId] === localPlayer?.playerId,
            ),
          })),
        firstOpponentId: tableSeats.find((seat) => !seat.isLocal && !seat.player.hasLost)?.player
          .playerId,
        attackDefenderId,
        waitingDefenderName: tableSeats.find(
          (s) =>
            s.player.playerId ===
            combat?.defendingPlayerIds?.find((id) => !combat.blockersDeclaredBy?.includes(id)),
        )?.player.name,
        tableSeats,
        activePlayerId,
        priorityPlayerId,
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
        // Manual controls include every visible seat, filtered to objects needing adjustment.
        manualObjects: this.manual.honourSystem(tableSeats.flatMap((seat) => seat.permanents)),
        seats: tableSeats.map((seat) => seat.player),
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
          !combat?.blockersDeclared &&
          (!combat?.defendingPlayerIds ||
            combat.defendingPlayerIds.find((id) => !combat.blockersDeclaredBy?.includes(id)) ===
              localPlayer?.playerId),
        showConfirmBlockersBtn:
          uiMode === 'declaring-blockers' &&
          !isActive &&
          phase === Phase.Combat &&
          step === Step.DeclareBlockers &&
          !combat?.blockersDeclared &&
          (!combat?.defendingPlayerIds ||
            combat.defendingPlayerIds.find((id) => !combat.blockersDeclaredBy?.includes(id)) ===
              localPlayer?.playerId),
      }),
    ),
  );

  handCollapsed = true;
  stackCollapsed = false;
  trackSeat(_: number, seat: { player: { playerId: string } }): string {
    return seat.player.playerId;
  }
  constructor(
    private store: Store<AppState>,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
    readonly signalr: SignalRService,
  ) {}

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        map((params) => params.get('gameId')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((gameId) => {
        if (!gameId) {
          void this.router.navigate(['/']);
          return;
        }
        this.focus$.next(null);
        this.selection.reset();
        this.forgetAnnouncedValue();
        this.store.dispatch(
          GameActions.joinGame({ gameId, playerToken: readSessionToken(gameId) }),
        );
      });
  }

  ngOnDestroy(): void {
    this.store.dispatch(GameActions.leaveGame());
    this.focus$.complete();
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

  setAttackDefender(playerId: string): void {
    this.store.dispatch(UIActions.setAttackDefender({ playerId }));
  }
  enterAttackMode(defender?: string): void {
    if (defender) this.setAttackDefender(defender);
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

  previewChoiceCard(cardId: string): void {
    this.store.dispatch(UIActions.selectCard({ cardId }));
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
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showConcedeModal) this.cancelConcede();
    else this.closePreview();
  }

  // ---- Preview helpers ------------------------------------

  // ---- Status bar message ---------------------------------

  // ---- Answering the game --------------------------------------------------------------
  //
  // The engine stops and asks: keep or mulligan (CR 103.4), how to divide combat damage among
  // blockers (CR 510.1c), what order simultaneous triggers go on the stack (CR 603.3b). The
  // three are the same interaction with different rules about how many times you may pick.

  pick(choice: ChoiceDto, optionId: string): void {
    const answer = this.selection.select(choice, optionId);
    if (answer) {
      this.store.dispatch(GameActions.choose({ picks: answer, control: 'option' }));
      if (choice.kind !== 'search') this.selection.reset();
    }
  }

  placeOnTop(choice: ChoiceDto, optionId: string): void {
    const answer = this.selection.placeOnTop(choice, optionId);
    if (answer) this.store.dispatch(GameActions.choose({ picks: answer, control: 'option' }));
  }

  submitChoice(choice: ChoiceDto): void {
    if (!this.selection.canSubmit(choice)) return;
    this.store.dispatch(GameActions.choose({ picks: [...this.picks], control: 'confirm' }));
    if (choice.kind !== 'search') this.selection.reset();
  }
  skipChoice(choice: ChoiceDto): void {
    if (choice.minPicks !== 0) return;
    this.store.dispatch(GameActions.choose({ picks: [], control: 'skip' }));
    this.selection.reset();
  }

  clearPicks(): void {
    this.selection.reset();
  }
  pickOrder(optionId: string): number {
    return this.selection.order(optionId);
  }
  assigned(optionId: string): number {
    return this.selection.assigned(optionId);
  }
  leftToDivide(choice: ChoiceDto): number {
    return this.selection.remaining(choice);
  }
  canSubmit(choice: ChoiceDto): boolean {
    return this.selection.canSubmit(choice);
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
