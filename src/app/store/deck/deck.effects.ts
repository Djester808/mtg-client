import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, concatMap, map, mergeMap, of, switchMap, tap } from 'rxjs';
import { DeckActions } from './deck.actions';
import { DeckApiService } from '../../services/deck-api.service';
import { ToastService } from '../../services/toast.service';
import { describeHttpError } from '../../utils/http-error.utils';

@Injectable()
export class DeckEffects {
  loadDecks$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.loadDecks),
      switchMap(() =>
        this.api.getDecks().pipe(
          map((decks) => DeckActions.loadDecksSuccess({ decks })),
          catchError((err) => of(DeckActions.loadDecksFailure({ error: describeHttpError(err) }))),
        ),
      ),
    ),
  );

  loadDeck$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.loadDeck),
      switchMap(({ id }) =>
        this.api.getDeck(id).pipe(
          map((deck) => DeckActions.loadDeckSuccess({ deck })),
          catchError((err) => of(DeckActions.loadDeckFailure({ error: describeHttpError(err) }))),
        ),
      ),
    ),
  );

  // Same fetch as loadDeck, but the reducer never blanks the current deck — the
  // stale view stays up until the fresh one lands.
  refreshDeck$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.refreshDeck),
      switchMap(({ id }) =>
        this.api.getDeck(id).pipe(
          map((deck) => DeckActions.loadDeckSuccess({ deck })),
          catchError((err) => of(DeckActions.loadDeckFailure({ error: describeHttpError(err) }))),
        ),
      ),
    ),
  );

  createDeck$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.createDeck),
      switchMap(({ name, coverUri, format }) =>
        this.api.createDeck({ name, coverUri, format }).pipe(
          map((deck) => DeckActions.createDeckSuccess({ deck })),
          catchError((err) => of(DeckActions.createDeckFailure({ error: describeHttpError(err) }))),
        ),
      ),
    ),
  );

  updateDeckMeta$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.updateDeckMeta),
      switchMap(({ id, name, coverUri, format, commanderOracleId, tags, notes }) =>
        this.api
          .updateDeck(id, {
            name,
            coverUri,
            format,
            commanderOracleId,
            ...(tags !== undefined ? { tags } : {}),
            ...(notes !== undefined ? { notes } : {}),
          })
          .pipe(
            map((deck) => DeckActions.updateDeckMetaSuccess({ deck })),
            catchError((err) =>
              of(DeckActions.updateDeckMetaFailure({ error: describeHttpError(err) })),
            ),
          ),
      ),
    ),
  );

  deleteDeck$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.deleteDeck),
      mergeMap(({ id }) =>
        this.api.deleteDeck(id).pipe(
          map(() => DeckActions.deleteDeckSuccess({ id })),
          catchError((err) => of(DeckActions.deleteDeckFailure({ error: describeHttpError(err) }))),
        ),
      ),
    ),
  );

  addCard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.addCard),
      mergeMap(({ deckId, request }) =>
        this.api.addCard(deckId, request).pipe(
          map((card) => DeckActions.addCardSuccess({ card })),
          catchError((err) =>
            of(DeckActions.addCardFailure({ deckId, error: describeHttpError(err) })),
          ),
        ),
      ),
    ),
  );

  // concatMap, not mergeMap: quantity updates are absolute writes, so they must
  // reach the server in dispatch order or rapid +/- clicks race last-write-wins.
  updateCard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.updateCard),
      concatMap(({ deckId, cardId, request }) =>
        this.api.updateCard(deckId, cardId, request).pipe(
          map((card) => DeckActions.updateCardSuccess({ card })),
          catchError((err) =>
            of(DeckActions.updateCardFailure({ deckId, error: describeHttpError(err) })),
          ),
        ),
      ),
    ),
  );

  removeCard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.removeCard),
      concatMap(({ deckId, cardId }) =>
        this.api.removeCard(deckId, cardId).pipe(
          map(() => DeckActions.removeCardSuccess({ cardId })),
          catchError((err) =>
            of(DeckActions.removeCardFailure({ deckId, error: describeHttpError(err) })),
          ),
        ),
      ),
    ),
  );

  // A failed card mutation leaves the optimistic state wrong — re-fetch so the
  // view tells the truth again.
  resyncAfterCardFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        DeckActions.addCardFailure,
        DeckActions.updateCardFailure,
        DeckActions.removeCardFailure,
      ),
      map(({ deckId }) => DeckActions.refreshDeck({ id: deckId })),
    ),
  );

  notifyFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          DeckActions.createDeckFailure,
          DeckActions.updateDeckMetaFailure,
          DeckActions.deleteDeckFailure,
          DeckActions.addCardFailure,
          DeckActions.updateCardFailure,
          DeckActions.removeCardFailure,
        ),
        tap(({ error }) => this.toast.error(error)),
      ),
    { dispatch: false },
  );

  constructor(
    private actions$: Actions,
    private api: DeckApiService,
    private toast: ToastService,
  ) {}
}
