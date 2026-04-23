import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Router } from '@angular/router';
import { tap, switchMap, map, catchError, of, withLatestFrom } from 'rxjs';
import { GameActions } from './game.actions';
import { UIActions } from '../ui/ui.actions';
import { AppState } from '..';
import { GameResult } from '../../models/game.models';
import { SignalRService } from '../../services/signalr.service';
import { GameApiService } from '../../services/game-api.service';
import {
  selectPendingAttackers,
  selectPendingBlockers,
  selectPendingTargets,
  selectSelectedCardId,
} from '../selectors';

@Injectable()
export class GameEffects {

  // Join game: connect SignalR then request state
  joinGame$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GameActions.joinGame),
      switchMap(({ gameId, playerToken }) =>
        this.api.joinGame(gameId, playerToken).pipe(
          tap(res => {
            // Store the local player ID from join response
            // Then connect SignalR
            this.signalr.connect(gameId, playerToken);
          }),
          map(res => GameActions.gameJoined({ gameState: res.initialState, localPlayerId: res.playerId })),
          catchError(err => of(GameActions.connectionError({ error: err.message }))),
        )
      ),
    )
  );

  // Pass priority
  passPriority$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GameActions.passPriority),
      tap(() => this.signalr.passpriority()),
    ),
    { dispatch: false }
  );

  // Cast spell — gather targets from UI state first
  castSpell$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GameActions.castSpell),
      tap(({ cardId, targetIds }) =>
        this.signalr.castSpell(cardId, targetIds)
      ),
    ),
    { dispatch: false }
  );

  // Play land
  playLand$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GameActions.playLand),
      tap(({ cardId }) => this.signalr.playLand(cardId)),
    ),
    { dispatch: false }
  );

  // Activate mana
  activateMana$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GameActions.activateMana),
      tap(({ permanentId }) => this.signalr.activateMana(permanentId)),
    ),
    { dispatch: false }
  );

  // Untap land (undo mana activation)
  untapLand$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GameActions.untapLand),
      tap(({ permanentId }) => this.signalr.untapLand(permanentId)),
    ),
    { dispatch: false }
  );

  // Declare attackers — pull pending list from UI state
  declareAttackers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GameActions.declareAttackers),
      withLatestFrom(this.store.select(selectPendingAttackers)),
      tap(([{ attackerIds }]) => this.signalr.declareAttackers(attackerIds)),
    ),
    { dispatch: false }
  );

  // Declare blockers
  declareBlockers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GameActions.declareBlockers),
      tap(({ blockerToAttacker }) => this.signalr.declareBlockers(blockerToAttacker)),
    ),
    { dispatch: false }
  );

  // Confirm attackers from UI -> dispatch game action
  confirmAttackers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UIActions.confirmAttackers),
      withLatestFrom(this.store.select(selectPendingAttackers)),
      map(([, attackerIds]) => GameActions.declareAttackers({ attackerIds })),
    )
  );

  // Confirm blockers from UI -> dispatch game action
  confirmBlockers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UIActions.confirmBlockers),
      withLatestFrom(this.store.select(selectPendingBlockers)),
      map(([, blockerToAttacker]) => GameActions.declareBlockers({ blockerToAttacker })),
    )
  );

  // Concede
  concede$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GameActions.concede),
      tap(() => this.signalr.concede()),
    ),
    { dispatch: false }
  );

  // If the game is already over when we join (reconnect to a finished game),
  // clear the session and send the player back to the lobby.
  gameOverOnJoin$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GameActions.gameJoined),
      tap(({ gameState }) => {
        if (gameState.result !== GameResult.InProgress) {
          localStorage.removeItem('mtg_session');
          this.router.navigate(['/']);
        }
      }),
    ),
    { dispatch: false }
  );

  // Connection error (invalid token, game not found, etc.) → back to lobby.
  connectionError$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GameActions.connectionError),
      tap(() => {
        localStorage.removeItem('mtg_session');
        this.router.navigate(['/']);
      }),
    ),
    { dispatch: false }
  );

  constructor(
    private actions$: Actions,
    private store: Store<AppState>,
    private signalr: SignalRService,
    private api: GameApiService,
    private router: Router,
  ) {}
}
