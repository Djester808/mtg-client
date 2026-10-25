import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { HubConnection, HubConnectionState } from '@microsoft/signalr';
import { SignalRService } from './signalr.service';
import { GameViewAdapter } from '../game/game-view.adapter';
import { GameActions } from '../store/game/game.actions';

function fakeHub() {
  const handlers = new Map<string, (...args: any[]) => void>();
  return {
    handlers,
    state: HubConnectionState.Connected,
    on: (name: string, callback: (...args: any[]) => void) => handlers.set(name, callback),
    onclose: (callback: () => void) => handlers.set('close', callback),
    onreconnecting: (callback: () => void) => handlers.set('reconnecting', callback),
    onreconnected: (callback: () => void) => handlers.set('reconnected', callback),
    start: jasmine.createSpy('start').and.resolveTo(),
    stop: jasmine.createSpy('stop').and.resolveTo(),
    invoke: jasmine.createSpy('invoke').and.resolveTo(),
  };
}

describe('SignalR table lifecycle', () => {
  let service: SignalRService;
  let store: MockStore;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    service = TestBed.inject(SignalRService);
    store = TestBed.inject(MockStore);
  });
  function connections(...hubs: ReturnType<typeof fakeHub>[]) {
    spyOn(service as unknown as { createHub(): HubConnection }, 'createHub').and.returnValues(
      ...hubs.map((hub) => hub as unknown as HubConnection),
    );
  }
  it('retires the old socket and ignores its late updates, closure and reconnect', async () => {
    const first = fakeHub();
    const second = fakeHub();
    connections(first, second);
    await service.connect('first', '');
    await service.connect('second', '');
    expect(first.stop).toHaveBeenCalled();
    const dispatch = spyOn(store, 'dispatch');
    const adapter = spyOn(TestBed.inject(GameViewAdapter), 'toGameState');
    first.handlers.get('ViewUpdated')!({}, {});
    first.handlers.get('close')!();
    first.handlers.get('reconnected')!();
    expect(adapter).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(second.invoke).toHaveBeenCalledOnceWith('Join', 'second');
  });
  it('does not erase a new connection when an older disconnect finishes', async () => {
    const first = fakeHub();
    const second = fakeHub();
    let finish!: () => void;
    first.stop.and.returnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    connections(first, second);
    await service.connect('first', '');
    const leaving = service.disconnect();
    await service.connect('second', '');
    finish();
    await leaving;
    expect(service.connectionState).toBe(HubConnectionState.Connected);
    second.handlers.get('reconnected')!();
    expect(second.invoke).toHaveBeenCalledWith('Join', 'second');
  });
  it('reports a failed reconnect join instead of an unhandled rejection', async () => {
    const hub = fakeHub();
    connections(hub);
    await service.connect('game', '');
    const dispatch = spyOn(store, 'dispatch');
    hub.invoke.and.rejectWith(new Error('Join failed'));
    hub.handlers.get('reconnected')!();
    await Promise.resolve();
    expect(dispatch).toHaveBeenCalledWith(GameActions.connectionError({ error: 'Join failed' }));
  });
  it('does not report concession success before a view has arrived', async () => {
    const hub = fakeHub();
    connections(hub);
    await service.connect('game', '');
    await expectAsync(service.concede()).toBeRejected();
    expect(hub.invoke).toHaveBeenCalledOnceWith('Join', 'game');
  });
});
