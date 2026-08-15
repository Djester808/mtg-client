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

  // concatMap for the same reason as updateCard: a move is relative arithmetic on both
  // collections, so two in flight at once could interleave and double-count.
  moveCard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.moveCard),
      concatMap(({ collectionId, cardId, request, targetName }) =>
        this.api.moveCard(collectionId, cardId, request).pipe(
          map((result) =>
            CollectionActions.moveCardSuccess({ collectionId, cardId, result, targetName }),
          ),
          catchError((err) =>
            of(CollectionActions.moveCardFailure({ collectionId, error: describeHttpError(err) })),
          ),
        ),
      ),
    ),
  );

  moveCards$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.moveCards),
      concatMap(({ collectionId, cardIds, targetCollectionId, targetName }) =>
        this.api.moveCards(collectionId, { targetCollectionId, cardIds }).pipe(
          map((result) => CollectionActions.moveCardsSuccess({ collectionId, result, targetName })),
          catchError((err) =>
            of(CollectionActions.moveCardsFailure({ collectionId, error: describeHttpError(err) })),
          ),
        ),
      ),
    ),
  );

  mergeCollections$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CollectionActions.mergeCollections),
      concatMap(({ targetCollectionId, sourceCollectionId, deleteSource, targetName }) =>
        this.api.mergeCollections(targetCollectionId, { sourceCollectionId, deleteSource }).pipe(
          map((result) =>
            CollectionActions.mergeCollectionsSuccess({
              sourceCollectionId,
              result,
              targetName,
            }),
          ),
          catchError((err) =>
            of(
              CollectionActions.mergeCollectionsFailure({
                collectionId: targetCollectionId,
                error: describeHttpError(err),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  // Both operations change card counts on two collections at once, and the list only
  // carries a rolled-up cardCount — cheaper and less error-prone to re-read it than to
  // reproduce the server's folding arithmetic in the reducer.
  refreshListAfterTransfer$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        CollectionActions.moveCardSuccess,
        CollectionActions.moveCardsSuccess,
        CollectionActions.mergeCollectionsSuccess,
      ),
      map(() => CollectionActions.loadCollections()),
    ),
  );

  // A failed card mutation leaves the optimistic state wrong — re-fetch the truth.
  resyncAfterCardFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        CollectionActions.addCardFailure,
        CollectionActions.updateCardFailure,
        CollectionActions.removeCardFailure,
        CollectionActions.moveCardFailure,
        CollectionActions.moveCardsFailure,
        CollectionActions.mergeCollectionsFailure,
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
          CollectionActions.moveCardFailure,
          CollectionActions.moveCardsFailure,
          CollectionActions.mergeCollectionsFailure,
        ),
        tap(({ error }) => this.toast.error(error)),
      ),
    { dispatch: false },
  );

  // Moves and merges are the two actions whose result isn't visible on the page you are
  // on (the copies land somewhere else), so they confirm in words as well as motion.
  notifyTransferSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          CollectionActions.moveCardSuccess,
          CollectionActions.moveCardsSuccess,
          CollectionActions.mergeCollectionsSuccess,
        ),
        tap((action) => {
          if (action.type === CollectionActions.moveCardSuccess.type) {
            const moved = action.result.target;
            const name = moved.cardDetails?.name ?? 'Card';
            this.toast.show(`Moved ${name} to ${action.targetName}`, 'success');
          } else if (action.type === CollectionActions.moveCardsSuccess.type) {
            const n = action.result.removedCardIds.length;
            this.toast.show(
              `Moved ${n} ${n === 1 ? 'card' : 'cards'} to ${action.targetName}`,
              'success',
            );
          } else {
            const { cardsMoved, cardsFolded, copiesTransferred } = action.result;
            const rows = cardsMoved + cardsFolded;
            this.toast.show(
              `Merged ${copiesTransferred} ${copiesTransferred === 1 ? 'copy' : 'copies'} ` +
                `(${rows} ${rows === 1 ? 'card' : 'cards'}) into ${action.targetName}`,
              'success',
            );
          }
        }),
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
