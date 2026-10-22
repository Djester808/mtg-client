import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { Store } from '@ngrx/store';
import { TableSeatComponent } from './table-seat.component';
import { ManualControlsService } from './manual-controls.service';
import { ToastService } from '../services/toast.service';
import { AppState, UIActions } from '../store';
import { makePlayer } from '../testing/test-factories';

describe('TableSeatComponent', () => {
  let component: TableSeatComponent;
  let dispatch: jasmine.Spy;
  let manual: jasmine.SpyObj<ManualControlsService>;
  let toasts: jasmine.SpyObj<ToastService>;
  beforeEach(() => {
    dispatch = jasmine.createSpy('dispatch');
    manual = jasmine.createSpyObj('ManualControlsService', ['life']);
    toasts = jasmine.createSpyObj('ToastService', ['show']);
    component = TestBed.runInInjectionContext(
      () =>
        new TableSeatComponent(
          { dispatch } as unknown as Store<AppState>,
          { markForCheck: () => undefined } as ChangeDetectorRef,
          manual,
          toasts,
        ),
    );
    component.player = makePlayer();
  });
  it('shows only available mana and preserves commander damage names', () => {
    component.player = makePlayer([], {
      manaPool: { amounts: { G: 3, R: 0 }, total: 3 },
      commanderDamage: { Atraxa: 7 },
    });
    component.ngOnChanges();
    expect(component.mana).toEqual([{ color: 'G', count: 3 }]);
    expect(component.damage).toEqual([{ name: 'Atraxa', count: 7 }]);
    expect(component.trackName(0, component.damage[0])).toBe('Atraxa');
    expect(component.trackMana(0, component.mana[0])).toBe('G');
  });
  it('prioritizes selecting a player target over changing table focus', () => {
    const target = spyOn(component.targetPlayer, 'emit');
    const focus = spyOn(component.focusSeat, 'emit');
    component.tableMode = true;
    component.targeting = true;
    component.nameClick();
    expect(target).toHaveBeenCalledOnceWith(component.player.playerId);
    expect(focus).not.toHaveBeenCalled();
    component.targeting = false;
    component.nameClick();
    expect(focus).toHaveBeenCalledTimes(1);
  });
  it('opens player details outside table mode and closes them', () => {
    component.nameClick();
    expect(component.detailsOpen).toBeTrue();
    component.closeDetails();
    expect(component.detailsOpen).toBeFalse();
  });
  it('opens the requested zone for the displayed player', () => {
    component.zone('graveyard');
    expect(dispatch).toHaveBeenCalledOnceWith(
      UIActions.openZoneViewer({
        playerId: component.player.playerId,
        zone: 'graveyard',
      }),
    );
  });
  it('keeps life controls pending until the game command completes', async () => {
    let finish!: () => void;
    manual.life.and.returnValue(new Promise<void>((resolve) => (finish = resolve)));
    const pending = component.life(-1);
    expect(component.lifePending).toBeTrue();
    expect(manual.life).toHaveBeenCalledOnceWith(component.player, -1);
    finish();
    await pending;
    expect(component.lifePending).toBeFalse();
    expect(toasts.show).not.toHaveBeenCalled();
  });
  it('reports a failed life command and releases the controls', async () => {
    manual.life.and.returnValue(Promise.reject(new Error('offline')));
    await component.life(1);
    expect(component.lifePending).toBeFalse();
    expect(toasts.show).toHaveBeenCalledWith('Life could not be changed. Try again.', 'warn', 3000);
  });
});
