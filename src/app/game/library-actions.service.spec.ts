import { TestBed } from '@angular/core/testing';
import { LibraryActionsService } from './library-actions.service';
import { SignalRService } from '../services/signalr.service';

describe('LibraryActionsService', () => {
  let hub: jasmine.SpyObj<SignalRService>;
  let service: LibraryActionsService;
  let scope: string | null;
  beforeEach(() => {
    scope = 'library-test-' + crypto.randomUUID();
    hub = jasmine.createSpyObj<SignalRService>('SignalRService', [
      'manualLibrary',
      'manualLibraryReposition',
      'manualLibrarySearch',
      'manualLibraryArrange',
    ]);
    Object.defineProperty(hub, 'libraryRequestScope', { get: () => scope });
    TestBed.configureTestingModule({ providers: [{ provide: SignalRService, useValue: hub }] });
    service = TestBed.inject(LibraryActionsService);
  });
  for (const action of ['look', 'stopLooking'] as const) {
    it('starts a fresh ' + action + ' after the opposite inspection action completes', async () => {
      const opposite = action === 'look' ? 'stopLooking' : 'look';
      hub.manualLibrary.and.rejectWith(new Error('Response lost'));
      await expectAsync(service.perform(action)).toBeRejected();
      const uncertain = hub.manualLibrary.calls.mostRecent().args[1];
      service = TestBed.runInInjectionContext(() => new LibraryActionsService());
      hub.manualLibrary.and.resolveTo();
      await service.perform(opposite);
      await service.perform(action);
      expect(hub.manualLibrary.calls.mostRecent().args[1]).not.toBe(uncertain);
    });
    it('preserves an uncertain ' + action + ' when the opposite action also fails', async () => {
      const opposite = action === 'look' ? 'stopLooking' : 'look';
      hub.manualLibrary.and.rejectWith(new Error('Response lost'));
      await expectAsync(service.perform(action)).toBeRejected();
      const uncertain = hub.manualLibrary.calls.mostRecent().args[1];
      await expectAsync(service.perform(opposite)).toBeRejected();
      hub.manualLibrary.and.resolveTo();
      await service.perform(action);
      expect(hub.manualLibrary.calls.mostRecent().args[1]).toBe(uncertain);
    });
  }
  it('does not send when retry persistence fails and releases the busy gate', async () => {
    const write = spyOn(Storage.prototype, 'setItem').and.throwError('Storage unavailable');
    await expectAsync(service.perform('draw')).toBeRejected();
    expect(hub.manualLibrary).not.toHaveBeenCalled();
    write.and.callThrough();
    hub.manualLibrary.and.resolveTo();
    await service.perform('draw');
    expect(hub.manualLibrary).toHaveBeenCalledTimes(1);
  });
  it('retains uncertain requests when the service is recreated after reload', async () => {
    hub.manualLibrary.and.rejectWith(new Error('Response lost'));
    await expectAsync(service.perform('draw')).toBeRejected();
    const request = hub.manualLibrary.calls.mostRecent().args[1];
    service = TestBed.runInInjectionContext(() => new LibraryActionsService());
    hub.manualLibrary.and.resolveTo();
    await service.perform('draw');
    expect(hub.manualLibrary.calls.mostRecent().args[1]).toBe(request);
    service = TestBed.runInInjectionContext(() => new LibraryActionsService());
    await service.perform('draw');
    expect(hub.manualLibrary.calls.mostRecent().args[1]).not.toBe(request);
  });
  it('separates table/player scopes and refuses a request without a scope', async () => {
    const firstScope = scope;
    hub.manualLibrary.and.rejectWith(new Error('Response lost'));
    await expectAsync(service.perform('draw')).toBeRejected();
    const request = hub.manualLibrary.calls.mostRecent().args[1];
    scope = firstScope + '-other';
    hub.manualLibrary.and.resolveTo();
    await service.perform('draw');
    expect(hub.manualLibrary.calls.mostRecent().args[1]).not.toBe(request);
    scope = firstScope;
    await service.perform('draw');
    expect(hub.manualLibrary.calls.mostRecent().args[1]).toBe(request);
    hub.manualLibrary.calls.reset();
    scope = null;
    await expectAsync(service.perform('draw')).toBeRejected();
    expect(hub.manualLibrary).not.toHaveBeenCalled();
  });
  it('retains the request ID after an uncertain failure and uses a new ID for the next action', async () => {
    hub.manualLibrary.and.rejectWith(new Error('Disconnected'));
    await expectAsync(service.perform('draw')).toBeRejected();
    const first = hub.manualLibrary.calls.mostRecent().args[1];
    hub.manualLibrary.and.resolveTo();
    await service.perform('draw');
    expect(hub.manualLibrary.calls.mostRecent().args).toEqual(['draw', first]);
    await service.perform('draw');
    expect(hub.manualLibrary.calls.mostRecent().args[1]).not.toBe(first);
  });
  it('retains search retry identity for equivalent options and separates changed instructions', async () => {
    const options = {
      count: 1,
      destination: 'Hand' as const,
      reveal: false,
      shuffleAfter: true,
      tapped: false,
      where: 'Default' as const,
    };
    hub.manualLibrarySearch.and.rejectWith(new Error('Disconnected'));
    await expectAsync(service.search(options)).toBeRejected();
    const request = hub.manualLibrarySearch.calls.mostRecent().args[0];
    hub.manualLibrarySearch.and.resolveTo();
    await service.search({ ...options, count: 2 });
    expect(hub.manualLibrarySearch.calls.mostRecent().args[0]).not.toBe(request);
    await service.search({ ...options });
    expect(hub.manualLibrarySearch.calls.mostRecent().args[0]).not.toBe(request);
    expect(hub.manualLibrarySearch.calls.mostRecent().args[1]).toEqual(options);
    let finish!: () => void;
    hub.manualLibrarySearch.and.returnValue(new Promise<void>((resolve) => (finish = resolve)));
    const pending = service.search(options);
    await service.perform('shuffle');
    expect(hub.manualLibrary).not.toHaveBeenCalled();
    finish();
    await pending;
  });
  it('binds arrangement retries to exact order and freezes the submitted array', async () => {
    const order = ['o1', 'o2'];
    hub.manualLibraryArrange.and.rejectWith(new Error('Disconnected'));
    await expectAsync(service.arrange(order)).toBeRejected();
    const request = hub.manualLibraryArrange.calls.mostRecent().args[0];
    order.reverse();
    expect(hub.manualLibraryArrange.calls.mostRecent().args[1]).toEqual(['o1', 'o2']);
    hub.manualLibraryArrange.and.resolveTo();
    await service.arrange(order);
    expect(hub.manualLibraryArrange.calls.mostRecent().args[0]).not.toBe(request);
    await service.arrange(['o1', 'o2']);
    expect(hub.manualLibraryArrange.calls.mostRecent().args[0]).not.toBe(request);
    expect(hub.manualLibraryArrange.calls.mostRecent().args[1]).toEqual(['o1', 'o2']);
  });
  it('binds reposition retries to both card and destination and shares the busy gate', async () => {
    hub.manualLibraryReposition.and.rejectWith(new Error('Disconnected'));
    await expectAsync(service.reposition('o7', 0)).toBeRejected();
    const request = hub.manualLibraryReposition.calls.mostRecent().args[0];
    hub.manualLibraryReposition.and.resolveTo();
    await service.reposition('o7', -1);
    expect(hub.manualLibraryReposition.calls.mostRecent().args[0]).not.toBe(request);
    await service.reposition('o8', 0);
    expect(hub.manualLibraryReposition.calls.mostRecent().args[0]).not.toBe(request);
    await service.reposition('o7', 0);
    expect(hub.manualLibraryReposition.calls.mostRecent().args[0]).not.toBe(request);
    expect(hub.manualLibraryReposition.calls.mostRecent().args.slice(1)).toEqual(['o7', 0]);
    let finish!: () => void;
    hub.manualLibraryReposition.and.returnValue(new Promise<void>((resolve) => (finish = resolve)));
    const pending = service.reposition('o7', -1);
    await service.perform('shuffle');
    expect(hub.manualLibrary).not.toHaveBeenCalled();
    finish();
    await pending;
  });
  it('preserves uncertain arrangement across inspection, reload and another failed mutation', async () => {
    hub.manualLibraryArrange.and.rejectWith(new Error('Response lost'));
    await expectAsync(service.arrange(['o1', 'o2'])).toBeRejected();
    const request = hub.manualLibraryArrange.calls.mostRecent().args[0];
    hub.manualLibrary.and.resolveTo();
    await service.perform('look');
    await service.perform('stopLooking');
    hub.manualLibrary.and.rejectWith(new Error('Response lost'));
    await expectAsync(service.perform('shuffle')).toBeRejected();
    service = TestBed.runInInjectionContext(() => new LibraryActionsService());
    hub.manualLibraryArrange.and.resolveTo();
    await service.arrange(['o1', 'o2']);
    expect(hub.manualLibraryArrange.calls.mostRecent().args[0]).toBe(request);
  });
  it('retires an uncertain arrangement after a confirmed mutation only in the same scope', async () => {
    const originalScope = scope;
    hub.manualLibraryArrange.and.rejectWith(new Error('Response lost'));
    await expectAsync(service.arrange(['o1', 'o2'])).toBeRejected();
    const request = hub.manualLibraryArrange.calls.mostRecent().args[0];
    scope = originalScope + '-other';
    hub.manualLibrary.and.resolveTo();
    await service.perform('shuffle');
    scope = originalScope;
    await expectAsync(service.arrange(['o1', 'o2'])).toBeRejected();
    expect(hub.manualLibraryArrange.calls.mostRecent().args[0]).toBe(request);
    await service.perform('shuffle');
    hub.manualLibraryArrange.and.resolveTo();
    await service.arrange(['o1', 'o2']);
    expect(hub.manualLibraryArrange.calls.mostRecent().args[0]).not.toBe(request);
  });
  it('does not send a second action while the first is still pending', async () => {
    let finish!: () => void;
    hub.manualLibrary.and.returnValue(new Promise<void>((resolve) => (finish = resolve)));
    const first = service.perform('shuffle');
    await service.perform('shuffle');
    expect(hub.manualLibrary).toHaveBeenCalledTimes(1);
    expect(hub.manualLibrary.calls.mostRecent().args[0]).toBe('shuffle');
    finish();
    await first;
  });
  it('keeps inspection and stop requests separate while preserving safe retries', async () => {
    hub.manualLibrary.and.rejectWith(new Error('Disconnected'));
    await expectAsync(service.perform('look')).toBeRejected();
    const request = hub.manualLibrary.calls.mostRecent().args[1];
    hub.manualLibrary.and.resolveTo();
    await service.perform('look');
    expect(hub.manualLibrary.calls.mostRecent().args).toEqual(['look', request]);
    await service.perform('stopLooking');
    expect(hub.manualLibrary.calls.mostRecent().args[0]).toBe('stopLooking');
    expect(hub.manualLibrary.calls.mostRecent().args[1]).not.toBe(request);
  });
});
