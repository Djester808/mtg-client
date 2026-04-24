import { GameState, gameReducer } from './game/game.reducer';
import { UIState, uiReducer } from './ui/ui.reducer';
import { CollectionState, collectionReducer } from './collection/collection.reducer';
import { AuthState, authReducer } from './auth/auth.reducer';

export interface AppState {
  game: GameState;
  ui: UIState;
  collection: CollectionState;
  auth: AuthState;
}

export const appReducers = {
  game: gameReducer,
  ui: uiReducer,
  collection: collectionReducer,
  auth: authReducer,
};

export * from './game/game.actions';
export * from './ui/ui.actions';
export * from './selectors';
