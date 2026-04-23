import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, mergeMap, of, switchMap } from 'rxjs';
import { CollectionActions } from './collection.actions';
import { CollectionApiService } from '../../services/collection-api.service';

@Injectable()
export class CollectionEffects {

  loadCollections$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.loadCollections),
      switchMap(() =>
        this.api.getCollections().pipe(
          map(collections => CollectionActions.loadCollectionsSuccess({ collections })),
          catchError(err => of(CollectionActions.loadCollectionsFailure({ error: err.message }))),
        )
      ),
    )
  );

  loadCollection$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.loadCollection),
      switchMap(({ id }) =>
        this.api.getCollection(id).pipe(
          map(collection => CollectionActions.loadCollectionSuccess({ collection })),
          catchError(err => of(CollectionActions.loadCollectionFailure({ error: err.message }))),
        )
      ),
    )
  );

  createCollection$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.createCollection),
      switchMap(({ request }) =>
        this.api.createCollection(request).pipe(
          map(collection => CollectionActions.createCollectionSuccess({ collection })),
          catchError(err => of(CollectionActions.createCollectionFailure({ error: err.message }))),
        )
      ),
    )
  );

  deleteCollection$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.deleteCollection),
      mergeMap(({ id }) =>
        this.api.deleteCollection(id).pipe(
          map(() => CollectionActions.deleteCollectionSuccess({ id })),
          catchError(() => of(CollectionActions.deleteCollectionSuccess({ id }))),
        )
      ),
    )
  );

  addCard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.addCard),
      mergeMap(({ collectionId, request }) =>
        this.api.addCard(collectionId, request).pipe(
          map(card => CollectionActions.addCardSuccess({ card })),
          catchError(err => of(CollectionActions.addCardFailure({ error: err.message }))),
        )
      ),
    )
  );

  updateCard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.updateCard),
      mergeMap(({ collectionId, cardId, request }) =>
        this.api.updateCard(collectionId, cardId, request).pipe(
          map(card => CollectionActions.updateCardSuccess({ card })),
          catchError(err => of(CollectionActions.updateCardFailure({ error: err.message }))),
        )
      ),
    )
  );

  removeCard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.removeCard),
      mergeMap(({ collectionId, cardId }) =>
        this.api.removeCard(collectionId, cardId).pipe(
          map(() => CollectionActions.removeCardSuccess({ cardId })),
          catchError(err => of(CollectionActions.removeCardFailure({ error: err.message }))),
        )
      ),
    )
  );

  constructor(
    private actions$: Actions,
    private api: CollectionApiService,
  ) {}
}
