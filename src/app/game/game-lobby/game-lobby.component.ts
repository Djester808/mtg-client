import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PlayApiService } from '../play-api.service';
import { GameInvite, PlayableDeck } from '../../models/play.models';

/**
 * Starting a game.
 *
 * This is the piece that was missing: the engine could play a game and the board could show one,
 * with no way to get from a deck list to a table. A feature nobody can reach is not a feature,
 * however much of it works.
 *
 * Each player brings their own deck — the inviter when they invite, the opponent when they
 * accept. That is not a courtesy: a deck list is not public, and a lobby that let you choose
 * somebody else's deck would need an endpoint handing out everyone's, which is a privacy hole
 * opened to save a click.
 *
 * The refusal matters as much as the success. The engine only plays cards it implements, so most
 * real decks cannot be played yet, and the server answers with the names of the ones it does not
 * know. Showing that list is the difference between "the engine is small" and "this is broken".
 */
@Component({
  selector: 'app-game-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-lobby.component.html',
  styleUrls: ['./game-lobby.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameLobbyComponent implements OnInit {
  private readonly api = inject(PlayApiService);
  private readonly router = inject(Router);

  readonly decks = signal<PlayableDeck[]>([]);
  readonly players = signal<{ userId: string; username: string }[]>([]);
  readonly invites = signal<GameInvite[]>([]);
  readonly sent = signal<GameInvite[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);

  /** Why the last attempt was refused — usually the cards the engine cannot play. */
  readonly refusal = signal<string | null>(null);

  myDeckId = '';
  opponentId = '';
  startingLife = 20;

  /** The deck being brought to whichever invitation is accepted. */
  acceptWithDeckId = '';

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.api.decks().subscribe({
      next: (decks) => {
        this.decks.set(decks);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.api.players().subscribe({
      next: (players) => this.players.set(players),
      error: () => this.players.set([]),
    });

    this.api.invites().subscribe({ next: (i) => this.invites.set(i), error: () => undefined });
    this.api.sentInvites().subscribe({ next: (i) => this.sent.set(i), error: () => undefined });
  }

  get canInvite(): boolean {
    return !!this.myDeckId && !!this.opponentId && !this.busy();
  }

  invite(): void {
    if (!this.canInvite) {
      return;
    }

    this.busy.set(true);
    this.refusal.set(null);

    this.api
      .invite({
        deckId: this.myDeckId,
        opponentUserId: this.opponentId,
        startingLife: this.startingLife,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.refresh();
        },
        error: (err: HttpErrorResponse) => {
          this.busy.set(false);
          this.refusal.set(this.explain(err));
        },
      });
  }

  accept(invite: GameInvite): void {
    if (!this.acceptWithDeckId || this.busy()) {
      return;
    }

    this.busy.set(true);
    this.refusal.set(null);

    this.api.accept(invite.id, this.acceptWithDeckId).subscribe({
      next: (result) => {
        this.busy.set(false);
        void this.router.navigate(['/play', result.gameId]);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.refusal.set(this.explain(err));
        // The invitation is consumed by an accept whether or not the decks turned out to be
        // playable, so the list is refreshed rather than left showing one that is gone.
        this.refresh();
      },
    });
  }

  withdraw(invite: GameInvite): void {
    this.api.withdraw(invite.id).subscribe({
      next: () => this.refresh(),
      error: () => this.refresh(),
    });
  }

  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }

  /**
   * The server's own words where it has any.
   *
   * "The engine does not implement Sol Ring, Swords to Plowshares, …" is the whole answer to
   * why a game would not start; replacing it with "could not start a game" throws away the
   * only part the player can act on.
   */
  private explain(err: HttpErrorResponse): string {
    return err.error?.detail ?? err.error?.title ?? 'The game could not be started.';
  }
}
