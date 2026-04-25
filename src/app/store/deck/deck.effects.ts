import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, mergeMap, of, switchMap } from 'rxjs';
import { DeckActions } from './deck.actions';
import { CollectionApiService } from '../../services/collection-api.service';
import { encodeDeckMeta } from '../../models/deck.models';

@Injectable()
export class DeckEffects {

  loadDecks$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.loadDecks),
      switchMap(() =>
        this.api.getCollections().pipe(
          map(decks => DeckActions.loadDecksSuccess({ decks })),
          catchError(err => of(DeckActions.loadDecksFailure({ error: err.message }))),
        )
      ),
    )
  );

  loadDeck$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.loadDeck),
      switchMap(({ id }) =>
        this.api.getCollection(id).pipe(
          map(deck => DeckActions.loadDeckSuccess({ deck })),
          catchError(err => of(DeckActions.loadDeckFailure({ error: err.message }))),
        )
      ),
    )
  );

  createDeck$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.createDeck),
      switchMap(({ name, coverUri }) =>
        this.api.createCollection({
          name,
          description: encodeDeckMeta({ coverUri }),
        }).pipe(
          map(deck => DeckActions.createDeckSuccess({ deck })),
          catchError(err => of(DeckActions.createDeckFailure({ error: err.message }))),
        )
      ),
    )
  );

  updateDeckMeta$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.updateDeckMeta),
      switchMap(({ id, name, coverUri }) =>
        this.api.updateCollection(id, {
          name,
          description: encodeDeckMeta({ coverUri }),
        }).pipe(
          map(deck => DeckActions.updateDeckMetaSuccess({ deck })),
          catchError(err => of(DeckActions.updateDeckMetaFailure({ error: err.message }))),
        )
      ),
    )
  );

  deleteDeck$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.deleteDeck),
      mergeMap(({ id }) =>
        this.api.deleteCollection(id).pipe(
          map(() => DeckActions.deleteDeckSuccess({ id })),
          catchError(() => of(DeckActions.deleteDeckSuccess({ id }))),
        )
      ),
    )
  );

  addCard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.addCard),
      mergeMap(({ deckId, request }) =>
        this.api.addCard(deckId, request).pipe(
          map(card => DeckActions.addCardSuccess({ card })),
          catchError(err => of(DeckActions.addCardFailure({ error: err.message }))),
        )
      ),
    )
  );

  updateCard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.updateCard),
      mergeMap(({ deckId, cardId, request }) =>
        this.api.updateCard(deckId, cardId, request).pipe(
          map(card => DeckActions.updateCardSuccess({ card })),
          catchError(err => of(DeckActions.updateCardFailure({ error: err.message }))),
        )
      ),
    )
  );

  removeCard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DeckActions.removeCard),
      mergeMap(({ deckId, cardId }) =>
        this.api.removeCard(deckId, cardId).pipe(
          map(() => DeckActions.removeCardSuccess({ cardId })),
          catchError(err => of(DeckActions.removeCardFailure({ error: err.message }))),
        )
      ),
    )
  );

  constructor(
    private actions$: Actions,
    private api: CollectionApiService,
  ) {}
}
