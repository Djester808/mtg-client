import { CollectionState, collectionReducer } from './collection/collection.reducer';
import { AuthState, authReducer } from './auth/auth.reducer';
import { DeckState, deckReducer } from './deck/deck.reducer';
import { ForumState, forumReducer } from './forum/forum.reducer';
import { GameState, gameReducer } from './game/game.reducer';
import { UIState, uiReducer } from './ui/ui.reducer';

export interface AppState {
  collection: CollectionState;
  auth: AuthState;
  deck: DeckState;
  forum: ForumState;
  game: GameState;
  ui: UIState;
}

export const appReducers = {
  collection: collectionReducer,
  auth: authReducer,
  deck: deckReducer,
  forum: forumReducer,
  game: gameReducer,
  ui: uiReducer,
};

export * from './auth/auth.actions';
export * from './collection/collection.actions';
export * from './deck/deck.actions';
export * from './forum/forum.actions';
export * from './game/game.actions';
export * from './ui/ui.actions';
export * from './selectors';
