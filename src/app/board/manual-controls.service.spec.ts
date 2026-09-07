import { TestBed } from '@angular/core/testing';
import { ManualControlsService } from './manual-controls.service';
import { SignalRService } from '../services/signalr.service';
import { ToastService } from '../services/toast.service';
import { makePermanent, makePlayer } from '../testing/test-factories';

/**
 * What the honour system's controls actually send, and what they refuse to send.
 *
 * The engine applies no rule to these four commands, so this service is the only place where
 * anything is checked at all before one goes on the wire: the object was admitted honour-system,
 * the counters have a name, the delta is not zero. A test that only proved the hub was called
 * would prove nothing about any of that.
 */
describe('ManualControlsService', () => {
  let service: ManualControlsService;
  let hub: jasmine.SpyObj<SignalRService>;
  let toasts: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    hub = jasmine.createSpyObj<SignalRService>('SignalRService', [
      'manualMove',
      'manualTap',
      'manualCounters',
      'manualLife',
    ]);
    hub.manualMove.and.returnValue(Promise.resolve());
    hub.manualTap.and.returnValue(Promise.resolve());
    hub.manualCounters.and.returnValue(Promise.resolve());
    hub.manualLife.and.returnValue(Promise.resolve());
    toasts = jasmine.createSpyObj<ToastService>('ToastService', ['show']);

    TestBed.configureTestingModule({
      providers: [
        ManualControlsService,
        { provide: SignalRService, useValue: hub },
        { provide: ToastService, useValue: toasts },
      ],
    });
    service = TestBed.inject(ManualControlsService);
  });

  const honour = (overrides = {}) => makePermanent({ enforced: false, ...overrides });

  describe('which objects the panel is for', () => {
    it('keeps the objects the table plays by hand', () => {
      const kept = honour({ permanentId: 'manual-1' });
      const enforced = makePermanent({ permanentId: 'engine-1', enforced: true });

      expect(service.honourSystem([kept, enforced]).map((p) => p.permanentId)).toEqual([
        'manual-1',
      ]);
    });

    it('treats an object whose admission never arrived as honour-system', () => {
      // The adapter defaults an absent flag to false for the same reason: claiming the engine is
      // enforcing a card it has never read is the one error nobody at the table can see.
      const unflagged = makePermanent({ permanentId: 'unknown-1' });
      delete (unflagged as { enforced?: boolean }).enforced;

      expect(service.honourSystem([unflagged]).length).toBe(1);
    });
  });

  describe('what the panel is handed', () => {
    it('puts both battlefields in front of the players', () => {
      const mine = makePermanent({ permanentId: 'mine-1' });
      const theirs = makePermanent({ permanentId: 'theirs-1' });

      expect(service.bothBattlefields([mine], [theirs]).map((p) => p.permanentId)).toEqual([
        'mine-1',
        'theirs-1',
      ]);
    });

    it('leaves out a seat that is not there rather than a null entry', () => {
      const alice = makePlayer([], { playerId: 'alice' });

      expect(service.seatsAtTable(alice, null).map((p) => p.playerId)).toEqual(['alice']);
      expect(service.seatsAtTable(null, undefined)).toEqual([]);
    });
  });

  describe('moving a card by hand', () => {
    it('sends the zone, the position and how it arrives', async () => {
      await service.move(honour({ permanentId: 'obj-1' }), 'library-top');

      // The top of a library is a position, not a zone of its own (CR 401.1).
      expect(hub.manualMove).toHaveBeenCalledWith('obj-1', 'Library', 0, false);
    });

    it('puts a card on the bottom of the library with the other end of the same zone', async () => {
      await service.move(honour({ permanentId: 'obj-1' }), 'library-bottom');

      expect(hub.manualMove).toHaveBeenCalledWith('obj-1', 'Library', -1, false);
    });

    it('brings a permanent onto the battlefield untapped (CR 110.5c)', async () => {
      await service.move(honour({ permanentId: 'obj-1' }), 'battlefield');

      expect(hub.manualMove).toHaveBeenCalledWith('obj-1', 'Battlefield', -1, false);
    });

    it('offers every zone a player has to be able to reach', () => {
      expect(service.zones.map((z) => z.id)).toEqual([
        'hand',
        'battlefield',
        'graveyard',
        'exile',
        'library-top',
        'library-bottom',
        'command',
      ]);
    });

    it('sends nothing for a zone it does not know', async () => {
      await service.move(honour(), 'sideboard');

      expect(hub.manualMove).not.toHaveBeenCalled();
    });

    it('refuses a manual action on an enforced object and says why', async () => {
      await service.move(makePermanent({ enforced: true }), 'hand');

      expect(hub.manualMove).not.toHaveBeenCalled();
      expect(toasts.show).toHaveBeenCalled();
    });
  });

  describe('tapping by hand', () => {
    it('sends the state it wants rather than a toggle', async () => {
      await service.toggleTapped(honour({ permanentId: 'obj-1', isTapped: false }));

      expect(hub.manualTap).toHaveBeenCalledWith('obj-1', true);
    });

    it('untaps one that is tapped', async () => {
      await service.toggleTapped(honour({ permanentId: 'obj-1', isTapped: true }));

      expect(hub.manualTap).toHaveBeenCalledWith('obj-1', false);
    });

    it('will not tap an enforced permanent', async () => {
      await service.setTapped(makePermanent({ enforced: true }), true);

      expect(hub.manualTap).not.toHaveBeenCalled();
    });
  });

  describe('counters', () => {
    it('sends the kind the player named and a signed delta', async () => {
      await service.counters(honour({ permanentId: 'obj-1' }), '  charge  ', 1);

      expect(hub.manualCounters).toHaveBeenCalledWith('obj-1', 'charge', 1);
    });

    it('removes counters with a negative delta', async () => {
      await service.counters(honour({ permanentId: 'obj-1' }), '+1/+1', -1);

      expect(hub.manualCounters).toHaveBeenCalledWith('obj-1', '+1/+1', -1);
    });

    it('refuses a counter with no name, because a counter is what it is called', async () => {
      await service.counters(honour(), '   ', 1);

      expect(hub.manualCounters).not.toHaveBeenCalled();
      expect(toasts.show).toHaveBeenCalled();
    });

    it('drops a delta of zero rather than logging an event that changed nothing', async () => {
      await service.counters(honour(), '+1/+1', 0);

      expect(hub.manualCounters).not.toHaveBeenCalled();
    });

    it('caps the kind at a name rather than a sentence', async () => {
      await service.counters(honour({ permanentId: 'obj-1' }), 'x'.repeat(60), 1);

      expect(hub.manualCounters).toHaveBeenCalledWith('obj-1', 'x'.repeat(24), 1);
    });
  });

  describe('life', () => {
    it('moves any seat, named by its own id', async () => {
      await service.life(makePlayer([], { playerId: 'bob' }), -3);

      expect(hub.manualLife).toHaveBeenCalledWith('bob', -3);
    });

    it('drops a delta of zero', async () => {
      await service.life(makePlayer([], { playerId: 'bob' }), 0);

      expect(hub.manualLife).not.toHaveBeenCalled();
    });
  });
});
