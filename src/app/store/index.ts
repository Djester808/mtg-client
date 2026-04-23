import { GameState, gameReducer } from './game/game.reducer';
import { UIState, uiReducer } from './ui/ui.reducer';

export interface AppState {
  game: GameState;
  ui: UIState;
}

export const appReducers = {
  game: gameReducer,
  ui: uiReducer,
};

export * from './game/game.actions';
export * from './ui/ui.actions';
export * from './selectors';
