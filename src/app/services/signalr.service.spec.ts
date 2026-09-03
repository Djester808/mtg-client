import { TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { SignalRService } from './signalr.service';
import { GameView } from '../models/play.models';

/**
 * How an id the board picked is described to the engine.
 *
 * The board sends bare ids, because that is what the UI it was written against took. The engine
 * wants to know what kind of thing each one is, and gets it wrong in a way that is invisible
 * from the screen: the spell is simply refused and stays in hand.
 */
describe('SignalRService target kinds', () => {
  let service: SignalRService;

  const view = {
    viewer: 'alice',
    players: [{ playerId: 'alice' }, { playerId: 'bob' }],
    stack: [{ id: 'stack-1' }, { id: 'stack-2' }],
  } as unknown as GameView;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    service = TestBed.inject(SignalRService);
    (service as unknown as { latest: GameView }).latest = view;
  });

  const kindsOf = (ids: string[]) =>
    (
      service as unknown as {
        targetsFor(ids: string[]): { kind: string; objectId: string | null }[];
      }
    ).targetsFor(ids);

  it('describes a player as a player', () => {
    expect(kindsOf(['bob'])[0]).toEqual({
      kind: 'player',
      objectId: null,
      playerId: 'bob',
    } as never);
  });

  it('describes a spell on the stack as a spell (CR 115.1)', () => {
    // The bug this exists for: sent as a permanent, and the engine answered
    // "Illegal target: target spell." — so a Counterspell could never resolve.
    expect(kindsOf(['stack-1'])[0].kind).toBe('spell');
    expect(kindsOf(['stack-1'])[0].objectId).toBe('stack-1');
  });

  it('describes anything else as a permanent', () => {
    expect(kindsOf(['some-creature'])[0].kind).toBe('permanent');
  });

  it('describes a mixed list one id at a time', () => {
    expect(kindsOf(['alice', 'stack-2', 'perm-9']).map((t) => t.kind)).toEqual([
      'player',
      'spell',
      'permanent',
    ]);
  });

  it('falls back to permanent when no view has arrived yet', () => {
    (service as unknown as { latest: GameView | null }).latest = null;
    expect(kindsOf(['stack-1'])[0].kind).toBe('permanent');
  });
});

/**
 * The shape of a hub call, argument for argument.
 *
 * SignalR binds hub arguments by position and does not fill in a server-side default for one the
 * client left off, so a hub method that grows a parameter stops accepting the old call entirely.
 * That is invisible from every other kind of test here: the in-process hub tests on the server
 * call the method in C#, where the default *does* apply, and everything on this side stops at the
 * service boundary. On the board it showed up as a spell that stayed in hand with no refusal and
 * no line in the game log, because the invocation never reached the method.
 */
describe('SignalRService hub arity', () => {
  let service: SignalRService;
  const sent: unknown[][] = [];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    service = TestBed.inject(SignalRService);

    sent.length = 0;
    (service as unknown as { latest: GameView }).latest = {
      viewer: 'alice',
      players: [{ playerId: 'alice' }],
      stack: [],
    } as unknown as GameView;
    (service as unknown as { gameId: string }).gameId = 'game-1';
    (service as unknown as { hub: unknown }).hub = {
      state: 'Connected',
      invoke: (...args: unknown[]) => {
        sent.push(args);
        return Promise.resolve();
      },
      stop: () => Promise.resolve(),
    };
  });

  it('sends CastSpell every argument the hub declares', async () => {
    await service.castSpell('card-1', []);

    // name, gameId, cardId, targets, X, options — the options slot is sent even when nothing
    // was chosen, because leaving it off is not "the default", it is a failed invocation.
    expect(sent.length).toBe(1);
    expect(sent[0][0]).toBe('CastSpell');
    expect(sent[0].length).toBe(6);
    expect(sent[0][5]).toBeNull();
  });

  it('passes the options through when a cost was chosen', async () => {
    await service.castSpell('card-1', [], 0, { kicked: true });

    expect(sent[0][5]).toEqual({ kicked: true });
  });

  it('sends the announced X rather than a hardcoded zero (CR 601.2b)', async () => {
    // The zero was written into the call itself, so every cast succeeded and every X spell was
    // cast for nothing — Harvest Pyre exiling no cards and dealing no damage — while the engine
    // charged the announced number correctly the whole time.
    await service.castSpell('card-1', [], 4);

    expect(sent[0][4]).toBe(4);
  });

  it('sends ActivateAbility every argument the hub declares', async () => {
    await service.activateAbility('perm-1', 'mana');

    // name, gameId, permanentId, abilityId, targets, X — the number slot is sent even for an
    // ability that asks for nothing, because a hub call binds by position and the server does
    // not fill in what was left off.
    expect(sent.length).toBe(1);
    expect(sent[0][0]).toBe('ActivateAbility');
    expect(sent[0].length).toBe(6);
    expect(sent[0][5]).toBe(0);
  });

  it('passes the chosen number through for a cost that asks for one', async () => {
    await service.activateAbility('perm-1', 'a', [], 3);

    expect(sent[0][5]).toBe(3);
  });
});
