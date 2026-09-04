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
  selectVariableValue,
  selectAnnouncement,
  selectBattlefield,
} from '../selectors';
import { SignalRService } from '../../services/signalr.service';
import { GameApiService } from '../../services/game-api.service';
import { GameResult } from '../../models/game.models';
import { makeGameState, makePermanent } from '../../testing/test-factories';

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

  describe('choosing an ability (CR 602.2)', () => {
    // What an ability needs before it can be sent, in the rules' order: the number for a cost
    // written with {X} first (CR 601.2b), then targets (CR 601.2c), then the activation. One
    // place, because a tap on a permanent with one ability and a press on the menu when it has
    // several both arrive here.
    let store: MockStore;

    const ability = (over = {}) => ({
      id: 'mana',
      text: '{T}: Add {C}.',
      requiresTap: true,
      targetCount: 0,
      isManaAbility: true,
      announcesVariable: false,
      ...over,
    });

    const withAbilities = (...abilities: ReturnType<typeof ability>[]) => {
      store.overrideSelector(selectBattlefield, [
        makePermanent({ permanentId: 'perm-1', abilities }),
      ]);
      store.refreshState();
    };

    beforeEach(() => {
      store = TestBed.inject(MockStore);
    });

    it('activates an ability that asks for nothing', (done) => {
      withAbilities(ability());
      actions$ = of(UIActions.chooseAbility({ permanentId: 'perm-1', abilityId: 'mana' }));

      effects.abilityChosen$.subscribe((action) => {
        expect(action).toEqual(
          GameActions.activateAbility({ permanentId: 'perm-1', abilityId: 'mana', targetIds: [] }),
        );
        done();
      });
    });

    it('asks for a target first when the ability needs one (CR 602.2b)', (done) => {
      withAbilities(ability({ id: 'ping', targetCount: 1, isManaAbility: false }));
      actions$ = of(UIActions.chooseAbility({ permanentId: 'perm-1', abilityId: 'ping' }));

      effects.abilityChosen$.subscribe((action) => {
        expect(action).toEqual(
          UIActions.enterTargetMode({
            sourceCardId: 'perm-1',
            targetCount: 1,
            abilityId: 'ping',
          }),
        );
        done();
      });
    });

    it('asks for the number before anything else when the cost is counted with X', (done) => {
      // Sent as a plain activation this is an X of zero, which the engine charges correctly and
      // which is nothing at all: a storage land that taps for no mana, "remove X counters" that
      // removes none.
      withAbilities(
        ability({
          id: 'release',
          text: '{X}, {T}, Remove X storage counters: Add X mana.',
          announcesVariable: true,
        }),
      );
      actions$ = of(UIActions.chooseAbility({ permanentId: 'perm-1', abilityId: 'release' }));

      effects.abilityChosen$.subscribe((action) => {
        expect(action).toEqual(
          UIActions.enterAnnounceMode({
            sourceId: 'perm-1',
            abilityId: 'release',
            targetCount: 0,
          }),
        );
        done();
      });
    });
  });

  describe('naming the number a cost is counted with (CR 601.2b)', () => {
    let store: MockStore;

    beforeEach(() => {
      store = TestBed.inject(MockStore);
    });

    const announcing = (over = {}) => {
      store.overrideSelector(selectAnnouncement, {
        sourceId: 'pyre',
        abilityId: null,
        targetCount: 0,
        sourceName: 'Harvest Pyre',
        abilityText: '',
        ...over,
      });
      store.refreshState();
    };

    it('casts the spell for the number that was named', (done) => {
      announcing();
      actions$ = of(UIActions.confirmAnnounce({ value: 3 }));

      effects.announced$.subscribe((action) => {
        expect(action).toEqual(
          GameActions.castSpell({ cardId: 'pyre', targetIds: [], variableValue: 3 }),
        );
        done();
      });
    });

    it('activates the ability for it, when the announcement belonged to one', (done) => {
      announcing({ sourceId: 'perm-1', abilityId: 'release', sourceName: 'Calciform Pools' });
      actions$ = of(UIActions.confirmAnnounce({ value: 2 }));

      effects.announced$.subscribe((action) => {
        expect(action).toEqual(
          GameActions.activateAbility({
            permanentId: 'perm-1',
            abilityId: 'release',
            targetIds: [],
            variableValue: 2,
          }),
        );
        done();
      });
    });

    it('goes on to ask for targets when the source has them (CR 601.2c after 601.2b)', (done) => {
      announcing({ targetCount: 1 });
      actions$ = of(UIActions.confirmAnnounce({ value: 5 }));

      effects.announced$.subscribe((action) => {
        expect(action).toEqual(
          UIActions.enterTargetMode({
            sourceCardId: 'pyre',
            targetCount: 1,
            abilityId: undefined,
            variableValue: 5,
          }),
        );
        done();
      });
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
      store.overrideSelector(selectVariableValue, 0);
    });

    it('casts once the target it was waiting for is picked', (done) => {
      store.overrideSelector(selectPendingTargets, ['bear']);
      store.refreshState();
      actions$ = of(UIActions.addTarget({ targetId: 'bear' }));

      const seen: Action[] = [];
      effects.castWhenTargeted$.subscribe((action) => {
        seen.push(action);
        if (seen.length === 2) {
          expect(seen[0]).toEqual(
            GameActions.castSpell({ cardId: 'bolt', targetIds: ['bear'], variableValue: 0 }),
          );
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
              variableValue: 0,
            }),
          );
          expect(seen[1]).toEqual(UIActions.confirmTargets());
          done();
        }
      });
    });

    it('carries the announced X through the targeting step (CR 601.2b then 601.2c)', (done) => {
      // X is named before targets are chosen, so it has to survive the step between them. Lost
      // here, a spell announced for four would be cast for zero at the end of it.
      store.overrideSelector(selectVariableValue, 4);
      store.overrideSelector(selectPendingTargets, ['bear']);
      store.refreshState();
      actions$ = of(UIActions.addTarget({ targetId: 'bear' }));

      effects.castWhenTargeted$.subscribe((action) => {
        if (action.type === GameActions.castSpell.type) {
          expect(action).toEqual(
            GameActions.castSpell({ cardId: 'bolt', targetIds: ['bear'], variableValue: 4 }),
          );
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
