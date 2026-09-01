import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { LifeCounterComponent } from './life-counter.component';
import { LifeCounterService } from './life-counter.service';
import { PlayerPanelComponent } from './player-panel/player-panel.component';
import { BreakpointsService } from '../../shared/breakpoints.service';
import { selectIsLoggedIn } from '../../store/auth/auth.selectors';
import { RecordMatchRequest } from '../../services/match-api.service';
import { signal } from '@angular/core';

/**
 * The table, and what happens when the game ends.
 *
 * The test that carries the feature is the one on the recorded payload: a seat is attributed
 * to an account only by that account's own token, and a guest's seat must go up carrying a
 * name and nothing else.
 */
describe('LifeCounterComponent', () => {
  let fixture: ComponentFixture<LifeCounterComponent>;
  let component: LifeCounterComponent;
  let counter: LifeCounterService;
  let http: HttpTestingController;
  let store: MockStore;

  const narrow = signal(true);

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, LifeCounterComponent],
      providers: [
        provideRouter([]),
        provideMockStore({ selectors: [{ selector: selectIsLoggedIn, value: true }] }),
        {
          provide: BreakpointsService,
          // Driven by the spec rather than inherited from whatever width Karma opened at.
          useValue: { isPhone: narrow, isNavCollapsed: narrow },
        },
      ],
    }).compileComponents();

    counter = TestBed.inject(LifeCounterService);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(MockStore);

    fixture = TestBed.createComponent(LifeCounterComponent);
    component = fixture.componentInstance;
    narrow.set(true);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  function startTable(count = 4): void {
    component.setupCount = count;
    component.setupLife = 40;
    component.startGame();
    fixture.detectChanges();
  }

  // ---- Setup -----------------------------------------------------------------------------

  it('opens on the setup form when there is no table', () => {
    expect(component.showSetup()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.setup')).not.toBeNull();
  });

  it('offers every player count from two to eight', () => {
    expect(component.playerCounts).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it('deals the table and shows a panel each', () => {
    startTable(6);

    expect(fixture.nativeElement.querySelectorAll('app-player-panel').length).toBe(6);
    expect(component.showSetup()).toBeFalse();
  });

  // ---- Arrangement -------------------------------------------------------------------------

  it('gives a duel one column on a phone and everything else two', () => {
    startTable(2);
    expect(component.columns()).toBe(1);

    startTable(8);
    expect(component.columns()).toBe(2);
  });

  it('spreads wider when there is room for it', () => {
    startTable(8);
    narrow.set(false);
    expect(component.columns()).toBe(4);
  });

  it('turns the top half of the table to face the players sitting there', () => {
    startTable(4);

    // Two columns, two rows: the top row is upside down and the bottom row is not.
    expect([0, 1, 2, 3].map((i) => component.isFlipped(i))).toEqual([true, true, false, false]);
  });

  it('turns nothing on a screen that stands up', () => {
    startTable(4);
    narrow.set(false);

    expect([0, 1, 2, 3].map((i) => component.isFlipped(i))).toEqual([false, false, false, false]);
  });

  it('turns nothing when the switch is off', () => {
    startTable(4);
    component.flipAcross.set(false);

    expect(component.isFlipped(0)).toBeFalse();
  });

  it('keeps the same panel component across a life change', () => {
    startTable(2);

    const panelsBefore = fixture.debugElement
      .queryAll(By.directive(PlayerPanelComponent))
      .map((d) => d.componentInstance as PlayerPanelComponent);

    counter.adjustLife(counter.seats()[0].id, -1);
    fixture.detectChanges();

    const panelsAfter = fixture.debugElement
      .queryAll(By.directive(PlayerPanelComponent))
      .map((d) => d.componentInstance as PlayerPanelComponent);

    // Without trackBy this fails, and everything the panel holds itself goes with the
    // rebuild: the running delta, the gain/loss flash, and the hold-to-repeat timer. The
    // life total keeps working either way, which is what hid it.
    expect(panelsAfter[0]).toBe(panelsBefore[0]);
    expect(panelsAfter[1]).toBe(panelsBefore[1]);
  });

  it('shrinks the numbers once six seats share the screen', () => {
    startTable(5);
    expect(component.dense()).toBeFalse();

    startTable(6);
    expect(component.dense()).toBeTrue();
  });

  // ---- Ending the game -----------------------------------------------------------------------

  it('shows nothing about a result until the game is over', () => {
    startTable(2);
    expect(fixture.nativeElement.querySelector('.lc-result')).toBeNull();
  });

  it('names the winner when one player is left', () => {
    startTable(2);
    counter.adjustLife(counter.seats()[1].id, -40);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.result-name').textContent).toContain('Player 1');
  });

  it('says nobody can be credited when the whole table is guests', () => {
    startTable(2);
    counter.adjustLife(counter.seats()[1].id, -40);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.lc-result').textContent).toContain(
      'no record to write',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Record result');
  });

  // ---- Filing the result ----------------------------------------------------------------------

  it('sends each signed-in seat its own token, and a guest none', () => {
    startTable(3);
    const seats = counter.seats();
    counter.signIn(seats[0].id, { username: 'Nissa', token: 'jwt-nissa' });
    counter.signIn(seats[1].id, { username: 'Jace', token: 'jwt-jace' });

    counter.adjustLife(seats[1].id, -40);
    counter.adjustCounter(seats[2].id, 'poison', 10);
    fixture.detectChanges();

    component.recordResult();

    const req = http.expectOne('/api/matches');
    const body = req.request.body as RecordMatchRequest;

    expect(body.startingLife).toBe(40);
    expect(body.seats.map((s) => s.token)).toEqual(['jwt-nissa', 'jwt-jace', undefined]);
    expect(body.seats.map((s) => s.won)).toEqual([true, false, false]);
    // The reason comes from the numbers, not from a guess.
    expect(body.seats.map((s) => s.lossReason)).toEqual(['Unspecified', 'LifeTotal', 'Poison']);
    expect(body.seats[1].finalLife).toBe(0);

    req.flush({ matchId: 'm1', attributedUsernames: ['Nissa', 'Jace'] });
    expect(component.recorded()).toBeTrue();
  });

  it('does not offer to file the same game twice', () => {
    startTable(2);
    counter.signIn(counter.seats()[0].id, { username: 'Nissa', token: 'jwt' });
    counter.adjustLife(counter.seats()[1].id, -40);
    fixture.detectChanges();

    component.recordResult();
    http.expectOne('/api/matches').flush({ matchId: 'm1', attributedUsernames: ['Nissa'] });

    component.recordResult();
    http.expectNone('/api/matches');
  });

  it('files on a seat sign-in alone, with no app session', () => {
    // The case the whole per-seat sign-in exists for: somebody's phone on the table, its
    // owner signed out, two players signed in at their own seats.
    store.overrideSelector(selectIsLoggedIn, false);
    store.refreshState();
    startTable(2);
    counter.signIn(counter.seats()[0].id, { username: 'Nissa', token: 'jwt-nissa' });
    counter.adjustLife(counter.seats()[1].id, -40);
    fixture.detectChanges();

    component.recordResult();

    const req = http.expectOne('/api/matches');
    // A seat's token authenticates the call. The interceptor overwrites this whenever the
    // app does hold a session, so it never displaces a real one.
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-nissa');
    req.flush({ matchId: 'm1', attributedUsernames: ['Nissa'] });

    expect(component.recorded()).toBeTrue();
  });

  it('leaves the game unfiled and shows the server’s reason when it refuses', () => {
    startTable(2);
    counter.signIn(counter.seats()[0].id, { username: 'Nissa', token: 'stale' });
    counter.adjustLife(counter.seats()[1].id, -40);
    fixture.detectChanges();

    component.recordResult();
    http
      .expectOne('/api/matches')
      .flush(
        { detail: 'The sign-in for seat 1 is no longer valid. Have that player sign in again.' },
        { status: 400, statusText: 'Bad Request' },
      );

    expect(component.filing()).toBeFalse();
    expect(component.recorded()).toBeFalse();
  });

  // ---- Between games ----------------------------------------------------------------------------

  it('plays again with the same people at full life', () => {
    startTable(3);
    counter.signIn(counter.seats()[0].id, { username: 'Nissa', token: 'jwt' });
    counter.adjustLife(counter.seats()[1].id, -40);

    component.rematch();
    fixture.detectChanges();

    expect(component.seats().length).toBe(3);
    expect(component.seats().every((s) => s.life === 40)).toBeTrue();
    expect(component.seats()[0].account?.username).toBe('Nissa');
    expect(component.over()).toBeFalse();
  });

  it('opens a seat’s sheet and closes it again', () => {
    startTable(2);

    component.openSeatId.set(counter.seats()[0].id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-seat-sheet')).not.toBeNull();

    component.openSeatId.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-seat-sheet')).toBeNull();
  });
});
