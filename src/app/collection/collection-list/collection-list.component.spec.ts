import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { CollectionListComponent } from './collection-list.component';
import { CollectionActions } from '../../store/collection/collection.actions';
import { CollectionDto } from '../../models/game.models';

function makeCol(overrides: Partial<CollectionDto> = {}): CollectionDto {
  return {
    id: 'col-1', name: 'My Collection',
    description: null, coverUri: null, cardCount: 3,
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
    ...overrides,
  };
}

const INITIAL_STATE = {
  collection: { collections: [], activeCollection: null, loading: false, error: null },
};

async function setup() {
  await TestBed.configureTestingModule({
    imports: [CollectionListComponent, ReactiveFormsModule],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      provideMockStore({ initialState: INITIAL_STATE }),
      { provide: Router, useValue: { navigate: jasmine.createSpy() } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(CollectionListComponent);
  const component = fixture.componentInstance;
  const store = TestBed.inject(MockStore);
  spyOn(store, 'dispatch');
  fixture.detectChanges();
  (store.dispatch as jasmine.Spy).calls.reset();
  return { component, fixture, store };
}

// ── 3-dot menu ───────────────────────────────────────────────────────────────

describe('CollectionListComponent — 3-dot menu', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('toggleMenu opens menu for given id', async () => {
    const { component } = await setup();
    component.toggleMenu(new MouseEvent('click'), 'col-1');
    expect(component.menuColId).toBe('col-1');
  });

  it('toggleMenu closes menu when already open for same id', async () => {
    const { component } = await setup();
    component.menuColId = 'col-1';
    component.toggleMenu(new MouseEvent('click'), 'col-1');
    expect(component.menuColId).toBeNull();
  });

  it('toggleMenu switches to new id when a different menu is open', async () => {
    const { component } = await setup();
    component.menuColId = 'col-1';
    component.toggleMenu(new MouseEvent('click'), 'col-2');
    expect(component.menuColId).toBe('col-2');
  });

  it('closeMenu clears menuColId', async () => {
    const { component } = await setup();
    component.menuColId = 'col-1';
    component.closeMenu();
    expect(component.menuColId).toBeNull();
  });
});

// ── Inline rename ────────────────────────────────────────────────────────────

describe('CollectionListComponent — inline rename', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('startRename sets renamingColId and renameDraft, clears menu', async () => {
    const { component } = await setup();
    component.menuColId = 'col-1';
    const col = makeCol({ id: 'col-1', name: 'Deck Box' });
    component.startRename(new MouseEvent('click'), col);
    expect(component.renamingColId).toBe('col-1');
    expect(component.renameDraft).toBe('Deck Box');
    expect(component.menuColId).toBeNull();
  });

  it('commitRename dispatches updateCollectionMeta when name changed', async () => {
    const { component, store } = await setup();
    const col = makeCol({ id: 'col-1', name: 'Old Name', description: 'desc', coverUri: 'cover.jpg' });
    component.renamingColId = 'col-1';
    component.renameDraft = 'New Name';
    component.commitRename(col);
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCollectionMeta({
        id: 'col-1', name: 'New Name', description: 'desc', coverUri: 'cover.jpg',
      })
    );
    expect(component.renamingColId).toBeNull();
  });

  it('commitRename does not dispatch when name is unchanged', async () => {
    const { component, store } = await setup();
    const col = makeCol({ id: 'col-1', name: 'Same Name' });
    component.renamingColId = 'col-1';
    component.renameDraft = 'Same Name';
    component.commitRename(col);
    expect(store.dispatch).not.toHaveBeenCalled();
    expect(component.renamingColId).toBeNull();
  });

  it('commitRename does not dispatch when renameDraft is blank', async () => {
    const { component, store } = await setup();
    const col = makeCol({ id: 'col-1', name: 'Something' });
    component.renamingColId = 'col-1';
    component.renameDraft = '   ';
    component.commitRename(col);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('cancelRename clears renamingColId', async () => {
    const { component } = await setup();
    component.renamingColId = 'col-1';
    component.cancelRename();
    expect(component.renamingColId).toBeNull();
  });
});

// ── Cover picker ─────────────────────────────────────────────────────────────

describe('CollectionListComponent — cover picker', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('openCoverPicker sets coverPickerCol and clears menu', async () => {
    const { component } = await setup();
    const col = makeCol({ id: 'col-1' });
    component.menuColId = 'col-1';
    component.openCoverPicker(new MouseEvent('click'), col);
    expect(component.coverPickerCol).toEqual(col);
    expect(component.menuColId).toBeNull();
  });

  it('closeCoverPicker clears coverPickerCol', async () => {
    const { component } = await setup();
    component.coverPickerCol = makeCol();
    component.closeCoverPicker();
    expect(component.coverPickerCol).toBeNull();
  });

  it('onCoverSelected dispatches updateCollectionMeta with new uri', async () => {
    const { component, store } = await setup();
    const col = makeCol({ id: 'col-2', name: 'Art Deck', description: 'notes', coverUri: null });
    component.coverPickerCol = col;
    component.onCoverSelected(col, 'new-cover.jpg');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCollectionMeta({
        id: 'col-2', name: 'Art Deck', description: 'notes', coverUri: 'new-cover.jpg',
      })
    );
    expect(component.coverPickerCol).toBeNull();
  });

  it('onCoverSelected with null uri removes cover', async () => {
    const { component, store } = await setup();
    const col = makeCol({ id: 'col-2', name: 'Art Deck', description: null, coverUri: 'old.jpg' });
    component.onCoverSelected(col, null);
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCollectionMeta({
        id: 'col-2', name: 'Art Deck', description: null, coverUri: null,
      })
    );
  });
});

// ── Delete / create ──────────────────────────────────────────────────────────

describe('CollectionListComponent — delete and create', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('deleteCollection dispatches deleteCollection action', async () => {
    const { component, store } = await setup();
    component.deleteCollection(new MouseEvent('click'), 'col-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.deleteCollection({ id: 'col-1' })
    );
  });

  it('submitCreate dispatches createCollection with trimmed name', async () => {
    const { component, store } = await setup();
    component.createForm.setValue({ name: '  My Deck  ', description: 'notes' });
    component.submitCreate();
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.createCollection({
        request: { name: 'My Deck', description: 'notes' },
      })
    );
    expect(component.showCreateForm).toBeFalse();
  });

  it('submitCreate does not dispatch when form is invalid', async () => {
    const { component, store } = await setup();
    component.createForm.setValue({ name: '', description: '' });
    component.submitCreate();
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});
