import { TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { SignalRService } from './signalr.service';
import { LibraryActionsService } from '../game/library-actions.service';
import { ToastService } from './toast.service';
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

/** Verify the public service boundary against the server's single Command endpoint. */
describe('SignalRService engine commands', () => {
  let service: SignalRService;
  const sent: unknown[][] = [];
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    service = TestBed.inject(SignalRService);
    sent.length = 0;
    (service as unknown as { latest: GameView }).latest = {
      gameId: 'game-1',
      viewer: 'p0',
      players: [{ playerId: 'p0' }, { playerId: 'p1' }, { playerId: 'p2' }],
      stack: [{ id: 'o9' }],
      choice: { id: 'c4' },
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
  const command = () => {
    expect(sent.length).toBe(1);
    expect(sent[0].slice(0, 2)).toEqual(['Command', 'game-1']);
    expect(sent[0].length).toBe(3);
    return sent[0][2];
  };
  it('preserves the library request identity through a real transport failure', async () => {
    const actions = TestBed.inject(LibraryActionsService);
    const warning = spyOn(TestBed.inject(ToastService), 'show');
    const transport = (
      service as unknown as { hub: { invoke: (...args: unknown[]) => Promise<void> } }
    ).hub;
    let fail = true;
    transport.invoke = (...args: unknown[]) => {
      sent.push(args);
      return fail ? Promise.reject(new Error('Response lost')) : Promise.resolve();
    };
    await expectAsync(actions.perform('draw')).toBeRejected();
    expect(warning).not.toHaveBeenCalled();
    fail = false;
    await actions.perform('draw');
    expect(sent[1]).toEqual(sent[0]);
    await actions.perform('draw');
    expect(sent[2]).not.toEqual(sent[0]);
  });
  it('rejects library requests when disconnected or waiting for a snapshot', async () => {
    const warning = spyOn(TestBed.inject(ToastService), 'show');
    const transport = (service as unknown as { hub: { state: string } }).hub;
    transport.state = 'Disconnected';
    await expectAsync(service.manualLibrary('draw', 'request')).toBeRejected();
    transport.state = 'Connected';
    (service as unknown as { latest: GameView | null }).latest = null;
    await expectAsync(service.manualLibrary('shuffle', 'request')).toBeRejected();
    expect(warning).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });
  it('sends a cast with separated object/player targets and announced X', async () => {
    await service.castSpell('o7', ['p1', 'o9', 'o8'], 4);
    expect(command()).toEqual({
      kind: 'cast',
      card: 7,
      faceIndex: 0,
      targets: [9, 8],
      targetPlayers: [1],
      modes: null,
      x: 4,
      costChoices: null,
    });
  });
  it('sends the engine ability index and chosen X', async () => {
    await service.activateAbility('o6', '2', ['p2'], 3);
    expect(command()).toEqual({
      kind: 'activate',
      source: 6,
      abilityIndex: 2,
      targets: [],
      targetPlayers: [2],
      modes: null,
      x: 3,
      costChoices: null,
    });
  });
  it('preserves separate defending players for attackers', async () => {
    await service.declareAttackers(['o5', 'o6'], { o5: 'p1', o6: 'p2' });
    expect(command()).toEqual({
      kind: 'attack',
      attacks: [
        { attacker: 5, defendingPlayer: 1, defendingPermanent: null },
        { attacker: 6, defendingPlayer: 2, defendingPermanent: null },
      ],
    });
  });
  it('flattens blocker assignments without losing multiple blockers', async () => {
    await service.declareBlockers({ o5: 'o8', o6: 'o8' });
    expect(command()).toEqual({
      kind: 'block',
      blocks: [
        { attacker: 8, blocker: 5 },
        { attacker: 8, blocker: 6 },
      ],
    });
  });
  it('answers the current choice', async () => {
    await service.choose(['keep']);
    expect(command()).toEqual({ kind: 'answer', choice: 4, answer: ['keep'] });
  });
  it('coalesces answers while the same choice is in flight and permits retry after failure', async () => {
    const internals = service as unknown as {
      hub: { invoke: (...args: unknown[]) => Promise<void> };
    };
    const rejectSends: ((reason: Error) => void)[] = [];
    let calls = 0;
    internals.hub.invoke = () => {
      calls++;
      return new Promise<void>((_, reject) => {
        rejectSends.push(reject);
      });
    };
    spyOn(console, 'error');
    const picks = ['a'];
    const first = service.choose(picks, 'confirm');
    picks[0] = 'mutated';
    const duplicate = service.choose(['b'], 'skip');
    expect(service.choiceSubmission('c4')).toEqual(
      jasmine.objectContaining({ control: 'confirm', picks: ['a'] }),
    );
    expect(service.choiceSubmission('c5')).toBeNull();
    expect(calls).toBe(1);
    expect(service.isChoicePending('c4')).toBeTrue();
    expect(service.isChoicePending('c5')).toBeFalse();
    rejectSends.forEach((reject) => reject(new Error('Connection interrupted')));
    await Promise.all([first, duplicate]);
    expect(service.isChoicePending('c4')).toBeFalse();
    expect(service.choiceSubmission('c4')).toBeNull();
    internals.hub.invoke = () => {
      calls++;
      return Promise.resolve();
    };
    await service.choose(['a']);
    expect(calls).toBe(2);
  });
  it('does not warn about an answered choice when its late invocation fails', async () => {
    const internals = service as any;
    const toast = spyOn(TestBed.inject(ToastService), 'show');
    spyOn(console, 'error');
    internals.hub.invoke = async () => {
      internals.latest = { ...internals.latest, choice: null };
      throw Error('Accepted response lost');
    };
    await service.choose(['a']);
    expect(toast).not.toHaveBeenCalled();
  });

  it('clears only its choice warning after a later authoritative view resolves the choice', async () => {
    const internals = service as any;
    const toasts = TestBed.inject(ToastService);
    let messages: string[] = [];
    const subscription = toasts.toasts$.subscribe(
      (items) => (messages = items.map((item) => item.message)),
    );
    toasts.show('Unrelated warning', 'warn', 0);
    spyOn(console, 'error');
    internals.hub.invoke = async () => {
      throw Error('Response lost');
    };
    await service.choose(['a']);
    expect(messages).toContain('Choice status unknown. Reload to sync.');
    internals.updateLatest({ ...internals.latest });
    expect(messages).toContain('Choice status unknown. Reload to sync.');
    internals.updateLatest({ ...internals.latest, choice: null });
    expect(messages).toEqual(['Unrelated warning']);
    subscription.unsubscribe();
  });
  it('sends manual movement defaults as values', async () => {
    await service.manualMove('o7', 'Graveyard');
    expect(command()).toEqual({
      kind: 'manualMove',
      object: 7,
      to: { zone: 'Graveyard', player: 0 },
      position: -1,
      tapped: false,
    });
  });
  it('retains explicit library position and tapped state', async () => {
    await service.manualMove('o7', 'Library', 0, true);
    expect(command()).toEqual({
      kind: 'manualMove',
      object: 7,
      to: { zone: 'Library', player: 0 },
      position: 0,
      tapped: true,
    });
  });
  it('sends manual tapping including false', async () => {
    await service.manualTap('o7', false);
    expect(command()).toEqual({ kind: 'manualTap', object: 7, tapped: false });
  });
  it('separates the counter name from the command discriminator', async () => {
    await service.manualCounters('o7', '+1/+1', -2);
    expect(command()).toEqual({
      kind: 'manualCounters',
      object: 7,
      counterKind: '+1/+1',
      delta: -2,
    });
  });
  it('sends a chosen player life adjustment', async () => {
    await service.manualLife('p2', -3);
    expect(command()).toEqual({ kind: 'manualLife', target: 2, delta: -3 });
  });
});
