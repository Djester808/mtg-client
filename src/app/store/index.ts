import { GameState, gameReducer } from './game/game.reducer';
import { UIState, uiReducer } from './ui/ui.reducer';
import { CollectionState, collectionReducer } from './collection/collection.reducer';
import { AuthState, authReducer } from './auth/auth.reducer';
import { DeckState, deckReducer } from './deck/deck.reducer';
import { ForumState, forumReducer } from './forum/forum.reducer';

export interface AppState {
  game: GameState;
  ui: UIState;
  collection: CollectionState;
  auth: AuthState;
  deck: DeckState;
  forum: ForumState;
}

export const appReducers = {
  game: gameReducer,
  ui: uiReducer,
  collection: collectionReducer,
  auth: authReducer,
  deck: deckReducer,
  forum: forumReducer,
};

export * from './game/game.actions';
export * from './ui/ui.actions';
export * from './selectors';
