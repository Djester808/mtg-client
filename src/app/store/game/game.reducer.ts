import { createReducer, on } from '@ngrx/store';
import {
  GameStateDto,
  CardDto,
  PermanentDto,
  GameResult,
  Phase,
  Step,
} from '../../models/game.models';
import { GameActions } from './game.actions';

export interface GameState {
  gameId: string | null;
  localPlayerId: string | null;
  playerToken: string | null;
  connected: boolean;
  connectionError: string | null;
  gameState: GameStateDto | null;
  cardCache: Record<string, CardDto>; // oracleId -> CardDto
  loading: boolean;
}

const initialState: GameState = {
  gameId: null,
  localPlayerId: null,
  playerToken: null,
  connected: false,
  connectionError: null,
  gameState: null,
  cardCache: {},
  loading: false,
};

export const gameReducer = createReducer(
  initialState,

  on(GameActions.joinGame, (state, { gameId, playerToken }) => ({
    ...state,
    gameId,
    playerToken,
    loading: true,
    connectionError: null,
  })),

  on(GameActions.gameJoined, (state, { gameState, localPlayerId }) => ({
    ...state,
    connected: true,
    loading: false,
    gameState,
    localPlayerId,
  })),

  on(GameActions.connectionLost, state => ({
    ...state,
    connected: false,
  })),

  on(GameActions.connectionError, (state, { error }) => ({
    ...state,
    connected: false,
    loading: false,
    connectionError: error,
  })),

  on(GameActions.stateSynced, (state, { gameState }) => ({
    ...state,
    gameState,
    loading: false,
  })),

  // Apply incremental diff from SignalR
  on(GameActions.stateDiff, (state, { diff }) => {
    if (!state.gameState) return state;

    let battlefield = [...state.gameState.battlefield];

    // Remove permanents that left
    if (diff.removedPermanentIds.length) {
      const removed = new Set(diff.removedPermanentIds);
      battlefield = battlefield.filter(p => !removed.has(p.permanentId));
    }

    // Update / add changed permanents
    for (const updated of diff.changedPermanents) {
      const idx = battlefield.findIndex(p => p.permanentId === updated.permanentId);
      if (idx >= 0) {
        battlefield = [...battlefield.slice(0, idx), updated, ...battlefield.slice(idx + 1)];
      } else {
        battlefield = [...battlefield, updated];
      }
    }

    // Apply player updates
    let players = state.gameState.players;
    for (const pu of diff.playerUpdates) {
      if (!pu.playerId) continue;
      const idx = players.findIndex(p => p.playerId === pu.playerId);
      if (idx >= 0) {
        players = [
          ...players.slice(0, idx),
          { ...players[idx], ...pu },
          ...players.slice(idx + 1),
        ];
      }
    }

    return {
      ...state,
      gameState: {
        ...state.gameState,
        battlefield,
        players,
        stack: diff.stack,
        priorityPlayerId: diff.priorityPlayerId,
        currentPhase: diff.currentPhase,
        currentStep: diff.currentStep,
        result: diff.result,
        combat: diff.combat,
      },
    };
  }),

  on(GameActions.cardLoaded, (state, { card }) => ({
    ...state,
    cardCache: { ...state.cardCache, [card.oracleId]: card },
  })),
);
