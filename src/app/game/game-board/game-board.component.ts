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
import { ObjectView } from '../../models/play.models';

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

  /**
   * Plays the selected card: a land is played, anything else is cast (CR 305.1).
   *
   * Targets are not chosen here yet, so a spell that needs one will be refused by the server
   * and say so. That is the honest failure — the alternative is guessing a target on the
   * player's behalf.
   */
  play(card: ObjectView): void {
    this.selectedCardId = null;

    if (this.isLand(card)) {
      void this.hub.playLand(card.id);
      return;
    }

    void this.hub.castSpell(card.id);
  }

  pass(): void {
    void this.hub.passPriority();
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
