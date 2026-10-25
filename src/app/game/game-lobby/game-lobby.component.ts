import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subscription, forkJoin } from 'rxjs';
import { GameTableApiService } from '../game-table-api.service';
import { GameTable, TableDeck } from '../../models/game-table.models';

@Component({
  selector: 'app-game-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-lobby.component.html',
  styleUrls: ['./game-lobby.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameLobbyComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private refreshRequest?: Subscription;
  private searchRequest?: Subscription;
  private readonly api = inject(GameTableApiService);
  private readonly router = inject(Router);
  readonly decks = signal<TableDeck[]>([]);
  readonly tables = signal<GameTable[]>([]);
  readonly players = signal<{ userId: string; username: string }[]>([]);
  readonly invited = signal<{ userId: string; username: string }[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly refusal = signal<string | null>(null);
  myDeckId = '';
  search = '';
  startingLife = 40;
  allowHonourSystem = false;
  readonly selections: Record<string, string> = {};

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    if (this.busy()) return;
    this.loading.set(true);
    this.refreshRequest?.unsubscribe();
    this.refreshRequest = forkJoin({ decks: this.api.decks(), tables: this.api.list() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.decks.set(result.decks);
          this.tables.set(result.tables);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.fail(error);
        },
      });
  }

  searchPlayers(): void {
    this.searchRequest?.unsubscribe();
    if (this.search.trim().length < 2) {
      this.players.set([]);
      return;
    }
    const query = this.search;
    this.searchRequest = this.api
      .players(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (players) => {
          if (query === this.search) this.players.set(players);
        },
        error: (error: HttpErrorResponse) => this.fail(error),
      });
  }

  invite(player: { userId: string; username: string }): void {
    if (this.invited().length < 3 && !this.invited().some((item) => item.userId === player.userId))
      this.invited.update((current) => [...current, player]);
  }

  remove(userId: string): void {
    this.invited.update((current) => current.filter((item) => item.userId !== userId));
  }

  create(): void {
    const deck = this.decks().find((item) => item.id === this.myDeckId);
    if (!deck?.format || !this.invited().length || this.busy()) return;
    this.mutate(
      this.api.create({
        deckId: deck.id,
        capacity: this.invited().length + 1,
        format: deck.format,
        startingLife: this.startingLife,
        allowHonourSystem: this.allowHonourSystem,
        invitees: this.invited().map((player) => player.userId),
      }),
    );
  }

  bringDeck(table: GameTable): void {
    const deck = this.selections[table.id];
    if (deck) this.mutate(this.api.bringDeck(table, deck));
  }

  leave(table: GameTable): void {
    this.mutate(this.api.leave(table));
  }

  start(table: GameTable): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.refusal.set(null);
    this.api
      .start(table)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.open(result.gameId);
        },
        error: (error: HttpErrorResponse) => {
          this.busy.set(false);
          this.fail(error);
          this.refresh();
        },
      });
  }

  open(gameId: string): void {
    void this.router.navigate(['/game', gameId]);
  }

  ready(table: GameTable): boolean {
    return table.seats.length === table.capacity && table.seats.every((seat) => seat.ready);
  }

  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }
  trackPlayer(_index: number, item: { userId: string }): string {
    return item.userId;
  }

  private mutate(request: Observable<GameTable>): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.refusal.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.fail(error);
        this.refresh();
      },
    });
  }

  private fail(error: HttpErrorResponse): void {
    this.refusal.set(
      error.error?.detail ??
        error.error?.title ??
        'The table could not be updated. Try refreshing.',
    );
  }
}
