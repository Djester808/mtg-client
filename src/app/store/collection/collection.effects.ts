import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import {
  catchError,
  concatMap,
  filter,
  map,
  mergeMap,
  of,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs';
import { AppState } from '..';
import { CollectionActions } from './collection.actions';
import { selectActiveCollection } from './collection.selectors';
import { CollectionApiService } from '../../services/collection-api.service';
import { ToastService } from '../../services/toast.service';
import { describeHttpError } from '../../utils/http-error.utils';

@Injectable()
export class CollectionEffects {
  loadCollections$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.loadCollections),
      switchMap(() =>
        this.api.getCollections().pipe(
          map((collections) => CollectionActions.loadCollectionsSuccess({ collections })),
          catchError((err) =>
            of(CollectionActions.loadCollectionsFailure({ error: describeHttpError(err) })),
          ),
        ),
      ),
    ),
  );

  loadCollection$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.loadCollection),
      switchMap(({ id }) =>
        this.api.getCollection(id).pipe(
          map((collection) => CollectionActions.loadCollectionSuccess({ collection })),
          catchError((err) =>
            of(CollectionActions.loadCollectionFailure({ error: describeHttpError(err) })),
          ),
        ),
      ),
    ),
  );

  // Same fetch as loadCollection, but the reducer never blanks the current view.
  // Guarded so a resync for collection A that resolves after the user opened collection
  // B does not overwrite B with A's cards.
  refreshCollection$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.refreshCollection),
      switchMap(({ id }) =>
        this.api.getCollection(id).pipe(
          withLatestFrom(this.store.select(selectActiveCollection)),
          filter(([collection, active]) => active?.id === collection.id),
          map(([collection]) => CollectionActions.loadCollectionSuccess({ collection })),
          catchError((err) =>
            of(CollectionActions.loadCollectionFailure({ error: describeHttpError(err) })),
          ),
        ),
      ),
    ),
  );

  createCollection$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.createCollection),
      switchMap(({ request }) =>
        this.api.createCollection(request).pipe(
          map((collection) => CollectionActions.createCollectionSuccess({ collection })),
          catchError((err) =>
            of(CollectionActions.createCollectionFailure({ error: describeHttpError(err) })),
          ),
        ),
      ),
    ),
  );

  updateCollectionMeta$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.updateCollectionMeta),
      mergeMap(({ id, name, description, coverUri }) =>
        this.api.updateCollection(id, { name, description, coverUri }).pipe(
          map((collection) => CollectionActions.updateCollectionMetaSuccess({ collection })),
          catchError((err) =>
            of(CollectionActions.updateCollectionMetaFailure({ error: describeHttpError(err) })),
          ),
        ),
      ),
    ),
  );

  deleteCollection$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.deleteCollection),
      mergeMap(({ id }) =>
        this.api.deleteCollection(id).pipe(
          map(() => CollectionActions.deleteCollectionSuccess({ id })),
          catchError((err) =>
            of(CollectionActions.deleteCollectionFailure({ error: describeHttpError(err) })),
          ),
        ),
      ),
    ),
  );

  addCard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.addCard),
      mergeMap(({ collectionId, request }) =>
        this.api.addCard(collectionId, request).pipe(
          map((card) => CollectionActions.addCardSuccess({ card })),
          catchError((err) =>
            of(CollectionActions.addCardFailure({ collectionId, error: describeHttpError(err) })),
          ),
        ),
      ),
    ),
  );

  // concatMap, not mergeMap: quantity updates are absolute writes and must land
  // in dispatch order, or rapid +/- clicks race last-write-wins.
  updateCard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.updateCard),
      concatMap(({ collectionId, cardId, request }) =>
        this.api.updateCard(collectionId, cardId, request).pipe(
          map((card) => CollectionActions.updateCardSuccess({ card })),
          catchError((err) =>
            of(
              CollectionActions.updateCardFailure({ collectionId, error: describeHttpError(err) }),
            ),
          ),
        ),
      ),
    ),
  );

  removeCard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.removeCard),
      concatMap(({ collectionId, cardId }) =>
        this.api.removeCard(collectionId, cardId).pipe(
          map(() => CollectionActions.removeCardSuccess({ cardId })),
          catchError((err) =>
            of(
              CollectionActions.removeCardFailure({ collectionId, error: describeHttpError(err) }),
            ),
          ),
        ),
      ),
    ),
  );

  // A failed card mutation leaves the optimistic state wrong — re-fetch the truth.
  resyncAfterCardFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        CollectionActions.addCardFailure,
        CollectionActions.updateCardFailure,
        CollectionActions.removeCardFailure,
      ),
      map(({ collectionId }) => CollectionActions.refreshCollection({ id: collectionId })),
    ),
  );

  notifyFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          CollectionActions.createCollectionFailure,
          CollectionActions.updateCollectionMetaFailure,
          CollectionActions.deleteCollectionFailure,
          CollectionActions.addCardFailure,
          CollectionActions.updateCardFailure,
          CollectionActions.removeCardFailure,
        ),
        tap(({ error }) => this.toast.error(error)),
      ),
    { dispatch: false },
  );

  constructor(
    private actions$: Actions,
    private api: CollectionApiService,
    private toast: ToastService,
    private store: Store<AppState>,
  ) {}
}
