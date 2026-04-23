import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ZonesComponent } from './zones.component';
import { GameActions, UIActions } from '../../store';

describe('ZonesComponent', () => {
  let component: ZonesComponent;
  let fixture: ComponentFixture<ZonesComponent>;
  let store: MockStore;

  function makeDropEvent(cardId: string, isLand: boolean): DragEvent {
    const dt = new DataTransfer();
    dt.setData('cardId', cardId);
    dt.setData('isLand', isLand ? '1' : '0');
    return new DragEvent('drop', { dataTransfer: dt });
  }

  function makeDragOverEvent(): DragEvent {
    const dt = new DataTransfer();
    return new DragEvent('dragover', { dataTransfer: dt, cancelable: true });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZonesComponent],
      providers: [provideMockStore()],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(ZonesComponent);
    component = fixture.componentInstance;
    component.isOpponent = false;
    component.permanents = [];
    component.label = 'Your Battlefield';
    fixture.detectChanges();
  });

  // ---- Initial state ----------------------------------------

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('starts with dropActive = false', () => {
    expect(component.dropActive).toBeFalse();
  });

  // ---- onZoneDragOver ----------------------------------------

  it('sets dropActive when dragging over own zone', () => {
    component.isOpponent = false;
    const event = makeDragOverEvent();
    component.onZoneDragOver(event);

    expect(component.dropActive).toBeTrue();
  });

  it('does not set dropActive when dragging over opponent zone', () => {
    component.isOpponent = true;
    const event = makeDragOverEvent();
    component.onZoneDragOver(event);

    expect(component.dropActive).toBeFalse();
  });

  it('calls preventDefault on dragover for own zone', () => {
    component.isOpponent = false;
    const event = makeDragOverEvent();
    spyOn(event, 'preventDefault');
    component.onZoneDragOver(event);

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('does not call preventDefault on dragover for opponent zone', () => {
    component.isOpponent = true;
    const event = makeDragOverEvent();
    spyOn(event, 'preventDefault');
    component.onZoneDragOver(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  // ---- onZoneDragLeave ----------------------------------------

  it('clears dropActive on dragleave', () => {
    component.dropActive = true;
    component.onZoneDragLeave();

    expect(component.dropActive).toBeFalse();
  });

  // ---- onZoneDrop ----------------------------------------

  it('dispatches playLand when a land card is dropped on own zone', () => {
    spyOn(store, 'dispatch');
    component.isOpponent = false;
    const event = makeDropEvent('land-1', true);

    component.onZoneDrop(event);

    expect(store.dispatch).toHaveBeenCalledWith(GameActions.playLand({ cardId: 'land-1' }));
  });

  it('dispatches castSpell when a non-land card is dropped on own zone', () => {
    spyOn(store, 'dispatch');
    component.isOpponent = false;
    const event = makeDropEvent('spell-1', false);

    component.onZoneDrop(event);

    expect(store.dispatch).toHaveBeenCalledWith(
      GameActions.castSpell({ cardId: 'spell-1', targetIds: [] })
    );
  });

  it('does not dispatch when dropped on opponent zone', () => {
    spyOn(store, 'dispatch');
    component.isOpponent = true;
    const event = makeDropEvent('card-1', false);

    component.onZoneDrop(event);

    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch when dataTransfer has no cardId', () => {
    spyOn(store, 'dispatch');
    component.isOpponent = false;
    const event = new DragEvent('drop', { dataTransfer: new DataTransfer() });

    component.onZoneDrop(event);

    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('clears dropActive after drop', () => {
    component.dropActive = true;
    component.isOpponent = false;
    const event = makeDropEvent('card-1', false);

    component.onZoneDrop(event);

    expect(component.dropActive).toBeFalse();
  });

  it('calls preventDefault on drop', () => {
    component.isOpponent = false;
    const event = makeDropEvent('card-1', false);
    spyOn(event, 'preventDefault');

    component.onZoneDrop(event);

    expect(event.preventDefault).toHaveBeenCalled();
  });

  // ---- onBattlefieldClick ----------------------------------------

  it('dispatches deselectCard when the battlefield background is clicked', () => {
    spyOn(store, 'dispatch');
    component.onBattlefieldClick();

    expect(store.dispatch).toHaveBeenCalledWith(UIActions.deselectCard());
  });
});
