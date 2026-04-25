import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { DeckListComponent } from './deck-list.component';
import { DeckActions } from '../../store/deck/deck.actions';
import { DeckDto } from '../../services/deck-api.service';

function makeDeck(overrides: Partial<DeckDto> = {}): DeckDto {
  return {
    id: 'deck-1', name: 'My Deck',
    coverUri: null, cardCount: 5,
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
    ...overrides,
  };
}

const INITIAL_STATE = {
  deck: { decks: [], activeDeck: null, loading: false, error: null },
};

async function setup() {
  await TestBed.configureTestingModule({
    imports: [DeckListComponent, ReactiveFormsModule],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      provideMockStore({ initialState: INITIAL_STATE }),
      { provide: Router, useValue: { navigate: jasmine.createSpy() } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(DeckListComponent);
  const component = fixture.componentInstance;
  const store = TestBed.inject(MockStore);
  spyOn(store, 'dispatch');
  fixture.detectChanges();
  (store.dispatch as jasmine.Spy).calls.reset();
  return { component, fixture, store };
}

// ── 3-dot menu ───────────────────────────────────────────────────────────────

describe('DeckListComponent — 3-dot menu', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('toggleMenu opens menu for given id', async () => {
    const { component } = await setup();
    component.toggleMenu(new MouseEvent('click'), 'deck-1');
    expect(component.menuDeckId).toBe('deck-1');
  });

  it('toggleMenu closes menu when same id is toggled again', async () => {
    const { component } = await setup();
    component.menuDeckId = 'deck-1';
    component.toggleMenu(new MouseEvent('click'), 'deck-1');
    expect(component.menuDeckId).toBeNull();
  });

  it('closeMenu clears menuDeckId', async () => {
    const { component } = await setup();
    component.menuDeckId = 'deck-1';
    component.closeMenu();
    expect(component.menuDeckId).toBeNull();
  });
});

// ── Inline rename ────────────────────────────────────────────────────────────

describe('DeckListComponent — inline rename', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('startRename sets renamingDeckId, renameDraft and clears menu', async () => {
    const { component } = await setup();
    const deck = makeDeck({ id: 'deck-1', name: 'Old Name' });
    component.menuDeckId = 'deck-1';
    component.startRename(new MouseEvent('click'), deck);
    expect(component.renamingDeckId).toBe('deck-1');
    expect(component.renameDraft).toBe('Old Name');
    expect(component.menuDeckId).toBeNull();
  });

  it('commitRename dispatches updateDeckMeta when name changed', async () => {
    const { component, store } = await setup();
    const deck = makeDeck({ id: 'deck-1', name: 'Old Name', coverUri: 'cover.jpg' });
    component.renamingDeckId = 'deck-1';
    component.renameDraft = 'New Name';
    component.commitRename(deck);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateDeckMeta({ id: 'deck-1', name: 'New Name', coverUri: 'cover.jpg' })
    );
    expect(component.renamingDeckId).toBeNull();
  });

  it('commitRename does not dispatch when name is unchanged', async () => {
    const { component, store } = await setup();
    const deck = makeDeck({ id: 'deck-1', name: 'Same' });
    component.renameDraft = 'Same';
    component.commitRename(deck);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('commitRename does not dispatch when renameDraft is blank', async () => {
    const { component, store } = await setup();
    const deck = makeDeck({ id: 'deck-1', name: 'Something' });
    component.renameDraft = '   ';
    component.commitRename(deck);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('cancelRename clears renamingDeckId', async () => {
    const { component } = await setup();
    component.renamingDeckId = 'deck-1';
    component.cancelRename();
    expect(component.renamingDeckId).toBeNull();
  });
});

// ── Cover picker ─────────────────────────────────────────────────────────────

describe('DeckListComponent — cover picker', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('openCoverPicker sets coverPickerDeck and clears menu', async () => {
    const { component } = await setup();
    const deck = makeDeck({ id: 'deck-1' });
    component.menuDeckId = 'deck-1';
    component.openCoverPicker(new MouseEvent('click'), deck);
    expect(component.coverPickerDeck).toEqual(deck);
    expect(component.menuDeckId).toBeNull();
  });

  it('closeCoverPicker clears coverPickerDeck', async () => {
    const { component } = await setup();
    component.coverPickerDeck = makeDeck();
    component.closeCoverPicker();
    expect(component.coverPickerDeck).toBeNull();
  });

  it('onCoverSelected dispatches updateDeckMeta with new uri', async () => {
    const { component, store } = await setup();
    const deck = makeDeck({ id: 'deck-2', name: 'Burn', coverUri: null });
    component.onCoverSelected(deck, 'art.jpg');
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateDeckMeta({ id: 'deck-2', name: 'Burn', coverUri: 'art.jpg' })
    );
    expect(component.coverPickerDeck).toBeNull();
  });

  it('onCoverSelected with null removes cover', async () => {
    const { component, store } = await setup();
    const deck = makeDeck({ id: 'deck-2', name: 'Burn', coverUri: 'old.jpg' });
    component.onCoverSelected(deck, null);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateDeckMeta({ id: 'deck-2', name: 'Burn', coverUri: null })
    );
  });
});

// ── Delete / create ──────────────────────────────────────────────────────────

describe('DeckListComponent — delete and create', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('deleteDeck dispatches deleteDeck action', async () => {
    const { component, store } = await setup();
    component.deleteDeck(new MouseEvent('click'), 'deck-1');
    expect(store.dispatch).toHaveBeenCalledWith(DeckActions.deleteDeck({ id: 'deck-1' }));
  });

  it('submitCreate dispatches createDeck with trimmed name', async () => {
    const { component, store } = await setup();
    component.createForm.setValue({ name: '  Aggro  ' });
    component.submitCreate();
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.createDeck({ name: 'Aggro', coverUri: null })
    );
    expect(component.showCreateForm).toBeFalse();
  });

  it('submitCreate does not dispatch when form is invalid', async () => {
    const { component, store } = await setup();
    component.createForm.setValue({ name: '' });
    component.submitCreate();
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});
