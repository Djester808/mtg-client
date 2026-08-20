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
import {
  AttackTarget,
  ChoiceView,
  ObjectView,
  PlayerView,
  TargetDto,
} from '../../models/play.models';

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

  /** Attackers chosen this combat, and what each is aimed at, before they are declared. */
  chosenAttackers = new Map<string, AttackTarget>();

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

  /** A planeswalker's loyalty, shown where a creature shows its power and toughness. */
  loyalty(card: ObjectView): string | null {
    return this.layoutService.loyalty(card);
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

  /** How much has been assigned to an option, for a division (CR 510.1c). */
  assigned(optionId: string): number {
    return this.picks.filter((p) => p === optionId).length;
  }

  /** How much of a division is still unassigned. */
  get leftToDivide(): number {
    const choice = this.choice;
    return choice ? Math.max(0, choice.maxPicks - this.picks.length) : 0;
  }

  /** Clears the picks, so a division can be started over without leaving the prompt. */
  clearPicks(): void {
    this.picks = [];
  }

  /** Commander damage this player has taken, for the strip (CR 903.10a). */
  commanderDamage(player: PlayerView): { name: string; amount: number }[] {
    return Object.entries(player.commanderDamage ?? {}).map(([name, amount]) => ({
      name,
      amount,
    }));
  }

  togglePick(optionId: string): void {
    const choice = this.choice;
    if (!choice) {
      return;
    }

    // A division is answered by picking an option once per point (CR 510.1c), so tapping the
    // same blocker again means "and another point to it" rather than "undo".
    if (choice.isDivision) {
      if (this.picks.length < choice.maxPicks) {
        this.picks.push(optionId);
      }

      return;
    }

    const at = this.picks.indexOf(optionId);
    if (at >= 0) {
      this.picks.splice(at, 1);
      return;
    }

    // A choice that takes one answer is answered by the tap.
    //
    // Nothing renders a Confirm for it — the template only offers one when maxPicks > 1 — so
    // recording the pick and waiting was waiting for a button that does not exist. Every game
    // opens on the mulligan, which is a single-pick choice, so the board could be opened and
    // then never played: the tap registered, nothing was sent, and the next action came back
    // "the game is waiting on a decision".
    if (choice.maxPicks === 1) {
      this.picks = [optionId];
      this.submitChoice();
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

  /**
   * True while the active player is still choosing attackers (CR 508.1).
   *
   * It has to stop being true once they have declared. Priority is given inside this same step
   * afterwards (CR 508.2), and the board hides Pass while a declaration is pending — so a board
   * that kept saying "still choosing" left the player holding priority with nothing to press
   * but an attack button the engine now refuses.
   */
  get isDeclaringAttackers(): boolean {
    const board = this.board();
    return (
      !!board &&
      board.isMyTurn &&
      this.stepIs('DeclareAttackers') &&
      !this.hub.view()?.attackersDeclared
    );
  }

  /** True while the defending player is still choosing blockers (CR 509.1). */
  get isDeclaringBlockers(): boolean {
    const board = this.board();
    return (
      !!board &&
      !board.isMyTurn &&
      this.stepIs('DeclareBlockers') &&
      !this.hub.view()?.blockersDeclared
    );
  }

  /**
   * Every planeswalker the defending player controls (CR 508.1b), in board order.
   *
   * Only the defender's: a planeswalker you control is not something you can attack, and
   * offering it would produce a move the engine refuses.
   */
  get attackableWalkers(): ObjectView[] {
    const defender = this.board()?.opponents[0]?.playerId;
    if (!defender) {
      return [];
    }

    return (this.hub.view()?.battlefield ?? []).filter(
      (card) => card.controllerId === defender && card.isPlaneswalker,
    );
  }

  /**
   * Cycles a creature through what it can attack: the player, then each planeswalker, then
   * nothing.
   *
   * Aiming is the same tap that chooses the attacker, rather than a second control, because
   * there is no room on a phone for a target picker per creature and a drag is the interaction
   * this repo has already had die on touch. With no planeswalkers out it is exactly the toggle
   * it was, which is the common case.
   */
  toggleAttacker(card: ObjectView): void {
    const defender = this.board()?.opponents[0]?.playerId;
    // Only a creature attacks (CR 508.1a). Without this the board happily marked a Forest as
    // an attacker and let the player press the button, and the only thing that said otherwise
    // was the server's refusal a moment later.
    if (!defender || !card.isCreature) {
      return;
    }

    const walkers = this.attackableWalkers;
    const current = this.chosenAttackers.get(card.id);

    if (!current) {
      this.chosenAttackers.set(card.id, { defendingPlayer: defender, planeswalker: null });
      return;
    }

    const at = current.planeswalker ? walkers.findIndex((w) => w.id === current.planeswalker) : -1;
    const next = walkers[at + 1];

    if (next) {
      this.chosenAttackers.set(card.id, { defendingPlayer: defender, planeswalker: next.id });
    } else {
      this.chosenAttackers.delete(card.id);
    }
  }

  /**
   * What a chosen attacker is aimed at, for the badge on its card.
   *
   * A planeswalker is named the way players name it — "Chandra", not "Chandra, Torch of
   * Defiance". The badge sits on a card that is a third of a 375px row, and the full name only
   * ever reached the screen as "Chandra, Torch of…", which tells a player less than the first
   * word does and costs the row its shape.
   */
  attackTargetName(card: ObjectView): string | null {
    const chosen = this.chosenAttackers.get(card.id);
    if (!chosen) {
      return null;
    }

    const walker = this.attackableWalkers.find((w) => w.id === chosen.planeswalker);
    return walker ? walker.name.split(',')[0].trim() : (this.board()?.opponents[0]?.name ?? null);
  }

  declareAttackers(): void {
    const attackers: Record<string, AttackTarget> = {};
    for (const [id, target] of this.chosenAttackers) {
      attackers[id] = target;
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

  /**
   * How many declared attackers are aimed at this permanent (CR 508.1b).
   *
   * Zero rather than null, so the template's `as` binding drops the badge on its own — a
   * planeswalker nobody is attacking should say nothing, not "under attack (0)".
   */
  attackersAimedAt(card: ObjectView): number {
    const declared = Object.values(this.hub.view()?.attackers ?? {});
    const choosing = [...this.chosenAttackers.values()];

    return [...declared, ...choosing].filter((target) => target.planeswalker === card.id).length;
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
