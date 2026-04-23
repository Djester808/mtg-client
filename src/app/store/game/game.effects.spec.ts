import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { provideRouter, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { Action } from '@ngrx/store';

import { GameEffects } from './game.effects';
import { GameActions } from './game.actions';
import { SignalRService } from '../../services/signalr.service';
import { GameApiService } from '../../services/game-api.service';
import { GameResult, Phase, Step } from '../../models/game.models';

function makeGameState(result: GameResult) {
  return {
    gameId: 'game-1',
    players: [],
    battlefield: [],
    stack: [],
    turn: 1,
    activePlayerId: 'p1',
    priorityPlayerId: 'p1',
    currentPhase: Phase.PreCombatMain,
    currentStep: Step.Main,
    result,
    combat: null,
  };
}

describe('GameEffects', () => {
  let actions$: Observable<Action>;
  let effects: GameEffects;
  let router: Router;
  let signalr: jasmine.SpyObj<SignalRService>;
  let api: jasmine.SpyObj<GameApiService>;

  beforeEach(() => {
    signalr = jasmine.createSpyObj<SignalRService>('SignalRService', [
      'connect', 'concede', 'passpriority', 'castSpell', 'playLand',
      'activateMana', 'untapLand', 'declareAttackers', 'declareBlockers',
    ]);
    api = jasmine.createSpyObj<GameApiService>('GameApiService', ['joinGame']);

    TestBed.configureTestingModule({
      providers: [
        GameEffects,
        provideMockStore(),
        provideRouter([]),
        provideMockActions(() => actions$),
        { provide: SignalRService, useValue: signalr },
        { provide: GameApiService, useValue: api },
      ],
    });

    effects = TestBed.inject(GameEffects);
    router  = TestBed.inject(Router);
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  // ---- gameOverOnJoin$ ------------------------------------

  describe('gameOverOnJoin$', () => {
    it('clears session and navigates to lobby when game is already over', () => {
      localStorage.setItem('mtg_session', JSON.stringify({ gameId: 'game-1', playerToken: 'tok' }));
      spyOn(router, 'navigate');

      actions$ = of(GameActions.gameJoined({
        gameState: makeGameState(GameResult.Player1Wins),
        localPlayerId: 'p1',
      }));

      effects.gameOverOnJoin$.subscribe();

      expect(localStorage.getItem('mtg_session')).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('does not navigate when game is still in progress', () => {
      spyOn(router, 'navigate');

      actions$ = of(GameActions.gameJoined({
        gameState: makeGameState(GameResult.InProgress),
        localPlayerId: 'p1',
      }));

      effects.gameOverOnJoin$.subscribe();

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('does not navigate for Draw result', () => {
      // Draw is also a finished game — should navigate to lobby
      localStorage.setItem('mtg_session', JSON.stringify({ gameId: 'game-1', playerToken: 'tok' }));
      spyOn(router, 'navigate');

      actions$ = of(GameActions.gameJoined({
        gameState: makeGameState(GameResult.Draw),
        localPlayerId: 'p1',
      }));

      effects.gameOverOnJoin$.subscribe();

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });
  });

  // ---- connectionError$ -----------------------------------

  describe('connectionError$', () => {
    it('clears session and navigates to lobby on connection error', () => {
      localStorage.setItem('mtg_session', JSON.stringify({ gameId: 'game-1', playerToken: 'tok' }));
      spyOn(router, 'navigate');

      actions$ = of(GameActions.connectionError({ error: 'timeout' }));

      effects.connectionError$.subscribe();

      expect(localStorage.getItem('mtg_session')).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('navigates to lobby even when no session is stored', () => {
      spyOn(router, 'navigate');

      actions$ = of(GameActions.connectionError({ error: 'timeout' }));

      effects.connectionError$.subscribe();

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });
  });
});
