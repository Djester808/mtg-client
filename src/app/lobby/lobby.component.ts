import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { AppState, GameActions } from '../store';
import { GameApiService } from '../services/game-api.service';
import { BehaviorSubject, finalize } from 'rxjs';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LobbyComponent {
  loading$ = new BehaviorSubject(false);
  error$   = new BehaviorSubject<string | null>(null);

  form = this.fb.group({
    player1Name: ['Alice', [Validators.required, Validators.maxLength(24)]],
    player2Name: ['Bob',   [Validators.required, Validators.maxLength(24)]],
    deckPreset:  ['mono-green', Validators.required],
  });

  readonly DECK_PRESETS = [
    { value: 'mono-green',  label: 'Mono Green Stompy',    colors: ['G'] },
    { value: 'mono-red',    label: 'Mono Red Aggro',       colors: ['R'] },
    { value: 'wu-flyers',   label: 'White Blue Flyers',    colors: ['W', 'U'] },
    { value: 'rb-control',  label: 'Red Black Control',    colors: ['R', 'B'] },
    { value: 'gw-tokens',   label: 'Green White Tokens',   colors: ['G', 'W'] },
  ];

  constructor(
    private fb: FormBuilder,
    private api: GameApiService,
    private store: Store<AppState>,
    private router: Router,
  ) {}

  startGame(): void {
    if (this.form.invalid || this.loading$.value) return;

    const { player1Name, player2Name, deckPreset } = this.form.value;
    this.loading$.next(true);
    this.error$.next(null);

    this.api.createGame({
      player1Name: player1Name!,
      player2Name: player2Name!,
      player1DeckList: [deckPreset!],
      player2DeckList: [deckPreset!],
    }).pipe(
      finalize(() => this.loading$.next(false)),
    ).subscribe({
      next: (res) => {
        localStorage.setItem('mtg_session', JSON.stringify({
          gameId: res.gameId,
          playerToken: res.player1Token,
        }));

        this.store.dispatch(GameActions.joinGame({
          gameId: res.gameId,
          playerToken: res.player1Token,
        }));

        this.router.navigate(['/game', res.gameId]);
      },
      error: (err) => {
        this.error$.next(err?.error?.message ?? 'Failed to create game. Is the API running?');
      },
    });
  }

  colorClass(color: string): string {
    const map: Record<string, string> = {
      W: 'pip-W', U: 'pip-U', B: 'pip-B', R: 'pip-R', G: 'pip-G'
    };
    return map[color] ?? '';
  }
}
