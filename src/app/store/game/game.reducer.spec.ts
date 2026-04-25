import { gameReducer, GameState } from './game.reducer';
import { GameActions } from './game.actions';
import {
  GameResult, Phase, Step,
  GameStateDiffDto, PermanentDto,
} from '../../models/game.models';
import { makeCard, makePermanent, makeGameState, makePlayer } from '../../testing/test-factories';

function initialState(): GameState {
  return {
    gameId: null,
    localPlayerId: null,
    playerToken: null,
    connected: false,
    connectionError: null,
    gameState: null,
    cardCache: {},
    loading: false,
  };
}

function stateWithGame(overrides: Partial<GameState> = {}): GameState {
  return {
    ...initialState(),
    gameState: makeGameState(),
    connected: true,
    gameId: 'game-1',
    localPlayerId: 'p1',
    ...overrides,
  };
}

describe('gameReducer', () => {

  // ---- joinGame ----------------------------------------

  it('sets loading and clears error on joinGame', () => {
    const state = gameReducer(initialState(), GameActions.joinGame({ gameId: 'g1', playerToken: 'tok' }));
    expect(state.loading).toBeTrue();
    expect(state.connectionError).toBeNull();
    expect(state.gameId).toBe('g1');
  });

  // ---- gameJoined ----------------------------------------

  it('sets connected and stores gameState on gameJoined', () => {
    const gs = makeGameState();
    const state = gameReducer(
      initialState(),
      GameActions.gameJoined({ gameState: gs, localPlayerId: 'p1' }),
    );
    expect(state.connected).toBeTrue();
    expect(state.loading).toBeFalse();
    expect(state.gameState).toBe(gs);
    expect(state.localPlayerId).toBe('p1');
  });

  // ---- connectionLost ----------------------------------------

  it('clears connected flag on connectionLost', () => {
    const state = gameReducer(
      stateWithGame({ connected: true }),
      GameActions.connectionLost(),
    );
    expect(state.connected).toBeFalse();
  });

  // ---- connectionError ----------------------------------------

  it('stores error and clears loading on connectionError', () => {
    const state = gameReducer(
      stateWithGame({ loading: true }),
      GameActions.connectionError({ error: 'timeout' }),
    );
    expect(state.connected).toBeFalse();
    expect(state.loading).toBeFalse();
    expect(state.connectionError).toBe('timeout');
  });

  // ---- stateSynced ----------------------------------------

  it('replaces gameState on stateSynced', () => {
    const newGs = { ...makeGameState(), turn: 5 };
    const state = gameReducer(
      stateWithGame(),
      GameActions.stateSynced({ gameState: newGs }),
    );
    expect(state.gameState!.turn).toBe(5);
    expect(state.loading).toBeFalse();
  });

  // ---- cardLoaded ----------------------------------------

  it('adds card to cache on cardLoaded', () => {
    const card = makeCard({ oracleId: 'oracle-abc' });
    const state = gameReducer(initialState(), GameActions.cardLoaded({ card }));
    expect(state.cardCache['oracle-abc']).toBe(card);
  });

  it('does not overwrite other cache entries on cardLoaded', () => {
    const existing = makeCard({ oracleId: 'oracle-old' });
    const base = { ...initialState(), cardCache: { 'oracle-old': existing } };
    const newCard = makeCard({ oracleId: 'oracle-new' });
    const state = gameReducer(base, GameActions.cardLoaded({ card: newCard }));
    expect(state.cardCache['oracle-old']).toBe(existing);
    expect(state.cardCache['oracle-new']).toBe(newCard);
  });

  // ---- stateDiff: no-op when no gameState ----------------------------------------

  it('returns same state on stateDiff when gameState is null', () => {
    const base = initialState();
    const diff: GameStateDiffDto = {
      changedPermanents: [],
      removedPermanentIds: [],
      stack: [],
      priorityPlayerId: 'p1',
      currentPhase: Phase.PreCombatMain,
      currentStep: Step.Main,
      playerUpdates: [],
      result: GameResult.InProgress,
      combat: null,
    };
    const state = gameReducer(base, GameActions.stateDiff({ diff }));
    expect(state).toBe(base);
  });

  // ---- stateDiff: removes permanents ----------------------------------------

  it('removes permanents listed in removedPermanentIds', () => {
    const perm1 = makePermanent({ permanentId: 'perm-1' });
    const perm2 = makePermanent({ permanentId: 'perm-2' });
    const base = stateWithGame({
      gameState: { ...makeGameState(), battlefield: [perm1, perm2] },
    });
    const diff: GameStateDiffDto = {
      changedPermanents: [],
      removedPermanentIds: ['perm-1'],
      stack: [],
      priorityPlayerId: 'p1',
      currentPhase: Phase.PreCombatMain,
      currentStep: Step.Main,
      playerUpdates: [],
      result: GameResult.InProgress,
      combat: null,
    };
    const state = gameReducer(base, GameActions.stateDiff({ diff }));
    expect(state.gameState!.battlefield.map(p => p.permanentId)).toEqual(['perm-2']);
  });

  // ---- stateDiff: updates existing permanent ----------------------------------------

  it('updates an existing permanent on stateDiff', () => {
    const perm = makePermanent({ permanentId: 'perm-1', isTapped: false });
    const base = stateWithGame({
      gameState: { ...makeGameState(), battlefield: [perm] },
    });
    const updated: PermanentDto = { ...perm, isTapped: true };
    const diff: GameStateDiffDto = {
      changedPermanents: [updated],
      removedPermanentIds: [],
      stack: [],
      priorityPlayerId: 'p1',
      currentPhase: Phase.PreCombatMain,
      currentStep: Step.Main,
      playerUpdates: [],
      result: GameResult.InProgress,
      combat: null,
    };
    const state = gameReducer(base, GameActions.stateDiff({ diff }));
    expect(state.gameState!.battlefield[0].isTapped).toBeTrue();
  });

  // ---- stateDiff: adds new permanent ----------------------------------------

  it('adds a new permanent when it does not exist on the battlefield', () => {
    const base = stateWithGame({
      gameState: { ...makeGameState(), battlefield: [] },
    });
    const newPerm = makePermanent({ permanentId: 'perm-new' });
    const diff: GameStateDiffDto = {
      changedPermanents: [newPerm],
      removedPermanentIds: [],
      stack: [],
      priorityPlayerId: 'p1',
      currentPhase: Phase.PreCombatMain,
      currentStep: Step.Main,
      playerUpdates: [],
      result: GameResult.InProgress,
      combat: null,
    };
    const state = gameReducer(base, GameActions.stateDiff({ diff }));
    expect(state.gameState!.battlefield).toHaveSize(1);
    expect(state.gameState!.battlefield[0].permanentId).toBe('perm-new');
  });

  // ---- stateDiff: applies player updates ----------------------------------------

  it('merges player updates into the matching player on stateDiff', () => {
    const player = makePlayer();
    const base = stateWithGame({
      gameState: { ...makeGameState(), players: [player] },
    });
    const diff: GameStateDiffDto = {
      changedPermanents: [],
      removedPermanentIds: [],
      stack: [],
      priorityPlayerId: 'p1',
      currentPhase: Phase.PreCombatMain,
      currentStep: Step.Main,
      playerUpdates: [{ playerId: 'p1', life: 15 }],
      result: GameResult.InProgress,
      combat: null,
    };
    const state = gameReducer(base, GameActions.stateDiff({ diff }));
    expect(state.gameState!.players[0].life).toBe(15);
  });

  it('ignores player update entries with no playerId', () => {
    const player = makePlayer();
    const base = stateWithGame({
      gameState: { ...makeGameState(), players: [player] },
    });
    const diff: GameStateDiffDto = {
      changedPermanents: [],
      removedPermanentIds: [],
      stack: [],
      priorityPlayerId: 'p1',
      currentPhase: Phase.PreCombatMain,
      currentStep: Step.Main,
      playerUpdates: [{ life: 10 }],  // no playerId
      result: GameResult.InProgress,
      combat: null,
    };
    const state = gameReducer(base, GameActions.stateDiff({ diff }));
    expect(state.gameState!.players[0].life).toBe(20);  // unchanged
  });

  // ---- stateDiff: phase/step/result forwarded ----------------------------------------

  it('updates phase, step, and result from diff', () => {
    const base = stateWithGame();
    const diff: GameStateDiffDto = {
      changedPermanents: [],
      removedPermanentIds: [],
      stack: [],
      priorityPlayerId: 'p2',
      currentPhase: Phase.Combat,
      currentStep: Step.DeclareAttackers,
      playerUpdates: [],
      result: GameResult.Player1Wins,
      combat: null,
    };
    const state = gameReducer(base, GameActions.stateDiff({ diff }));
    expect(state.gameState!.currentPhase).toBe(Phase.Combat);
    expect(state.gameState!.currentStep).toBe(Step.DeclareAttackers);
    expect(state.gameState!.result).toBe(GameResult.Player1Wins);
    expect(state.gameState!.priorityPlayerId).toBe('p2');
  });
});
