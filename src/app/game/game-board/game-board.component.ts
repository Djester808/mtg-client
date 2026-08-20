import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollEdgesDirective } from '../../directives/scroll-edges.directive';
import { ActivatedRoute } from '@angular/router';
import { BoardLayoutService } from '../board-layout.service';
import { PlayHubService } from '../play-hub.service';
import { ChoiceView, ObjectView, TargetDto } from '../../models/play.models';

/**
 * The game board.
 *
 * Designed narrow first and judged at 375 × 667: the opponent reads as one strip along the top,
 * the two battlefields share the middle, and the player's hand pans along the bottom where a
 * thumb reaches. Nothing here is a desktop layout that was later squeezed.
 *
 * It holds no rules. Every button sends an intent and waits for the server's next view, so the
 * board cannot disagree with the game — if the rules refuse something, the refusal comes back
 * and is shown rather than guessed at in advance.
 */
@Component({
  selector: 'app-game-board',
  standalone: true,
  imports: [CommonModule, ScrollEdgesDirective],
  templateUrl: './game-board.component.html',
  styleUrls: ['./game-board.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameBoardComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly layoutService = inject(BoardLayoutService);

  readonly hub = inject(PlayHubService);

  /** Which card in hand is selected, so a second tap can play it. */
  selectedCardId: string | null = null;

  /**
   * The card waiting for a target, if any.
   *
   * A spell that needs a target cannot be cast without one — the server refuses it — so the
   * board asks for the target before sending anything rather than sending a doomed cast and
   * showing the refusal.
   */
  targetingCardId: string | null = null;

  /** Picks made so far against the pending choice, in order. */
  picks: string[] = [];

  /** Attackers chosen this combat, before they are declared. */
  chosenAttackers = new Set<string>();

  /** Blocker → the attacker it is being assigned to. */
  chosenBlocks = new Map<string, string>();

  /** The attacker a blocker is being assigned to, mid-assignment. */
  blockingFor: string | null = null;

  readonly board = computed(() => {
    const view = this.hub.view();
    return view ? this.layoutService.layout(view) : null;
  });

  ngOnInit(): void {
    const gameId = this.route.snapshot.paramMap.get('gameId');
    if (gameId) {
      void this.hub.join(gameId);
    }
  }

  ngOnDestroy(): void {
    void this.hub.leave();
  }

  /** Printed power and toughness with counters applied; see the service for why "printed". */
  stats(card: ObjectView): string | null {
    return this.layoutService.printedStats(card);
  }

  isLand(card: ObjectView): boolean {
    return this.layoutService.isLand(card);
  }

  select(card: ObjectView): void {
    this.selectedCardId = this.selectedCardId === card.id ? null : card.id;
  }

  /** The decision the game is waiting on, or null. */
  get choice(): ChoiceView | null {
    return this.hub.view()?.choice ?? null;
  }

  /** True when the pending decision is this player's to make. */
  get isMyChoice(): boolean {
    const choice = this.choice;
    return !!choice && choice.playerId === this.hub.view()?.viewer;
  }

  /** True when the player has picked enough to answer. */
  get canSubmitChoice(): boolean {
    const choice = this.choice;
    return !!choice && this.picks.length >= choice.minPicks;
  }

  /** Where a pick sits in the order, for an ordering choice (1-based); 0 when unpicked. */
  pickOrder(optionId: string): number {
    return this.picks.indexOf(optionId) + 1;
  }

  togglePick(optionId: string): void {
    const choice = this.choice;
    if (!choice) {
      return;
    }

    const at = this.picks.indexOf(optionId);
    if (at >= 0) {
      this.picks.splice(at, 1);
      return;
    }

    // A choice that takes one answer replaces rather than refusing the tap: tapping a second
    // option plainly means "that one instead".
    if (choice.maxPicks === 1) {
      this.picks = [optionId];
      return;
    }

    if (this.picks.length < choice.maxPicks) {
      this.picks.push(optionId);
    }
  }

  submitChoice(): void {
    if (!this.canSubmitChoice) {
      return;
    }

    const picks = [...this.picks];
    this.picks = [];
    void this.hub.choose(picks);
  }

  /**
   * Plays the selected card: a land is played, anything else is cast (CR 305.1).
   *
   * A spell the player has to target waits for one instead of being sent and refused. The board
   * cannot tell which spells target — that is the card's text, which lives on the server — so
   * it offers targeting for every nonland and lets the player skip it.
   */
  play(card: ObjectView): void {
    this.selectedCardId = null;

    if (this.isLand(card)) {
      void this.hub.playLand(card.id);
      return;
    }

    this.targetingCardId = card.id;
  }

  /** Casts the spell that is waiting for a target, at the given target. */
  castAt(target: TargetDto | null): void {
    const cardId = this.targetingCardId;
    if (!cardId) {
      return;
    }

    this.targetingCardId = null;
    void this.hub.castSpell(cardId, target ? [target] : []);
  }

  targetPlayer(playerId: string): void {
    this.castAt({ kind: 'player', objectId: null, playerId });
  }

  targetPermanent(card: ObjectView): void {
    this.castAt({ kind: 'permanent', objectId: card.id, playerId: null });
  }

  cancelTargeting(): void {
    this.targetingCardId = null;
  }

  // ---- Combat ----------------------------------------------------------------------------

  /** True while the active player is choosing attackers (CR 508.1). */
  get isDeclaringAttackers(): boolean {
    const board = this.board();
    return !!board && board.isMyTurn && this.stepIs('DeclareAttackers');
  }

  /** True while the defending player is choosing blockers (CR 509.1). */
  get isDeclaringBlockers(): boolean {
    const board = this.board();
    return !!board && !board.isMyTurn && this.stepIs('DeclareBlockers');
  }

  toggleAttacker(card: ObjectView): void {
    if (this.chosenAttackers.has(card.id)) {
      this.chosenAttackers.delete(card.id);
    } else {
      this.chosenAttackers.add(card.id);
    }
  }

  declareAttackers(): void {
    const board = this.board();
    if (!board) {
      return;
    }

    const defender = board.opponents[0]?.playerId;
    const attackers: Record<string, string> = {};
    for (const id of this.chosenAttackers) {
      attackers[id] = defender;
    }

    this.chosenAttackers.clear();
    void this.hub.declareAttackers(attackers);
  }

  /** Picks which attacker the next blocker will be assigned to. */
  blockFor(attacker: ObjectView): void {
    this.blockingFor = this.blockingFor === attacker.id ? null : attacker.id;
  }

  toggleBlocker(card: ObjectView): void {
    if (this.chosenBlocks.get(card.id) === this.blockingFor || !this.blockingFor) {
      this.chosenBlocks.delete(card.id);
      return;
    }

    this.chosenBlocks.set(card.id, this.blockingFor);
  }

  blockedBy(card: ObjectView): boolean {
    return this.chosenBlocks.has(card.id);
  }

  declareBlockers(): void {
    const blocks: Record<string, string[]> = {};
    for (const [blocker, attacker] of this.chosenBlocks) {
      (blocks[attacker] ??= []).push(blocker);
    }

    this.chosenBlocks.clear();
    this.blockingFor = null;
    void this.hub.declareBlockers(blocks);
  }

  private stepIs(step: string): boolean {
    return this.hub.step() === step;
  }

  pass(): void {
    void this.hub.passPriority();
  }

  /**
   * What tapping one of your own permanents means, which depends on where the game is.
   *
   * One control with a context rather than three that appear and disappear: on a phone the
   * battlefield is the scarce space, and a row of mode buttons over it costs more than it
   * explains.
   */
  tapMine(card: ObjectView): void {
    if (this.targetingCardId) {
      this.targetPermanent(card);
      return;
    }

    if (this.isDeclaringAttackers) {
      this.toggleAttacker(card);
      return;
    }

    if (this.isDeclaringBlockers) {
      this.toggleBlocker(card);
      return;
    }

    this.activate(card);
  }

  /** Tapping an opposing permanent: a target, or the attacker a blocker is assigned to. */
  tapTheirs(card: ObjectView): void {
    if (this.targetingCardId) {
      this.targetPermanent(card);
      return;
    }

    if (this.isDeclaringBlockers && this.isAttacking(card)) {
      this.blockFor(card);
    }
  }

  /** Whether this creature is attacking right now (CR 508.1k). */
  isAttacking(card: ObjectView): boolean {
    return !!this.hub.view()?.attackers[card.id];
  }

  trackByOption(_index: number, option: { id: string }): string {
    return option.id;
  }

  activate(card: ObjectView): void {
    // Every activated ability in the pool today is a mana ability with the same id. When the
    // pool grows past that, this becomes a picker rather than a guess.
    void this.hub.activateAbility(card.id, 'mana');
  }

  dismissRefusal(): void {
    this.hub.acknowledge();
  }

  trackById(_index: number, card: ObjectView): string {
    return card.id;
  }

  trackByLine(index: number): number {
    return index;
  }
}
