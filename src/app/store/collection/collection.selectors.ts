import { createSelector } from '@ngrx/store';
import { AppState } from '..';
import { CollectionState } from './collection.reducer';

const selectCollectionState = (state: AppState) => state.collection as CollectionState;

export const selectCollections = createSelector(
  selectCollectionState,
  s => s.collections,
);

export const selectActiveCollection = createSelector(
  selectCollectionState,
  s => s.activeCollection,
);

export const selectCollectionLoading = createSelector(
  selectCollectionState,
  s => s.loading,
);

export const selectCollectionError = createSelector(
  selectCollectionState,
  s => s.error,
);
