import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { GameBoardComponent } from './game-board.component';
import { GameActions, UIActions } from '../store';
import { SignalRService } from '../services/signalr.service';

describe('GameBoardComponent', () => {
  let component: GameBoardComponent;
  let fixture: ComponentFixture<GameBoardComponent>;
  let store: MockStore;
  let router: Router;
  let signalr: jasmine.SpyObj<SignalRService>;

  function setup(gameIdParam: string | null = 'game-abc'): Promise<void> {
    return TestBed.configureTestingModule({
      imports: [GameBoardComponent],
      providers: [
        provideMockStore(),
        provideRouter([]),
        { provide: SignalRService, useValue: signalr },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(gameIdParam ? { gameId: gameIdParam } : {}) } },
        },
      ],
    })
      .overrideComponent(GameBoardComponent, { set: { imports: [], template: '<div></div>' } })
      .compileComponents()
      .then(() => {
        store   = TestBed.inject(MockStore);
        router  = TestBed.inject(Router);
        fixture = TestBed.createComponent(GameBoardComponent);
        component = fixture.componentInstance;
      });
  }

  beforeEach(() => {
    signalr = jasmine.createSpyObj<SignalRService>('SignalRService', ['disconnect']);
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
      localStorage.setItem('mtg_session', JSON.stringify({ gameId: 'game-abc', playerToken: 'tok-1' }));
      await setup('game-abc');
      spyOn(store, 'dispatch');

      fixture.detectChanges();

      expect(store.dispatch).toHaveBeenCalledWith(
        GameActions.joinGame({ gameId: 'game-abc', playerToken: 'tok-1' })
      );
    });

    it('navigates to lobby when no session is stored', async () => {
      await setup('game-abc');
      spyOn(router, 'navigate');

      fixture.detectChanges();

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('navigates to lobby when route has no gameId', async () => {
      localStorage.setItem('mtg_session', JSON.stringify({ gameId: 'game-abc', playerToken: 'tok-1' }));
      await setup(null);
      spyOn(router, 'navigate');

      fixture.detectChanges();

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('navigates to lobby when session gameId does not match route', async () => {
      localStorage.setItem('mtg_session', JSON.stringify({ gameId: 'OTHER', playerToken: 'tok-1' }));
      await setup('game-abc');
      spyOn(router, 'navigate');

      fixture.detectChanges();

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('navigates to lobby when session JSON is malformed', async () => {
      localStorage.setItem('mtg_session', 'not-json');
      await setup('game-abc');
      spyOn(router, 'navigate');

      fixture.detectChanges();

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });
  });

  // ---- concede modal flow ---------------------------------

  describe('concede modal', () => {
    beforeEach(async () => {
      localStorage.setItem('mtg_session', JSON.stringify({ gameId: 'game-abc', playerToken: 'tok-1' }));
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

    it('confirmConcede() disconnects SignalR', () => {
      component.confirmConcede();

      expect(signalr.disconnect).toHaveBeenCalled();
    });

    it('confirmConcede() removes session from localStorage', () => {
      component.confirmConcede();

      expect(localStorage.getItem('mtg_session')).toBeNull();
    });

    it('confirmConcede() navigates to lobby', () => {
      spyOn(router, 'navigate');

      component.confirmConcede();

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('onEscapeKey() closes the modal when it is open', () => {
      component.showConcedeModal = true;

      component.onEscapeKey();

      expect(component.showConcedeModal).toBeFalse();
    });

    it('onEscapeKey() does nothing when modal is closed', () => {
      component.showConcedeModal = false;
      spyOn(store, 'dispatch');

      component.onEscapeKey();

      expect(store.dispatch).not.toHaveBeenCalled();
    });
  });

  // ---- closePreview / passPriority / combat ---------------

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

    it('dispatches deselectCard on document click', () => {
      spyOn(store, 'dispatch');
      component.onDocumentClick();
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
});
