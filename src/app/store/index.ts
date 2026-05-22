import { CollectionState, collectionReducer } from './collection/collection.reducer';
import { AuthState, authReducer } from './auth/auth.reducer';
import { DeckState, deckReducer } from './deck/deck.reducer';
import { ForumState, forumReducer } from './forum/forum.reducer';

export interface AppState {
  collection: CollectionState;
  auth: AuthState;
  deck: DeckState;
  forum: ForumState;
}

export const appReducers = {
  collection: collectionReducer,
  auth: authReducer,
  deck: deckReducer,
  forum: forumReducer,
};

export * from './auth/auth.actions';
export * from './collection/collection.actions';
export * from './deck/deck.actions';
export * from './forum/forum.actions';
