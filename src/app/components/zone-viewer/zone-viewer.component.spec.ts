import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { firstValueFrom } from 'rxjs';
import { ZoneViewerComponent } from './zone-viewer.component';
import { selectZoneViewer, selectPlayers, selectLocalPlayerId } from '../../store/selectors';
import { selectGameState, selectUIMode } from '../../store/selectors';
import { CardCastingService } from '../../game/card-casting.service';
import { UIActions } from '../../store';
import { makeCard, makePlayer } from '../../testing/test-factories';
describe('ZoneViewerComponent', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [ZoneViewerComponent],
      providers: [provideMockStore()],
    }),
  );
  beforeEach(() => {
    const store = TestBed.inject(MockStore);
    store.overrideSelector(selectGameState, null);
    store.overrideSelector(selectUIMode, 'idle');
  });
  it('only offers server-approved casts in your own command zone', async () => {
    const store = TestBed.inject(MockStore);
    const card = makeCard({ cardId: 'leader' });
    const viewer = store.overrideSelector(selectZoneViewer, {
      open: true,
      zone: 'command',
      playerId: 'p0',
    });
    store.overrideSelector(selectPlayers, [
      makePlayer([], { playerId: 'p0', command: [card] }),
      makePlayer([], { playerId: 'p1', command: [card] }),
    ]);
    store.overrideSelector(selectLocalPlayerId, 'p0');
    store.overrideSelector(selectGameState, { castableCards: ['leader'] } as any);
    const fixture = TestBed.createComponent(ZoneViewerComponent);
    expect((await firstValueFrom(fixture.componentInstance.vm$))?.canCast).toEqual(['leader']);
    viewer.setResult({ open: true, zone: 'command', playerId: 'p1' });
    store.refreshState();
    expect((await firstValueFrom(fixture.componentInstance.vm$))?.canCast).toEqual([]);
    viewer.setResult({ open: true, zone: 'command', playerId: 'p0' });
    store.overrideSelector(selectUIMode, 'targeting');
    store.refreshState();
    expect((await firstValueFrom(fixture.componentInstance.vm$))?.canCast).toEqual([]);
    fixture.destroy();
  });
  it('closes before starting a permitted cast and ignores unavailable casts', () => {
    const fixture = TestBed.createComponent(ZoneViewerComponent);
    const card = makeCard();
    const close = spyOn(fixture.componentInstance, 'close');
    const start = spyOn(TestBed.inject(CardCastingService), 'start').and.callFake(() =>
      expect(close).toHaveBeenCalled(),
    );
    fixture.componentInstance.cast(card, false);
    expect(start).not.toHaveBeenCalled();
    fixture.componentInstance.cast(card, true);
    expect(start).toHaveBeenCalledOnceWith(card);
    fixture.destroy();
  });
  it('keeps opponent hands private even if a local DTO accidentally contains cards', async () => {
    const store = TestBed.inject(MockStore);
    store.overrideSelector(selectZoneViewer, { open: true, zone: 'hand', playerId: 'p1' });
    store.overrideSelector(selectPlayers, [
      makePlayer([makeCard()], { playerId: 'p1', handCount: 7 }),
    ]);
    store.overrideSelector(selectLocalPlayerId, 'p0');
    const fixture = TestBed.createComponent(ZoneViewerComponent);
    const vm = await firstValueFrom(fixture.componentInstance.vm$);
    expect(vm?.hidden).toBeTrue();
    expect(vm?.cards).toEqual([]);
    expect(vm?.count).toBe(7);
    fixture.destroy();
  });
  it('preserves the zone viewer while inspecting a public card', () => {
    const store = TestBed.inject(MockStore),
      fixture = TestBed.createComponent(ZoneViewerComponent),
      card = makeCard({ cardId: 'public' }),
      dispatch = spyOn(store, 'dispatch');
    fixture.componentInstance.contextCard = card;
    fixture.componentInstance.inspect();
    expect(dispatch.calls.allArgs()).toEqual([[UIActions.selectCard({ cardId: 'public' })]]);
    fixture.destroy();
  });
});
