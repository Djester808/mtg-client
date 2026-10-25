import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { GameBoardComponent } from './game-board.component';
import { GameActions, UIActions } from '../store';
import { ChoiceDto } from '../models/game.models';
import { SignalRService } from '../services/signalr.service';
import { Phase, Step } from '../models/game.models';
import {
  selectUIMode,
  selectIsActivePlayer,
  selectCurrentPhase,
  selectCurrentStep,
  selectCombatState,
} from '../store/selectors';
import { firstValueFrom } from 'rxjs';

describe('GameBoardComponent', () => {
  let component: GameBoardComponent;
  let fixture: ComponentFixture<GameBoardComponent>;
  let store: MockStore;
  let router: Router;
  let signalr: jasmine.SpyObj<SignalRService>;

  let routeParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  function setup(gameIdParam: string | null = 'game-abc'): Promise<void> {
    routeParams = new BehaviorSubject(
      convertToParamMap(gameIdParam ? { gameId: gameIdParam } : {}),
    );
    return TestBed.configureTestingModule({
      imports: [GameBoardComponent],
      providers: [
        provideMockStore(),
        provideRouter([]),
        { provide: SignalRService, useValue: signalr },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: routeParams,
          },
        },
      ],
    })
      .overrideComponent(GameBoardComponent, { set: { imports: [], template: '<div></div>' } })
      .compileComponents()
      .then(() => {
        store = TestBed.inject(MockStore);
        router = TestBed.inject(Router);
        fixture = TestBed.createComponent(GameBoardComponent);
        component = fixture.componentInstance;
      });
  }

  beforeEach(() => {
    signalr = jasmine.createSpyObj<SignalRService>('SignalRService', [
      'disconnect',
      'isChoicePending',
      'choiceSubmission',
    ]);
    signalr.disconnect.and.returnValue(Promise.resolve());
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  // ---- Creation -------------------------------------------

  it('creates the component', async () => {
    await setup();
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  // ---- ngOnInit reconnect ---------------------------------

  describe('ngOnInit()', () => {
    it('dispatches joinGame when session matches route gameId', async () => {
      localStorage.setItem(
        'mtg_session',
        JSON.stringify({ gameId: 'game-abc', playerToken: 'tok-1' }),
      );
      await setup('game-abc');
      spyOn(store, 'dispatch');

      fixture.detectChanges();

      expect(store.dispatch).toHaveBeenCalledWith(
        GameActions.joinGame({ gameId: 'game-abc', playerToken: 'tok-1' }),
      );
    });

    // The four specs that used to be here asserted the opposite of these: no session, a
    // session for another game, or malformed JSON each bounced the player back to the home
    // page. That gate is why a game started by accepting an invitation could not be opened -
    // only /lobby writes mtg_session, and nothing downstream reads the token it stores.
    it('joins with the route gameId when no session is stored', async () => {
      await setup('game-abc');
      spyOn(store, 'dispatch');
      spyOn(router, 'navigate');

      fixture.detectChanges();

      expect(store.dispatch).toHaveBeenCalledWith(
        GameActions.joinGame({ gameId: 'game-abc', playerToken: '' }),
      );
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('joins when the stored session is for a different game', async () => {
      localStorage.setItem(
        'mtg_session',
        JSON.stringify({ gameId: 'OTHER', playerToken: 'tok-1' }),
      );
      await setup('game-abc');
      spyOn(store, 'dispatch');
      spyOn(router, 'navigate');

      fixture.detectChanges();

      expect(store.dispatch).toHaveBeenCalledWith(
        GameActions.joinGame({ gameId: 'game-abc', playerToken: '' }),
      );
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('joins when the stored session is malformed', async () => {
      localStorage.setItem('mtg_session', 'not-json');
      await setup('game-abc');
      spyOn(store, 'dispatch');
      spyOn(router, 'navigate');

      fixture.detectChanges();

      expect(store.dispatch).toHaveBeenCalledWith(
        GameActions.joinGame({ gameId: 'game-abc', playerToken: '' }),
      );
      expect(router.navigate).not.toHaveBeenCalled();
    });

    // The one redirect that survives: without a game id there is no game to show.
    it('navigates home when route has no gameId', async () => {
      localStorage.setItem(
        'mtg_session',
        JSON.stringify({ gameId: 'game-abc', playerToken: 'tok-1' }),
      );
      await setup(null);
      spyOn(router, 'navigate');

      fixture.detectChanges();

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });
  });

  // ---- concede modal flow ---------------------------------

  describe('concede modal', () => {
    beforeEach(async () => {
      localStorage.setItem(
        'mtg_session',
        JSON.stringify({ gameId: 'game-abc', playerToken: 'tok-1' }),
      );
      await setup('game-abc');
      fixture.detectChanges();
    });

    it('concede() opens the modal without dispatching', () => {
      spyOn(store, 'dispatch');

      component.concede();

      expect(component.showConcedeModal).toBeTrue();
      expect(store.dispatch).not.toHaveBeenCalled();
    });

    it('cancelConcede() closes the modal without dispatching', () => {
      component.showConcedeModal = true;
      spyOn(store, 'dispatch');

      component.cancelConcede();

      expect(component.showConcedeModal).toBeFalse();
      expect(store.dispatch).not.toHaveBeenCalled();
    });

    it('confirmConcede() dispatches concede action', () => {
      spyOn(store, 'dispatch');

      component.confirmConcede();

      expect(store.dispatch).toHaveBeenCalledWith(GameActions.concede());
    });

    it('confirmConcede() keeps the connection and session until the command finishes', () => {
      localStorage.setItem('mtg_session', 'game-session');
      spyOn(router, 'navigate');
      component.confirmConcede();
      expect(signalr.disconnect).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
      expect(localStorage.getItem('mtg_session')).toBe('game-session');
    });

    it('onEscapeKey() closes the modal when it is open', () => {
      component.showConcedeModal = true;

      component.onEscapeKey();

      expect(component.showConcedeModal).toBeFalse();
    });

    it('onEscapeKey() closes the card inspector when the concede modal is closed', () => {
      component.showConcedeModal = false;
      spyOn(store, 'dispatch');

      component.onEscapeKey();

      expect(store.dispatch).toHaveBeenCalledOnceWith(UIActions.deselectCard());
    });
  });

  // ---- closePreview / passPriority / combat ---------------

  it('allows declining an optional choice and refuses skipping a required one', async () => {
    await setup();
    const dispatch = spyOn(store, 'dispatch');
    component.skipChoice({ minPicks: 1 } as ChoiceDto);
    expect(dispatch).not.toHaveBeenCalled();
    component.skipChoice({ minPicks: 0 } as ChoiceDto);
    expect(dispatch).toHaveBeenCalledOnceWith(GameActions.choose({ picks: [], control: 'skip' }));
  });
  describe('answering the game (CR 103.4, 510.1c, 603.3b)', () => {
    // The engine this board now talks to stops and asks things the old one never did. A board
    // that cannot answer sits on "Waiting for the other player" forever — which is exactly what
    // it did before this existed.
    const choice = (over: Partial<ChoiceDto> = {}): ChoiceDto => ({
      id: 'c1',
      playerId: 'me',
      kind: 'Mulligan',
      prompt: 'Keep this hand, or take a mulligan?',
      minPicks: 1,
      maxPicks: 1,
      isOrdering: false,
      isDivision: false,
      totalToDivide: 0,
      options: [
        { id: 'keep', label: 'Keep' },
        { id: 'mulligan', label: 'Mulligan' },
      ],
      ...over,
    });

    beforeEach(async () => {
      await setup();
      spyOn(store, 'dispatch');
    });

    it('answers a single-pick decision on the tap, with nothing to confirm', () => {
      component.pick(choice(), 'keep');

      expect(store.dispatch).toHaveBeenCalledWith(
        GameActions.choose({ picks: ['keep'], control: 'option' }),
      );
      expect(component.picks).toEqual([]);
    });

    it('submits a full unordered search through the option owner and retains picks for recovery', () => {
      const search = choice({ kind: 'search', maxPicks: 2 });
      component.pick(search, 'keep');
      expect(store.dispatch).not.toHaveBeenCalled();
      component.pick(search, 'mulligan');
      expect(store.dispatch).toHaveBeenCalledOnceWith(
        GameActions.choose({ picks: ['keep', 'mulligan'], control: 'option' }),
      );
      expect(component.picks).toEqual(['keep', 'mulligan']);
      component.pick(search, 'hidden');
      expect(store.dispatch).toHaveBeenCalledTimes(1);
    });
    it('keeps search picks until the server replaces the choice, allowing retry', () => {
      const search = choice({ kind: 'search', maxPicks: 2 });
      component.pick(search, 'keep');
      component.submitChoice(search);
      expect(component.picks).toEqual(['keep']);
      component.submitChoice(search);
      expect(store.dispatch).toHaveBeenCalledWith(
        GameActions.choose({ picks: ['keep'], control: 'confirm' }),
      );
      component.pick({ ...search, id: 'c2' }, 'mulligan');
      expect(component.picks).toEqual(['mulligan']);
    });

    it('collects picks for a decision that takes several, and sends them in order', () => {
      // CR 603.3b: the order triggers go on the stack is the answer, so the order of the picks
      // is what is being asked for.
      const ordering = choice({
        kind: 'OrderTriggers',
        minPicks: 2,
        maxPicks: 2,
        isOrdering: true,
        options: [
          { id: 't1', label: 'First trigger' },
          { id: 't2', label: 'Second trigger' },
        ],
      });

      component.pick(ordering, 't2');
      component.pick(ordering, 't1');
      expect(store.dispatch).not.toHaveBeenCalled();
      expect(component.pickOrder('t2')).toBe(1);
      expect(component.pickOrder('t1')).toBe(2);

      component.submitChoice(ordering);
      expect(store.dispatch).toHaveBeenCalledWith(
        GameActions.choose({ picks: ['t2', 't1'], control: 'confirm' }),
      );
    });

    it('lets a division pick the same option more than once, up to the amount', () => {
      // CR 510.1c: damage is divided by assigning it a point at a time, so repeating a pick is
      // the mechanism rather than a mistake.
      const division = choice({
        kind: 'DivideDamage',
        minPicks: 3,
        maxPicks: 3,
        isDivision: true,
        totalToDivide: 3,
        options: [
          { id: 'b1', label: 'Grizzly Bears' },
          { id: 'b2', label: 'Wall' },
        ],
      });

      component.pick(division, 'b1');
      component.pick(division, 'b1');
      expect(component.assigned('b1')).toBe(2);
      expect(component.leftToDivide(division)).toBe(1);
      expect(component.canSubmit(division)).toBe(false);

      component.pick(division, 'b2');
      expect(component.canSubmit(division)).toBe(true);

      // And no more than the amount there is to divide.
      component.pick(division, 'b2');
      expect(component.picks.length).toBe(3);
    });

    it('un-picks an option that is tapped again, when the answer is a selection', () => {
      const selection = choice({ minPicks: 1, maxPicks: 2, options: [{ id: 'a', label: 'A' }] });

      component.pick(selection, 'a');
      expect(component.picks).toEqual(['a']);
      component.pick(selection, 'a');
      expect(component.picks).toEqual([]);
    });

    it('starts over without answering', () => {
      const selection = choice({ minPicks: 1, maxPicks: 2 });
      component.pick(selection, 'keep');
      component.clearPicks();

      expect(component.picks).toEqual([]);
      expect(store.dispatch).not.toHaveBeenCalled();
    });

    it('will not confirm before the minimum has been picked', () => {
      const selection = choice({ minPicks: 2, maxPicks: 2 });
      expect(component.canSubmit(selection)).toBe(false);

      component.pick(selection, 'keep');
      expect(component.canSubmit(selection)).toBe(false);

      component.pick(selection, 'mulligan');
      expect(component.canSubmit(selection)).toBe(true);
    });
  });

  describe('other dispatches', () => {
    beforeEach(async () => {
      await setup();
      fixture.detectChanges();
    });

    it('dispatches deselectCard on closePreview', () => {
      spyOn(store, 'dispatch');
      component.closePreview();
      expect(store.dispatch).toHaveBeenCalledWith(UIActions.deselectCard());
    });

    it('dispatches passPriority', () => {
      spyOn(store, 'dispatch');
      component.passPriority();
      expect(store.dispatch).toHaveBeenCalledWith(GameActions.passPriority());
    });

    it('dispatches enterAttackMode', () => {
      spyOn(store, 'dispatch');
      component.enterAttackMode();
      expect(store.dispatch).toHaveBeenCalledWith(UIActions.enterAttackMode());
    });

    it('dispatches cancelAttackMode', () => {
      spyOn(store, 'dispatch');
      component.cancelAttackMode();
      expect(store.dispatch).toHaveBeenCalledWith(UIActions.cancelAttackMode());
    });

    it('dispatches enterBlockMode', () => {
      spyOn(store, 'dispatch');
      component.enterBlockMode();
      expect(store.dispatch).toHaveBeenCalledWith(UIActions.enterBlockMode());
    });

    it('dispatches cancelBlockMode', () => {
      spyOn(store, 'dispatch');
      component.cancelBlockMode();
      expect(store.dispatch).toHaveBeenCalledWith(UIActions.cancelBlockMode());
    });
  });

  // ---- The combat buttons only stand where the rules let them (CR 508.1, 509.1) ----
  //
  // The declare buttons were already gated on being (or not being) the active player. The
  // confirm buttons were gated on the UI mode alone, and a mode outlives the step it was
  // entered in: a declaration begun and abandoned left "Confirm" on screen into the opponent's
  // turn, where pressing it sent an attack the engine refused with CR 508.1.

  async function combatVm(over: {
    uiMode?: string;
    isActive?: boolean;
    step?: Step;
    attackersDeclared?: boolean;
    blockersDeclared?: boolean;
  }) {
    // The mock store starts with no feature slices at all, so every selector this view model
    // reads that is not overridden below would throw on `state.game`. Empty slices are enough:
    // the ones that matter here are overridden, and the rest may safely be undefined.
    store.setState({ game: {}, ui: { pendingAttackerIds: [], pendingBlockers: {} } } as never);
    store.overrideSelector(selectUIMode, (over.uiMode ?? 'idle') as never);
    store.overrideSelector(selectIsActivePlayer, over.isActive ?? true);
    store.overrideSelector(selectCurrentPhase, Phase.Combat);
    store.overrideSelector(selectCurrentStep, over.step ?? Step.DeclareAttackers);
    store.overrideSelector(selectCombatState, {
      attackers: [],
      attackersToBlockers: {},
      attackersDeclared: over.attackersDeclared ?? false,
      blockersDeclared: over.blockersDeclared ?? false,
    } as never);
    store.refreshState();
    return firstValueFrom(component.vm$);
  }

  it('offers Confirm attackers in the declare attackers step', async () => {
    await setup();
    expect((await combatVm({ uiMode: 'declaring-attackers' })).showConfirmAttackersBtn).toBe(true);
  });

  it('does not offer Confirm attackers on the opponent turn (CR 508.1)', async () => {
    await setup();
    const vm = await combatVm({ uiMode: 'declaring-attackers', isActive: false });
    expect(vm.showConfirmAttackersBtn).toBe(false);
  });

  it('does not offer Confirm attackers once they have been declared', async () => {
    await setup();
    const vm = await combatVm({ uiMode: 'declaring-attackers', attackersDeclared: true });
    expect(vm.showConfirmAttackersBtn).toBe(false);
  });

  it('does not offer Confirm attackers outside the declare attackers step', async () => {
    await setup();
    const vm = await combatVm({ uiMode: 'declaring-attackers', step: Step.DeclareBlockers });
    expect(vm.showConfirmAttackersBtn).toBe(false);
  });

  it('does not offer Confirm blockers on your own turn (CR 509.1)', async () => {
    await setup();
    const vm = await combatVm({
      uiMode: 'declaring-blockers',
      isActive: true,
      step: Step.DeclareBlockers,
    });
    expect(vm.showConfirmBlockersBtn).toBe(false);
  });

  it('offers Confirm blockers in the declare blockers step as the defender', async () => {
    await setup();
    const vm = await combatVm({
      uiMode: 'declaring-blockers',
      isActive: false,
      step: Step.DeclareBlockers,
    });
    expect(vm.showConfirmBlockersBtn).toBe(true);
  });

  // ---- Naming a number for a cost (CR 601.2b) -------------

  const typed = (value: string) => ({ target: { value } }) as unknown as Event;

  it('announces the number that was typed', async () => {
    await setup();
    const spy = spyOn(store, 'dispatch');

    component.onAnnounceInput(typed('3'));
    component.confirmAnnounce();

    expect(spy).toHaveBeenCalledWith(UIActions.confirmAnnounce({ value: 3 }));
  });

  it('will not announce a negative X (CR 107.3)', async () => {
    // The engine would refuse it, and a refusal the board could see coming is one nobody
    // should have to be shown.
    await setup();
    const spy = spyOn(store, 'dispatch');

    component.onAnnounceInput(typed('-4'));
    component.confirmAnnounce();

    expect(spy).toHaveBeenCalledWith(UIActions.confirmAnnounce({ value: 0 }));
  });

  it('does not open the next prompt on the last one’s number', async () => {
    // The field is destroyed with the prompt; the value behind it is not. Left standing it
    // would be a cost paid for an amount nobody named.
    await setup();
    component.onAnnounceInput(typed('7'));
    component.cancelAnnounce();

    const spy = spyOn(store, 'dispatch');
    component.confirmAnnounce();

    expect(spy).toHaveBeenCalledWith(UIActions.confirmAnnounce({ value: 0 }));
  });

  it('switches Focus/Table, steps in circular turn order and keeps Pass available when collapsed', async () => {
    await setup();
    component.setOpponentView('table');
    expect(component.opponentView).toBe('table');
    component.stepOpponent([{ player: { playerId: 'a' } }, { player: { playerId: 'b' } }], 'a', -1);
    expect(component.opponentView).toBe('focus');
    component.toggleStack();
    expect(component.stackCollapsed).toBeTrue();
    const dispatch = spyOn(store, 'dispatch');
    component.passPriority();
    expect(dispatch).toHaveBeenCalledWith(GameActions.passPriority());
    component.followTurn();
  });
  it('joins a different route on a reused board and leaves on destruction', async () => {
    await setup('first');
    const dispatch = spyOn(store, 'dispatch');
    fixture.detectChanges();
    routeParams.next(convertToParamMap({ gameId: 'second' }));
    expect(dispatch).toHaveBeenCalledWith(
      GameActions.joinGame({ gameId: 'second', playerToken: '' }),
    );
    fixture.destroy();
    expect(dispatch).toHaveBeenCalledWith(GameActions.leaveGame());
    dispatch.calls.reset();
    routeParams.next(convertToParamMap({ gameId: 'third' }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
