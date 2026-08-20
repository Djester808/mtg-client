import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PlayHubService } from './play-hub.service';
import { PlayApiService } from './play-api.service';
import { GameView } from '../models/play.models';

/**
 * The live connection to a game.
 *
 * The socket itself is not stood up here — that would be a test of SignalR. What is worth
 * pinning is everything around it: that the board is seeded before the socket is up, that a
 * failed seed is survivable, that every action carries the game id, and that leaving clears the
 * board rather than leaving the last game on screen behind the next one.
 */
describe('PlayHubService', () => {
  const VIEW = { gameId: 'game-9', viewer: 'me', turnNumber: 2 } as GameView;

  let api: { view: jasmine.Spy; log: jasmine.Spy; create: jasmine.Spy };
  let service: PlayHubService;
  let invoked: { method: string; args: unknown[] }[];

  /** Stands in for the SignalR connection, recording what the service asks it to send. */
  function fakeConnection() {
    return {
      on: jasmine.createSpy('on'),
      onreconnecting: jasmine.createSpy('onreconnecting'),
      onreconnected: jasmine.createSpy('onreconnected'),
      onclose: jasmine.createSpy('onclose'),
      start: jasmine.createSpy('start').and.resolveTo(undefined),
      stop: jasmine.createSpy('stop').and.resolveTo(undefined),
      invoke: jasmine.createSpy('invoke').and.callFake((method: string, ...args: unknown[]) => {
        invoked.push({ method, args });
        return Promise.resolve();
      }),
    };
  }

  beforeEach(() => {
    invoked = [];
    api = {
      view: jasmine.createSpy('view').and.returnValue(of(VIEW)),
      log: jasmine.createSpy('log').and.returnValue(of(['Game started.'])),
      create: jasmine.createSpy('create'),
    };

    TestBed.configureTestingModule({
      // NgZone comes from TestBed; listing it here asks the injector to construct one.
      providers: [PlayHubService, { provide: PlayApiService, useValue: api }],
    });

    service = TestBed.inject(PlayHubService);
  });

  /** Joins with the socket replaced, so the seed and the sends can be observed. */
  async function join(gameId = 'game-9') {
    const connection = fakeConnection();
    // The builder is only reachable from inside join(), so the connection is planted directly.
    spyOn(
      service as unknown as { buildConnection: () => unknown },
      'buildConnection',
    ).and.returnValue(connection);
    await service.join(gameId);
    return connection;
  }

  it('seeds the board from REST before the socket is up', async () => {
    // Without this a refresh shows nothing until the other player does something, which on a
    // slow turn is a long wait with no explanation on screen.
    await join();

    expect(api.view).toHaveBeenCalledWith('game-9');
    expect(service.view()?.gameId).toBe('game-9');
    expect(service.log().length).toBe(1);
  });

  it('survives a failed seed, because the socket is the real source of truth', async () => {
    api.view.and.returnValue(throwError(() => new Error('offline')));
    api.log.and.returnValue(throwError(() => new Error('offline')));

    await join();

    expect(service.view()).toBeNull();
    expect(service.connection$()).toBe('connected');
  });

  it('joins the game it was given', async () => {
    await join('game-42');

    expect(invoked.some((i) => i.method === 'Join' && i.args[0] === 'game-42')).toBeTrue();
  });

  it('sends every action against the joined game', async () => {
    await join();
    invoked.length = 0;

    await service.passPriority();
    await service.playLand('card-1');
    await service.castSpell('card-2');
    await service.activateAbility('perm-1', 'mana');
    await service.discard('card-3');

    expect(invoked.map((i) => i.method)).toEqual([
      'PassPriority',
      'PlayLand',
      'CastSpell',
      'ActivateAbility',
      'Discard',
    ]);
    // Every one carries the game id first: the hub authorises on seat membership, and an
    // action without a game is not a thing the server can place.
    expect(invoked.every((i) => i.args[0] === 'game-9')).toBeTrue();
  });

  it('does nothing when asked to act before joining', async () => {
    await service.passPriority();

    expect(invoked).toEqual([]);
  });

  it('clears the board on leaving, so the next game does not open on the last one', async () => {
    const connection = await join();

    await service.leave();

    expect(connection.stop).toHaveBeenCalled();
    expect(service.view()).toBeNull();
    expect(service.log()).toEqual([]);
    expect(service.connection$()).toBe('closed');
  });

  it('holds a refusal until it is acknowledged', () => {
    service.refusal.set('You do not have priority (CR 117.1).');

    expect(service.refusal()).toContain('117.1');
    service.acknowledge();
    expect(service.refusal()).toBeNull();
  });
});
