import { LibraryActionsService } from '../../game/library-actions.service';
import { ToastService } from '../../services/toast.service';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { firstValueFrom } from 'rxjs';
import { ZoneViewerComponent } from './zone-viewer.component';
import { selectZoneViewer, selectPlayers, selectLocalPlayerId } from '../../store/selectors';
import { selectGameState, selectUIMode, selectGameReady } from '../../store/selectors';
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
    store.overrideSelector(selectGameReady, true);
  });
  it('closes an open library menu when top-card permission is revoked', async () => {
    const store = TestBed.inject(MockStore);
    const card = makeCard({ cardId: 'o1', ownerId: 'p0' });
    store.overrideSelector(selectZoneViewer, { open: true, zone: 'library', playerId: 'p0' });
    store.overrideSelector(selectLocalPlayerId, 'p0');
    const players = store.overrideSelector(selectPlayers, [
      makePlayer([], { playerId: 'p0', libraryCount: 99, topOfLibrary: card }),
    ]);
    const fixture = TestBed.createComponent(ZoneViewerComponent);
    fixture.detectChanges();
    fixture.componentInstance.options(new MouseEvent('contextmenu'), card);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card-options')).not.toBeNull();
    players.setResult([makePlayer([], { playerId: 'p0', libraryCount: 99, topOfLibrary: null })]);
    store.refreshState();
    fixture.detectChanges();
    expect(fixture.componentInstance.contextCard).toBeNull();
    expect(fixture.nativeElement.querySelector('.card-options')).toBeNull();
    expect(fixture.nativeElement.querySelector('.zone-card')).toBeNull();
    fixture.destroy();
  });
  it('withholds library controls until a live view arrives and removes them on disconnect', async () => {
    const store = TestBed.inject(MockStore);
    store.overrideSelector(selectZoneViewer, { open: true, zone: 'library', playerId: 'p0' });
    store.overrideSelector(selectPlayers, [makePlayer([], { playerId: 'p0' })]);
    store.overrideSelector(selectLocalPlayerId, 'p0');
    store.overrideSelector(selectGameState, { manualLibraryActionsAllowed: true } as any);
    const ready = store.overrideSelector(selectGameReady, false);
    const fixture = TestBed.createComponent(ZoneViewerComponent);
    expect((await firstValueFrom(fixture.componentInstance.vm$))?.canManualLibrary).toBeFalse();
    ready.setResult(true);
    store.refreshState();
    expect((await firstValueFrom(fixture.componentInstance.vm$))?.canManualLibrary).toBeTrue();
    ready.setResult(false);
    store.refreshState();
    expect((await firstValueFrom(fixture.componentInstance.vm$))?.canManualLibrary).toBeFalse();
    fixture.destroy();
  });
  it('submits a configured search only from the permitted local library', async () => {
    const store = TestBed.inject(MockStore);
    store.overrideSelector(selectZoneViewer, { open: true, zone: 'library', playerId: 'p0' });
    store.overrideSelector(selectPlayers, [makePlayer([], { playerId: 'p0' })]);
    store.overrideSelector(selectLocalPlayerId, 'p0');
    const game = store.overrideSelector(selectGameState, {
      manualLibraryActionsAllowed: true,
    } as any);
    const run = spyOn(TestBed.inject(LibraryActionsService), 'search').and.resolveTo();
    const fixture = TestBed.createComponent(ZoneViewerComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const submit = fixture.nativeElement.querySelector(
      '.library-search-submit',
    ) as HTMLButtonElement;
    expect(submit).not.toBeNull();
    if (!submit) return;
    submit.click();
    await fixture.whenStable();
    expect(run).toHaveBeenCalledOnceWith({
      count: 1,
      destination: 'Hand',
      filter: {},
      reveal: false,
      shuffleAfter: true,
      tapped: false,
      where: 'Default',
    });
    game.setResult({ manualLibraryActionsAllowed: false } as any);
    store.refreshState();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.library-search-submit')).toBeNull();
    fixture.destroy();
  });
  it('edits the inspected order locally and sends it only on confirmation', async () => {
    const store = TestBed.inject(MockStore);
    const cards = ['o1', 'o2'].map((cardId) => makeCard({ cardId, name: cardId, ownerId: 'p0' }));
    store.overrideSelector(selectZoneViewer, { open: true, zone: 'library', playerId: 'p0' });
    store.overrideSelector(selectPlayers, [makePlayer([], { playerId: 'p0', libraryCount: 2 })]);
    store.overrideSelector(selectLocalPlayerId, 'p0');
    store.overrideSelector(selectGameState, {
      manualLibraryActionsAllowed: true,
      manualLibraryLookActive: true,
      inspectedLibraryCards: cards,
    } as any);
    const run = spyOn(TestBed.inject(LibraryActionsService), 'arrange').and.resolveTo();
    const fixture = TestBed.createComponent(ZoneViewerComponent);
    fixture.detectChanges();
    const start = fixture.nativeElement.querySelector('.library-arrange') as HTMLButtonElement;
    expect(start).not.toBeNull();
    if (!start) return;
    start.click();
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('.library-order-editor .choice-order button:last-child')
      .click();
    fixture.detectChanges();
    expect(run).not.toHaveBeenCalled();
    expect(
      fixture.nativeElement.querySelector('.library-order-editor .choice-option button.choice')
        .textContent,
    ).toContain('o2');
    fixture.nativeElement.querySelector('.library-order-editor .choice-actions .confirm').click();
    await fixture.whenStable();
    expect(run).toHaveBeenCalledOnceWith(['o2', 'o1']);
    fixture.destroy();
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
  it('offers manual actions only for the authorised local library', async () => {
    const store = TestBed.inject(MockStore);
    const viewer = store.overrideSelector(selectZoneViewer, {
      open: true,
      zone: 'library',
      playerId: 'p0',
    });
    store.overrideSelector(selectPlayers, [
      makePlayer([], { playerId: 'p0' }),
      makePlayer([], { playerId: 'p1' }),
    ]);
    store.overrideSelector(selectLocalPlayerId, 'p0');
    const game = store.overrideSelector(selectGameState, {
      manualLibraryActionsAllowed: true,
    } as any);
    const fixture = TestBed.createComponent(ZoneViewerComponent);
    expect((await firstValueFrom(fixture.componentInstance.vm$))?.canManualLibrary).toBeTrue();
    viewer.setResult({ open: true, zone: 'library', playerId: 'p1' });
    store.refreshState();
    expect((await firstValueFrom(fixture.componentInstance.vm$))?.canManualLibrary).toBeFalse();
    viewer.setResult({ open: true, zone: 'library', playerId: 'p0' });
    game.setResult({ manualLibraryActionsAllowed: false } as any);
    store.refreshState();
    expect((await firstValueFrom(fixture.componentInstance.vm$))?.canManualLibrary).toBeFalse();
    fixture.destroy();
  });
  it('guards pending actions, closes on completion and keeps retry available after a transport failure', async () => {
    const store = TestBed.inject(MockStore);
    store.overrideSelector(selectZoneViewer, { open: true, zone: 'library', playerId: 'p0' });
    store.overrideSelector(selectPlayers, [makePlayer([], { playerId: 'p0' })]);
    store.overrideSelector(selectLocalPlayerId, 'p0');
    const fixture = TestBed.createComponent(ZoneViewerComponent),
      component = fixture.componentInstance;
    const run = spyOn(TestBed.inject(LibraryActionsService), 'perform');
    const close = spyOn(component, 'close');
    const toast = spyOn(TestBed.inject(ToastService), 'show');
    await component.libraryAction('draw', false);
    expect(run).not.toHaveBeenCalled();
    let finish!: () => void;
    run.and.returnValue(new Promise<void>((resolve) => (finish = resolve)));
    const first = component.libraryAction('draw', true);
    await component.libraryAction('shuffle', true);
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(close).toHaveBeenCalled();
    expect(component.libraryBusy).toBeFalse();
    run.and.rejectWith(new Error('Disconnected'));
    close.calls.reset();
    await component.libraryAction('shuffle', true);
    expect(close).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog [role="status"]')?.textContent).toContain(
      'Library action was not confirmed',
    );
    expect(toast).not.toHaveBeenCalled();
    run.and.resolveTo();
    await component.libraryAction('shuffle', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog [role="status"]')).toBeNull();
    expect(component.libraryBusy).toBeFalse();
    fixture.destroy();
  });
});
