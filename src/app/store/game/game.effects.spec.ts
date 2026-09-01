import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { provideRouter, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { Action } from '@ngrx/store';

import { GameEffects } from './game.effects';
import { GameActions } from './game.actions';
import { UIActions } from '../ui/ui.actions';
import {
  selectPendingTargets,
  selectTargetCount,
  selectTargetSourceCardId,
  selectTargetAbilityId,
} from '../selectors';
import { SignalRService } from '../../services/signalr.service';
import { GameApiService } from '../../services/game-api.service';
import { GameResult } from '../../models/game.models';
import { makeGameState } from '../../testing/test-factories';

describe('GameEffects', () => {
  let actions$: Observable<Action>;
  let effects: GameEffects;
  let router: Router;
  let signalr: jasmine.SpyObj<SignalRService>;
  let api: jasmine.SpyObj<GameApiService>;

  beforeEach(() => {
    signalr = jasmine.createSpyObj<SignalRService>('SignalRService', [
      'connect',
      'concede',
      'passpriority',
      'castSpell',
      'playLand',
      'activateMana',
      'untapLand',
      'declareAttackers',
      'declareBlockers',
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
    router = TestBed.inject(Router);
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  // ---- gameOverOnJoin$ ------------------------------------

  describe('gameOverOnJoin$', () => {
    it('clears session and navigates to lobby when game is already over', () => {
      localStorage.setItem('mtg_session', JSON.stringify({ gameId: 'game-1', playerToken: 'tok' }));
      spyOn(router, 'navigate');

      actions$ = of(
        GameActions.gameJoined({
          gameState: makeGameState(GameResult.Player1Wins),
          localPlayerId: 'p1',
        }),
      );

      effects.gameOverOnJoin$.subscribe();

      expect(localStorage.getItem('mtg_session')).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('does not navigate when game is still in progress', () => {
      spyOn(router, 'navigate');

      actions$ = of(
        GameActions.gameJoined({
          gameState: makeGameState(GameResult.InProgress),
          localPlayerId: 'p1',
        }),
      );

      effects.gameOverOnJoin$.subscribe();

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('navigates to lobby for Draw result (Draw is a finished game)', () => {
      localStorage.setItem('mtg_session', JSON.stringify({ gameId: 'game-1', playerToken: 'tok' }));
      spyOn(router, 'navigate');

      actions$ = of(
        GameActions.gameJoined({
          gameState: makeGameState(GameResult.Draw),
          localPlayerId: 'p1',
        }),
      );

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

  describe('casting a spell that targets (CR 601.2c)', () => {
    // The board has had a 'targeting' mode since it was written and nothing ever entered it, so
    // a Lightning Bolt was cast with no target and refused every time. These cover the wiring
    // that closes that: the spell goes once it has what it was waiting for.
    let store: MockStore;

    beforeEach(() => {
      store = TestBed.inject(MockStore);
      store.overrideSelector(selectTargetSourceCardId, 'bolt');
      store.overrideSelector(selectTargetAbilityId, null);
      store.overrideSelector(selectTargetCount, 1);
    });

    it('casts once the target it was waiting for is picked', (done) => {
      store.overrideSelector(selectPendingTargets, ['bear']);
      store.refreshState();
      actions$ = of(UIActions.addTarget({ targetId: 'bear' }));

      const seen: Action[] = [];
      effects.castWhenTargeted$.subscribe((action) => {
        seen.push(action);
        if (seen.length === 2) {
          expect(seen[0]).toEqual(GameActions.castSpell({ cardId: 'bolt', targetIds: ['bear'] }));
          expect(seen[1]).toEqual(UIActions.confirmTargets());
          done();
        }
      });
    });

    it('activates an ability rather than casting, when the source is one (CR 602.2b)', (done) => {
      // Everything used to end in a cast. Pointing an Icy Manipulator would have tried to cast
      // the Icy Manipulator — a permanent already on the battlefield.
      store.overrideSelector(selectTargetSourceCardId, 'icy-1');
      store.overrideSelector(selectTargetAbilityId, 'tap');
      store.overrideSelector(selectPendingTargets, ['bear']);
      store.refreshState();
      actions$ = of(UIActions.addTarget({ targetId: 'bear' }));

      const seen: Action[] = [];
      effects.castWhenTargeted$.subscribe((action) => {
        seen.push(action);
        if (seen.length === 2) {
          expect(seen[0]).toEqual(
            GameActions.activateAbility({
              permanentId: 'icy-1',
              abilityId: 'tap',
              targetIds: ['bear'],
            }),
          );
          expect(seen[1]).toEqual(UIActions.confirmTargets());
          done();
        }
      });
    });

    it('waits when the spell needs more than it has', (done) => {
      store.overrideSelector(selectTargetCount, 2);
      store.overrideSelector(selectPendingTargets, ['bear']);
      store.refreshState();
      actions$ = of(UIActions.addTarget({ targetId: 'bear' }));

      let fired = false;
      effects.castWhenTargeted$.subscribe(() => (fired = true));
      setTimeout(() => {
        expect(fired).toBe(false);
        done();
      }, 20);
    });

    it('does nothing when no spell is waiting', (done) => {
      store.overrideSelector(selectTargetSourceCardId, null);
      store.overrideSelector(selectTargetAbilityId, null);
      store.overrideSelector(selectPendingTargets, ['bear']);
      store.refreshState();
      actions$ = of(UIActions.addTarget({ targetId: 'bear' }));

      let fired = false;
      effects.castWhenTargeted$.subscribe(() => (fired = true));
      setTimeout(() => {
        expect(fired).toBe(false);
        done();
      }, 20);
    });
  });
});
