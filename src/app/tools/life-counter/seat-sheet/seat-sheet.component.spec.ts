import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { SeatSheetComponent } from './seat-sheet.component';
import { LifeCounterService } from '../life-counter.service';
import { Seat, commanderKey } from '../../../models/life-counter.models';
import { PlayerRecord } from '../../../services/match-api.service';

/**
 * The controls that do not fit on a panel.
 *
 * Two things here are worth pinning: that commander damage lists one row per *commander*
 * rather than per player (CR 702.124d), and that signing a seat in is a per-seat act which
 * refuses an account already sitting at the table.
 */
describe('SeatSheetComponent', () => {
  let fixture: ComponentFixture<SeatSheetComponent>;
  let component: SeatSheetComponent;
  let counter: LifeCounterService;
  let http: HttpTestingController;

  const seats = (): Seat[] => counter.seats();

  function render(index = 0): void {
    fixture.componentRef.setInput('seat', seats()[index]);
    fixture.componentRef.setInput('allSeats', seats());
    fixture.detectChanges();
  }

  const record = (over: Partial<PlayerRecord> = {}): PlayerRecord => ({
    played: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    recent: [],
    ...over,
  });

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, SeatSheetComponent],
      providers: [provideMockStore({ initialState: { auth: { token: null } } })],
    }).compileComponents();

    counter = TestBed.inject(LifeCounterService);
    http = TestBed.inject(HttpTestingController);
    counter.newGame(3, 40);

    fixture = TestBed.createComponent(SeatSheetComponent);
    component = fixture.componentInstance;
    render();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  // ---- Commander damage ----------------------------------------------------------------

  it('lists a row for every other player, not for itself', () => {
    expect(component.commanderSources.length).toBe(2);
    expect(component.commanderSources.map((s) => s.label)).toEqual(['Player 2', 'Player 3']);
  });

  it('lists two rows for a player with partners, labelled apart', () => {
    counter.setCommanderCount(seats()[1].id, 2);
    render();

    const labels = component.commanderSources.map((s) => s.label);
    expect(labels).toEqual(['Player 2 · 1st', 'Player 2 · 2nd', 'Player 3']);
  });

  it('takes the life along with the tally', () => {
    const from = commanderKey(seats()[1].id, 0);
    component.adjustCommanderDamage(from, 5);

    expect(seats()[0].life).toBe(35);
    expect(LifeCounterService.damageFrom(seats()[0], seats()[1].id, 0)).toBe(5);
  });

  it('flags a tally that has reached 21', () => {
    const from = commanderKey(seats()[1].id, 0);
    component.adjustCommanderDamage(from, 21);
    render();

    expect(component.commanderSources[0].lethal).toBeTrue();
  });

  // ---- Counters -------------------------------------------------------------------------

  it('steps a counter and flags the one that is lethal', () => {
    component.adjustCounter('poison', 10);
    render();

    const poison = component.counterSpecs[0];
    expect(component.counterValue('poison')).toBe(10);
    expect(component.isLethal(poison)).toBeTrue();
  });

  it('does not flag a resource counter however high it goes', () => {
    component.adjustCounter('energy', 40);
    render();

    const energy = component.counterSpecs.find((s) => s.kind === 'energy')!;
    expect(component.isLethal(energy)).toBeFalse();
  });

  // ---- Leaving by hand --------------------------------------------------------------------

  it('offers to bring back a player who was taken out by hand', () => {
    component.declareOut('Conceded');
    render();
    expect(component.declaredOut).toBeTrue();

    component.rejoin();
    render();
    expect(component.out).toBeFalse();
  });

  it('does not offer to bring back a player the numbers took out', () => {
    counter.adjustLife(seats()[0].id, -40);
    render();

    // "Back in the game" against a 0 life total would be a button that undoes a rule.
    expect(component.out).toBeTrue();
    expect(component.declaredOut).toBeFalse();
  });

  // ---- Signing in --------------------------------------------------------------------------

  it('signs a player in at this seat and keeps their token there', () => {
    component.username = 'nissa@example.com';
    component.password = 'hunter2222';
    component.submitSignIn();

    const req = http.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ username: 'nissa@example.com', password: 'hunter2222' });
    req.flush({ token: 'jwt-for-nissa', username: 'Nissa' });
    http.expectOne('/api/matches/me').flush(record());

    expect(seats()[0].account).toEqual({ username: 'Nissa', token: 'jwt-for-nissa' });
    // The account's name, not the typed one: login takes an email, and the record will carry
    // the username.
    expect(seats()[0].name).toBe('Nissa');
  });

  it('refuses an account that is already sitting at the table', () => {
    counter.signIn(seats()[1].id, { username: 'Nissa', token: 'jwt' });
    render();

    component.username = 'nissa@example.com';
    component.password = 'hunter2222';
    component.submitSignIn();
    http.expectOne('/api/auth/login').flush({ token: 'another-jwt', username: 'Nissa' });

    expect(component.signInError).toContain('already sitting');
    expect(seats()[0].account).toBeNull();
  });

  it('says the password was wrong rather than "please sign in again"', () => {
    component.username = 'nissa';
    component.password = 'wrong';
    component.submitSignIn();

    http
      .expectOne('/api/auth/login')
      .flush({ detail: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });

    expect(component.signInError).toBe('That username or password is not right.');
  });

  it('never keeps the typed password around after an attempt', () => {
    component.username = 'nissa';
    component.password = 'hunter2222';
    component.submitSignIn();
    http.expectOne('/api/auth/login').flush({ token: 'jwt', username: 'Nissa' });
    http.expectOne('/api/matches/me').flush(record());

    expect(component.password).toBe('');
  });

  it('does not fire a second request while one is in flight', () => {
    component.username = 'nissa';
    component.password = 'hunter2222';
    component.submitSignIn();
    component.submitSignIn();

    http.expectOne('/api/auth/login').flush({ token: 'jwt', username: 'Nissa' });
    http.expectOne('/api/matches/me').flush(record());
  });

  it('drops the token when the seat signs out', () => {
    counter.signIn(seats()[0].id, { username: 'Nissa', token: 'jwt' });
    render();
    http.expectOne('/api/matches/me').flush(record());

    component.signOut();
    expect(seats()[0].account).toBeNull();
    expect(component.record).toBeNull();
  });

  // ---- The record ------------------------------------------------------------------------

  it('reads the record as the seat, not as the browser', () => {
    component.username = 'nissa';
    component.password = 'hunter2222';
    component.submitSignIn();
    http.expectOne('/api/auth/login').flush({ token: 'jwt-nissa', username: 'Nissa' });

    const req = http.expectOne('/api/matches/me');
    // Four people share this device. Without the seat's own token the answer would be about
    // whoever the app is signed in as, quietly and with no way to tell.
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-nissa');
    req.flush(record({ played: 9, wins: 4, losses: 5, winRate: 0.444 }));

    expect(component.record?.wins).toBe(4);
  });

  it('asks once per account, however often the sheet is re-rendered', () => {
    counter.signIn(seats()[0].id, { username: 'Nissa', token: 'jwt' });
    render();
    http.expectOne('/api/matches/me').flush(record());

    render();
    render();
    http.expectNone('/api/matches/me');
  });

  it('says nothing rather than looking like the sign-in failed when the record cannot be read', () => {
    counter.signIn(seats()[0].id, { username: 'Nissa', token: 'jwt' });
    render();

    http.expectOne('/api/matches/me').flush(null, { status: 500, statusText: 'Server Error' });

    expect(component.record).toBeNull();
    expect(component.signInError).toBeNull();
  });
  it('drops an earlier account record request when that seat signs out', () => {
    counter.signIn(seats()[0].id, { username: 'Nissa', token: 'jwt' });
    render();
    const pending = http.expectOne((r) => r.url.includes('/matches'));
    component.loadRecord(null);
    expect(pending.cancelled).toBeTrue();
    expect(component.record).toBeNull();
    expect(component.recordFor).toBeNull();
  });

  it('cancels seat sign-in when the sheet closes', () => {
    component.username = 'Nissa';
    component.password = 'secret';
    component.submitSignIn();
    const pending = http.expectOne((r) => r.url.endsWith('/login'));
    fixture.destroy();
    expect(pending.cancelled).toBeTrue();
    expect(seats()[0].account).toBeNull();
  });
});
