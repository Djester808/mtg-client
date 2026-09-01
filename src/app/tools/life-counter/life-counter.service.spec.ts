import { TestBed } from '@angular/core/testing';
import { LifeCounterService } from './life-counter.service';
import { LETHAL_COMMANDER_DAMAGE, Seat, commanderKey } from '../../models/life-counter.models';

/**
 * The rules the counter actually applies.
 *
 * Four of the five ways to lose a game of Magic are numbers a table keeps by hand (CR
 * 104.3), and three of them are not the life total. These are the tests for those three,
 * plus the one thing every hand-rolled tracker gets wrong — that commander damage is
 * ordinary damage and comes off the life total too.
 */
describe('LifeCounterService', () => {
  let sut: LifeCounterService;

  /** A fresh service with empty storage; the service reads localStorage on construction. */
  function build(): LifeCounterService {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(LifeCounterService);
  }

  const seatAt = (i: number): Seat => sut.seats()[i];

  beforeEach(() => {
    sut = build();
    sut.newGame(4, 40);
  });

  afterEach(() => localStorage.clear());

  // ---- Setting up ------------------------------------------------------------------------

  it('deals the table the asked-for number of seats at the asked-for life', () => {
    expect(sut.seats().length).toBe(4);
    expect(sut.seats().every((s) => s.life === 40)).toBeTrue();
  });

  it('clamps a player count to the two-to-eight the counter supports', () => {
    sut.newGame(99, 40);
    expect(sut.seats().length).toBe(8);

    sut.newGame(1, 20);
    expect(sut.seats().length).toBe(2);
  });

  it('keeps names, sign-ins and pictures across a new game between the same people', () => {
    sut.rename(seatAt(0).id, 'Nissa');
    sut.setArt(seatAt(0).id, 'data:image/jpeg;base64,zzz', 'upload', 'A photo');

    sut.newGame(4, 40);

    expect(seatAt(0).name).toBe('Nissa');
    expect(seatAt(0).art).toBe('data:image/jpeg;base64,zzz');
    expect(seatAt(0).life).toBe(40);
  });

  // ---- Life · CR 704.5a --------------------------------------------------------------------

  it('gains and loses life', () => {
    sut.adjustLife(seatAt(0).id, -7);
    sut.adjustLife(seatAt(0).id, 3);
    expect(seatAt(0).life).toBe(36);
  });

  it('takes a player out at zero life', () => {
    sut.adjustLife(seatAt(0).id, -40);

    expect(LifeCounterService.isOut(seatAt(0))).toBeTrue();
    expect(LifeCounterService.lossReasonFor(seatAt(0))).toBe('LifeTotal');
  });

  it('takes a player out below zero, not only exactly at it', () => {
    sut.adjustLife(seatAt(0).id, -55);
    expect(LifeCounterService.lossReasonFor(seatAt(0))).toBe('LifeTotal');
  });

  // ---- Poison · CR 704.5c -------------------------------------------------------------------

  it('takes a player out at ten poison counters and not at nine', () => {
    sut.adjustCounter(seatAt(0).id, 'poison', 9);
    expect(LifeCounterService.isOut(seatAt(0))).toBeFalse();

    sut.adjustCounter(seatAt(0).id, 'poison', 1);
    expect(LifeCounterService.lossReasonFor(seatAt(0))).toBe('Poison');
  });

  it('does not take life for poison — infect deals counters instead of damage (CR 702.90b)', () => {
    sut.adjustCounter(seatAt(0).id, 'poison', 5);
    expect(seatAt(0).life).toBe(40);
  });

  it('never lets a counter go negative', () => {
    sut.adjustCounter(seatAt(0).id, 'energy', 2);
    sut.adjustCounter(seatAt(0).id, 'energy', -5);
    expect(seatAt(0).counters.energy).toBe(0);
  });

  it('leaves a resource counter alone as a loss condition', () => {
    sut.adjustCounter(seatAt(0).id, 'energy', 50);
    sut.adjustCounter(seatAt(0).id, 'experience', 50);
    expect(LifeCounterService.isOut(seatAt(0))).toBeFalse();
  });

  // ---- Commander damage · CR 903.10a -----------------------------------------------------------

  it('takes the life as well as the tally, because commander damage is damage', () => {
    const from = commanderKey(seatAt(1).id, 0);
    sut.adjustCommanderDamage(seatAt(0).id, from, 7);

    expect(seatAt(0).life).toBe(33);
    expect(LifeCounterService.damageFrom(seatAt(0), seatAt(1).id, 0)).toBe(7);
  });

  it('gives the life back when a tally is corrected down', () => {
    const from = commanderKey(seatAt(1).id, 0);
    sut.adjustCommanderDamage(seatAt(0).id, from, 7);
    sut.adjustCommanderDamage(seatAt(0).id, from, -3);

    expect(seatAt(0).life).toBe(36);
    expect(LifeCounterService.damageFrom(seatAt(0), seatAt(1).id, 0)).toBe(4);
  });

  it('does not drain life when a tally already at zero is tapped down', () => {
    const from = commanderKey(seatAt(1).id, 0);
    sut.adjustCommanderDamage(seatAt(0).id, from, -5);

    expect(seatAt(0).life).toBe(40);
    expect(LifeCounterService.damageFrom(seatAt(0), seatAt(1).id, 0)).toBe(0);
  });

  it('takes a player out at 21 from one commander', () => {
    const from = commanderKey(seatAt(1).id, 0);
    sut.adjustLife(seatAt(0).id, 60); // Well clear of dying to the damage itself.
    sut.adjustCommanderDamage(seatAt(0).id, from, LETHAL_COMMANDER_DAMAGE);

    expect(LifeCounterService.lossReasonFor(seatAt(0))).toBe('CommanderDamage');
  });

  it('counts each commander of a pair separately (CR 702.124d)', () => {
    sut.setCommanderCount(seatAt(1).id, 2);
    sut.adjustLife(seatAt(0).id, 60);

    // Twenty from each is forty damage and still not a loss — a tracker that summed the two
    // would have called this at the second commander's fifth point.
    sut.adjustCommanderDamage(seatAt(0).id, commanderKey(seatAt(1).id, 0), 20);
    sut.adjustCommanderDamage(seatAt(0).id, commanderKey(seatAt(1).id, 1), 20);

    expect(LifeCounterService.isOut(seatAt(0))).toBeFalse();
    expect(LifeCounterService.worstCommanderDamage(seatAt(0))).toBe(20);
  });

  it('drops the second commander tally when a player goes back to one commander', () => {
    sut.setCommanderCount(seatAt(1).id, 2);
    sut.adjustCommanderDamage(seatAt(0).id, commanderKey(seatAt(1).id, 1), 12);

    sut.setCommanderCount(seatAt(1).id, 1);

    // A hidden number that still counted towards 21 would be worse than a lost one.
    expect(LifeCounterService.damageFrom(seatAt(0), seatAt(1).id, 1)).toBe(0);
    expect(LifeCounterService.worstCommanderDamage(seatAt(0))).toBe(0);
  });

  it('undoes a commander count change in one step', () => {
    sut.setCommanderCount(seatAt(1).id, 2);
    sut.undo();
    expect(seatAt(1).commanders).toBe(1);
  });

  // ---- Leaving by hand · CR 104.3a/c/e -------------------------------------------------------------

  it('takes a player out for a reason the counter cannot see', () => {
    sut.declareOut(seatAt(0).id, 'EmptyLibrary');

    expect(LifeCounterService.lossReasonFor(seatAt(0))).toBe('EmptyLibrary');
    expect(seatAt(0).life).toBe(40);
  });

  it('lets a hand-declared exit be taken back', () => {
    sut.declareOut(seatAt(0).id, 'Conceded');
    sut.rejoin(seatAt(0).id);
    expect(LifeCounterService.isOut(seatAt(0))).toBeFalse();
  });

  // ---- Ending the game -----------------------------------------------------------------------------

  it('is over with one player left, and names them the winner', () => {
    sut.adjustLife(seatAt(1).id, -40);
    sut.adjustLife(seatAt(2).id, -40);
    expect(sut.over()).toBeFalse();

    sut.adjustLife(seatAt(3).id, -40);

    expect(sut.over()).toBeTrue();
    expect(sut.winner()?.id).toBe(seatAt(0).id);
  });

  it('is over with nobody left, and names no winner — that is a draw', () => {
    for (const seat of sut.seats()) sut.adjustLife(seat.id, -40);

    expect(sut.over()).toBeTrue();
    expect(sut.winner()).toBeNull();
  });

  // ---- Undo ------------------------------------------------------------------------------------------

  it('walks back one change at a time', () => {
    sut.adjustLife(seatAt(0).id, -3);
    sut.adjustLife(seatAt(0).id, -4);

    sut.undo();
    expect(seatAt(0).life).toBe(37);

    sut.undo();
    expect(seatAt(0).life).toBe(40);
  });

  it('has nothing to undo on a fresh table', () => {
    expect(sut.canUndo()).toBeFalse();
  });

  it('undoes commander damage and its life change together', () => {
    sut.adjustCommanderDamage(seatAt(0).id, commanderKey(seatAt(1).id, 0), 6);
    sut.undo();

    expect(seatAt(0).life).toBe(40);
    expect(LifeCounterService.worstCommanderDamage(seatAt(0))).toBe(0);
  });

  // ---- Accounts ----------------------------------------------------------------------------------------

  it('knows whether anyone at the table is signed in', () => {
    expect(sut.hasAccounts()).toBeFalse();

    sut.signIn(seatAt(0).id, { username: 'Nissa', token: 'jwt' });
    expect(sut.hasAccounts()).toBeTrue();
  });

  it('takes the account name for the seat, since that is what reaches the record', () => {
    sut.signIn(seatAt(0).id, { username: 'Nissa', token: 'jwt' });
    expect(seatAt(0).name).toBe('Nissa');
  });

  it('spots an account that is already sitting somewhere else, whatever the casing', () => {
    sut.signIn(seatAt(0).id, { username: 'Nissa', token: 'jwt' });

    expect(sut.isSeated('nissa', seatAt(1).id)).toBeTrue();
    // Its own seat does not count, or signing in twice would refuse itself.
    expect(sut.isSeated('Nissa', seatAt(0).id)).toBeFalse();
    expect(sut.isSeated('Jace', seatAt(1).id)).toBeFalse();
  });

  // ---- Storage --------------------------------------------------------------------------------------------

  it('survives a reload', () => {
    sut.rename(seatAt(0).id, 'Nissa');
    sut.adjustLife(seatAt(0).id, -12);
    sut.adjustCounter(seatAt(0).id, 'poison', 3);

    // A second service reading the same storage is what a reload amounts to.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(LifeCounterService);

    expect(reloaded.seats()[0].name).toBe('Nissa');
    expect(reloaded.seats()[0].life).toBe(28);
    expect(reloaded.seats()[0].counters.poison).toBe(3);
  });

  it('keeps the pictures out of the state it writes on every tap', () => {
    sut.setArt(seatAt(0).id, 'data:image/jpeg;base64,zzz', 'upload', 'A photo');
    sut.adjustLife(seatAt(0).id, -1);

    // The hot path would otherwise re-serialise a megabyte of base64 per tap.
    const written = localStorage.getItem('mtg.life-counter.state.v1') ?? '';
    expect(written).not.toContain('base64');
    expect(localStorage.getItem(`mtg.life-counter.art.v1.${seatAt(0).id}`)).toContain('base64');
  });

  it('fills in a counter kind a stored table predates', () => {
    // Exactly what an older save looks like once a new counter is added to the app.
    const stale = {
      startingLife: 40,
      startedAt: new Date().toISOString(),
      recorded: false,
      seats: [
        { id: 'old-0', name: 'Nissa', life: 40, counters: { poison: 2 }, commanders: 1 },
        { id: 'old-1', name: 'Jace', life: 40, counters: { poison: 0 }, commanders: 1 },
      ],
    };
    localStorage.setItem('mtg.life-counter.state.v1', JSON.stringify(stale));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(LifeCounterService);

    expect(reloaded.seats()[0].counters.poison).toBe(2);
    expect(reloaded.seats()[0].counters.rad).toBe(0);
    expect(reloaded.seats()[0].commanderDamage).toEqual({});
  });

  it('starts an empty table rather than throwing on unreadable storage', () => {
    localStorage.setItem('mtg.life-counter.state.v1', 'not json');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(LifeCounterService);

    expect(reloaded.seats()).toEqual([]);
  });

  it('reports a picture it could not save instead of losing it silently', () => {
    const setItem = spyOn(Storage.prototype, 'setItem').and.callFake((key: string) => {
      if (key.startsWith('mtg.life-counter.art')) throw new DOMException('QuotaExceededError');
    });

    sut.setArt(seatAt(0).id, 'data:image/jpeg;base64,zzz', 'upload', 'A photo');

    expect(sut.storageWarning()).toContain('no room to save it');
    // The picture is still on screen for this game — only its persistence failed.
    expect(seatAt(0).art).toBe('data:image/jpeg;base64,zzz');
    setItem.and.callThrough();
  });
});
