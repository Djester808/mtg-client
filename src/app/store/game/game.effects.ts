import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Router } from '@angular/router';
import {
  tap,
  exhaustMap,
  switchMap,
  map,
  catchError,
  of,
  withLatestFrom,
  filter,
  takeUntil,
} from 'rxjs';
import { GameActions } from './game.actions';
import { UIActions } from '../ui/ui.actions';
import { AppState } from '..';
import { GameResult } from '../../models/game.models';
import { SignalRService } from '../../services/signalr.service';
import { GameApiService } from '../../services/game-api.service';
import {
  selectPendingAttackers,
  selectPendingAttackTargets,
  selectPendingBlockers,
  selectPendingTargets,
  selectTargetCount,
  selectTargetSourceCardId,
  selectTargetAbilityId,
  selectVariableValue,
  selectAnnouncement,
  selectBattlefield,
  selectCastDraft,
  selectLocalPlayer,
} from '../selectors';

@Injectable()
export class GameEffects {
  // Join game: connect SignalR then request state
  joinGame$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GameActions.joinGame),
      tap(() => {
        void this.signalr.disconnect();
      }),
      switchMap(({ gameId, playerToken }) =>
        this.api.joinGame(gameId, playerToken).pipe(
          takeUntil(this.actions$.pipe(ofType(GameActions.leaveGame))),
          tap(() => {
            this.signalr.connect(gameId, playerToken);
          }),
          map((res) =>
            GameActions.gameJoined({ gameState: res.initialState, localPlayerId: res.playerId }),
          ),
          catchError((err) => of(GameActions.connectionError({ error: err.message }))),
        ),
      ),
    ),
  );

  leaveGame$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(GameActions.leaveGame),
        tap(() => {
          void this.signalr.disconnect();
        }),
      ),
    { dispatch: false },
  );

  // Pass priority
  passPriority$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(GameActions.passPriority),
        tap(() => this.signalr.passpriority()),
      ),
    { dispatch: false },
  );

  // Cast spell — gather targets from UI state first
  castSpell$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(GameActions.castSpell),
        tap(({ cardId, targetIds, variableValue }) =>
          this.signalr.castSpell(cardId, targetIds, variableValue ?? 0),
        ),
      ),
    { dispatch: false },
  );

  submitCast$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UIActions.submitCast),
      withLatestFrom(this.store.select(selectCastDraft)),
      filter(([, draft]) => !!draft && draft.stage === 'review'),
      switchMap(([, draft]) => [
        UIActions.markCastSubmitting(),
        GameActions.castSpell({
          cardId: draft!.card.cardId,
          targetIds: draft!.targets,
          variableValue: draft!.x,
        }),
      ]),
    ),
  );
  finishCast$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GameActions.stateSynced),
      withLatestFrom(this.store.select(selectCastDraft), this.store.select(selectLocalPlayer)),
      filter(
        ([, draft, player]) =>
          !!draft &&
          draft.stage === 'submitting' &&
          !!player &&
          !player.hand.some((c) => c.cardId === draft.card.cardId),
      ),
      map(() => UIActions.cancelCast()),
    ),
  );
  // Play land
  playLand$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(GameActions.playLand),
        tap(({ cardId }) => this.signalr.playLand(cardId)),
      ),
    { dispatch: false },
  );

  // Activate an ability offered by the engine
  activateAbility$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(GameActions.activateAbility),
        tap(({ permanentId, abilityId, targetIds, variableValue }) =>
          this.signalr.activateAbility(permanentId, abilityId, targetIds, variableValue ?? 0),
        ),
      ),
    { dispatch: false },
  );

  // Declare attackers — pull pending list from UI state
  declareAttackers$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(GameActions.declareAttackers),
        withLatestFrom(this.store.select(selectPendingAttackers)),
        tap(([{ attackerIds, defenders }]) =>
          defenders
            ? this.signalr.declareAttackers(attackerIds, defenders)
            : this.signalr.declareAttackers(attackerIds),
        ),
      ),
    { dispatch: false },
  );

  // Declare blockers
  declareBlockers$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(GameActions.declareBlockers),
        tap(({ blockerToAttacker }) => this.signalr.declareBlockers(blockerToAttacker)),
      ),
    { dispatch: false },
  );

  // Confirm attackers from UI -> dispatch game action
  confirmAttackers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UIActions.confirmAttackers),
      withLatestFrom(
        this.store.select(selectPendingAttackers),
        this.store.select(selectPendingAttackTargets),
      ),
      map(([, attackerIds, defenders]) =>
        GameActions.declareAttackers(
          Object.keys(defenders).length ? { attackerIds, defenders } : { attackerIds },
        ),
      ),
    ),
  );

  // Confirm blockers from UI -> dispatch game action
  confirmBlockers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UIActions.confirmBlockers),
      withLatestFrom(this.store.select(selectPendingBlockers)),
      map(([, blockerToAttacker]) => GameActions.declareBlockers({ blockerToAttacker })),
    ),
  );

  // Concede
  concede$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(GameActions.concede),
        exhaustMap(async () => {
          try {
            await this.signalr.concede();
            await this.signalr.disconnect();
            localStorage.removeItem('mtg_session');
            await this.router.navigate(['/lobby']);
          } catch {
            // The transport reports the error. Preserve the table so the player can retry.
            return;
          }
        }),
      ),
    { dispatch: false },
  );

  /**
   * Casts the spell once it has the targets it was waiting for (CR 601.2c).
   *
   * Keyed on `addTarget` rather than on `confirmTargets`, and deliberately: reducers run before
   * effects, and `confirmTargets` clears the picks — the same trap that made confirming an
   * attack declare nothing. Reading them on the action that *adds* one means the state has just
   * been updated with it.
   */
  castWhenTargeted$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UIActions.addTarget),
      withLatestFrom(
        this.store.select(selectTargetSourceCardId),
        this.store.select(selectPendingTargets),
        this.store.select(selectTargetCount),
        this.store.select(selectTargetAbilityId),
        this.store.select(selectVariableValue),
        this.store.select(selectCastDraft),
      ),
      filter(([, cardId, targets, count]) => !!cardId && targets.length >= count),
      // An ability finishes by being activated, a spell by being cast. Everything used to end
      // in a cast, so pointing an Icy Manipulator would have tried to cast the Icy Manipulator.
      switchMap(([, cardId, targets, , abilityId, variableValue, draft]) =>
        draft
          ? [UIActions.setCastTargets({ targets })]
          : [
              abilityId
                ? GameActions.activateAbility({
                    permanentId: cardId!,
                    abilityId,
                    targetIds: targets,
                    variableValue,
                  })
                : GameActions.castSpell({ cardId: cardId!, targetIds: targets, variableValue }),
              UIActions.confirmTargets(),
            ],
      ),
    ),
  );

  /**
   * What an activated ability needs before it can be sent (CR 602.2).
   *
   * The order is the rules' order and it is why this is one place rather than three: the number
   * for a cost written with {X} is announced first (CR 601.2b), targets are chosen after
   * (CR 601.2c), and only then is anything sent. A board that offered an {X} ability as a plain
   * button sent an X of zero — a storage land tapping for no mana at all.
   */
  abilityChosen$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UIActions.chooseAbility),
      withLatestFrom(this.store.select(selectBattlefield)),
      map(([{ permanentId, abilityId }, battlefield]) => {
        const ability = battlefield
          .find((p) => p.permanentId === permanentId)
          ?.abilities.find((a) => a.id === abilityId);

        if (ability?.announcesVariable) {
          return UIActions.enterAnnounceMode({
            sourceId: permanentId,
            abilityId,
            targetCount: ability.targetCount,
          });
        }
        if ((ability?.targetCount ?? 0) > 0) {
          // CR 602.2b: the targets are chosen as the ability is activated, so the board has to
          // ask before it sends anything.
          return UIActions.enterTargetMode({
            sourceCardId: permanentId,
            targetCount: ability!.targetCount,
            abilityId,
          });
        }
        return GameActions.activateAbility({ permanentId, abilityId, targetIds: [] });
      }),
    ),
  );

  /**
   * Finishes an announcement once the player has named the number (CR 601.2b).
   *
   * X is announced before targets are chosen (CR 601.2c comes after 601.2b), so this either
   * hands the value on to the targeting step or, when nothing is targeted, sends it.
   *
   * Read off the *state* rather than off the action for the same reason `castWhenTargeted$` is:
   * reducers run first, and the value has to arrive somewhere the follow-up can find it. The
   * confirmation keeps the source standing and only the send clears it.
   */
  announced$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UIActions.confirmAnnounce),
      withLatestFrom(this.store.select(selectAnnouncement)),
      filter(([, announcement]) => !!announcement),
      map(([{ value }, announcement]) => {
        const { sourceId, abilityId, targetCount } = announcement!;
        if (targetCount > 0) {
          return UIActions.enterTargetMode({
            sourceCardId: sourceId,
            targetCount,
            abilityId: abilityId ?? undefined,
            variableValue: value,
          });
        }
        return abilityId
          ? GameActions.activateAbility({
              permanentId: sourceId,
              abilityId,
              targetIds: [],
              variableValue: value,
            })
          : GameActions.castSpell({ cardId: sourceId, targetIds: [], variableValue: value });
      }),
    ),
  );

  // Answering the decision the game has stopped for.
  choose$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(GameActions.choose),
        tap(({ picks, control }) =>
          control ? this.signalr.choose(picks, control) : this.signalr.choose(picks),
        ),
      ),
    { dispatch: false },
  );

  // If the game is already over when we join (reconnect to a finished game),
  // clear the session and send the player back to the lobby.
  gameOverOnJoin$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(GameActions.gameJoined),
        tap(({ gameState }) => {
          if (gameState.result !== GameResult.InProgress) {
            localStorage.removeItem('mtg_session');
            this.router.navigate(['/']);
          }
        }),
      ),
    { dispatch: false },
  );

  // Connection error (invalid token, game not found, etc.) → back to lobby.
  connectionError$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(GameActions.connectionError),
        tap(() => {
          localStorage.removeItem('mtg_session');
          this.router.navigate(['/']);
        }),
      ),
    { dispatch: false },
  );

  constructor(
    private actions$: Actions,
    private store: Store<AppState>,
    private signalr: SignalRService,
    private api: GameApiService,
    private router: Router,
  ) {}
}
