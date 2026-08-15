import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { of } from 'rxjs';
import { CollectionDetailComponent } from './collection-detail.component';
import { GameApiService } from '../../services/game-api.service';
import { PrintingsService } from '../../services/printings.service';
import { CollectionActions } from '../../store/collection/collection.actions';
import { CollectionDetailDto, CollectionCardDto } from '../../models/game.models';

function makeCollectionCard(overrides: Partial<CollectionCardDto> = {}): CollectionCardDto {
  return {
    id: 'card-1',
    oracleId: 'oracle-1',
    scryfallId: 'scry-1',
    quantity: 1,
    quantityFoil: 0,
    notes: null,
    addedAt: '',
    cardDetails: null,
    ...overrides,
  };
}

function makeCollection(cards: CollectionCardDto[] = []): CollectionDetailDto {
  return {
    id: 'col-1',
    name: 'Test',
    description: null,
    coverUri: null,
    createdAt: '',
    updatedAt: '',
    cards,
  };
}

const INITIAL_STATE = {
  collection: { collections: [], activeCollection: makeCollection(), loading: false, error: null },
};

async function setupTestBed() {
  const gameApi = jasmine.createSpyObj<GameApiService>('GameApiService', [
    'searchCards',
    'getSets',
  ]);
  gameApi.searchCards.and.returnValue(of([]));
  gameApi.getSets.and.returnValue(of([]));

  const printings = jasmine.createSpyObj('PrintingsService', ['cached', 'has', 'get']);
  printings.cached.and.returnValue(null);
  printings.has.and.returnValue(false);
  printings.get.and.returnValue(of([]));

  await TestBed.configureTestingModule({
    imports: [CollectionDetailComponent, CommonModule, FormsModule],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      provideMockStore({ initialState: INITIAL_STATE }),
      { provide: GameApiService, useValue: gameApi },
      { provide: PrintingsService, useValue: printings },
      { provide: Router, useValue: { navigate: jasmine.createSpy() } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'col-1' } } } },
    ],
  }).compileComponents();

  return { printings };
}

// ── Search panel toggle ──────────────────────────────────────────────────────

describe('CollectionDetailComponent — search panel', () => {
  let component: CollectionDetailComponent;

  beforeEach(async () => {
    await setupTestBed();
    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('showSearchPanel defaults to false', () => {
    expect(component.showSearchPanel).toBeFalse();
  });

  it('toggleSearchPanel opens the panel', () => {
    component.toggleSearchPanel();
    expect(component.showSearchPanel).toBeTrue();
  });

  it('toggleSearchPanel closes the panel when already open', () => {
    component.showSearchPanel = true;
    component.toggleSearchPanel();
    expect(component.showSearchPanel).toBeFalse();
  });
});

// ── onPanelCardAdd ───────────────────────────────────────────────────────────

describe('CollectionDetailComponent — onPanelCardAdd', () => {
  let component: CollectionDetailComponent;
  let store: MockStore;

  beforeEach(async () => {
    await setupTestBed();
    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(MockStore);
    spyOn(store, 'dispatch');
    fixture.detectChanges();
    (store.dispatch as jasmine.Spy).calls.reset();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('dispatches addCard with quantity 1 and quantityFoil 0 for a normal add', () => {
    component.onPanelCardAdd({ oracleId: 'oracle-x', scryfallId: 'scry-x' });

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.addCard({
        collectionId: 'col-1',
        request: { oracleId: 'oracle-x', scryfallId: 'scry-x', quantity: 1, quantityFoil: 0 },
      }),
    );
  });

  it('dispatches addCard with quantity 0 and quantityFoil 1 for a foil add', () => {
    component.onPanelCardAdd({ oracleId: 'oracle-x', scryfallId: 'scry-x', foil: true });

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.addCard({
        collectionId: 'col-1',
        request: { oracleId: 'oracle-x', scryfallId: 'scry-x', quantity: 0, quantityFoil: 1 },
      }),
    );
  });
});

// ── filteredCards ────────────────────────────────────────────────────────────

describe('CollectionDetailComponent — filteredCards', () => {
  let component: CollectionDetailComponent;

  const CARDS = [
    makeCollectionCard({
      id: 'c1',
      oracleId: 'o1',
      cardDetails: { name: 'Lightning Bolt' } as any,
    }),
    makeCollectionCard({ id: 'c2', oracleId: 'o2', cardDetails: { name: 'Counterspell' } as any }),
    makeCollectionCard({
      id: 'c3',
      oracleId: 'o3',
      cardDetails: { name: 'Lightning Helix' } as any,
    }),
  ];

  beforeEach(async () => {
    await setupTestBed();
    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('returns all cards when filterQuery is empty', () => {
    component.filters.query = '';
    expect(component.filteredCards(makeCollection(CARDS))).toHaveSize(3);
  });

  it('returns matching cards case-insensitively', () => {
    component.filters.query = 'lightning';
    const results = component.filteredCards(makeCollection(CARDS));
    expect(results).toHaveSize(2);
    expect(results.map((c) => c.id)).toContain('c1');
    expect(results.map((c) => c.id)).toContain('c3');
  });

  it('returns empty array when no cards match', () => {
    component.filters.query = 'goblin';
    expect(component.filteredCards(makeCollection(CARDS))).toHaveSize(0);
  });
});

// ── Quantity mutations ───────────────────────────────────────────────────────

describe('CollectionDetailComponent — quantity mutations', () => {
  let component: CollectionDetailComponent;
  let store: MockStore;

  beforeEach(async () => {
    await setupTestBed();
    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(MockStore);
    spyOn(store, 'dispatch');
    fixture.detectChanges();
    (store.dispatch as jasmine.Spy).calls.reset(); // clear ngOnInit loadCollection dispatch
  });

  afterEach(() => TestBed.resetTestingModule());

  it('incrementNormal dispatches updateCard with quantity+1', () => {
    const card = makeCollectionCard({ id: 'c1', quantity: 2, quantityFoil: 0 });
    component.incrementNormal(card);
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({
        collectionId: 'col-1',
        cardId: 'c1',
        request: { quantity: 3, quantityFoil: 0 },
      }),
    );
  });

  it('decrementNormal dispatches updateCard when quantity > 1', () => {
    const card = makeCollectionCard({ id: 'c1', quantity: 3, quantityFoil: 0 });
    component.decrementNormal(card);
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({
        collectionId: 'col-1',
        cardId: 'c1',
        request: { quantity: 2, quantityFoil: 0 },
      }),
    );
  });

  it('decrementNormal dispatches removeCard when quantity is 1 and no foil', () => {
    const card = makeCollectionCard({ id: 'c1', quantity: 1, quantityFoil: 0 });
    component.decrementNormal(card);
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' }),
    );
  });

  it('decrementNormal is a no-op when quantity is 0', () => {
    const card = makeCollectionCard({ id: 'c1', quantity: 0, quantityFoil: 1 });
    component.decrementNormal(card);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('incrementFoil dispatches updateCard with quantityFoil+1', () => {
    const card = makeCollectionCard({ id: 'c1', quantity: 1, quantityFoil: 0 });
    component.incrementFoil(card);
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({
        collectionId: 'col-1',
        cardId: 'c1',
        request: { quantity: 1, quantityFoil: 1 },
      }),
    );
  });

  it('decrementFoil dispatches removeCard when foil is 1 and no normal', () => {
    const card = makeCollectionCard({ id: 'c1', quantity: 0, quantityFoil: 1 });
    component.decrementFoil(card);
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' }),
    );
  });
});

// ── Detail cover picker ──────────────────────────────────────────────────────

describe('CollectionDetailComponent — detail cover picker', () => {
  let component: CollectionDetailComponent;
  let store: MockStore;

  beforeEach(async () => {
    await setupTestBed();
    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(MockStore);
    spyOn(store, 'dispatch');
    fixture.detectChanges();
    (store.dispatch as jasmine.Spy).calls.reset();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('openDetailCoverPicker sets showDetailCoverPicker to true', () => {
    component.openDetailCoverPicker();
    expect(component.showDetailCoverPicker).toBeTrue();
  });

  it('closeDetailCoverPicker sets showDetailCoverPicker to false', () => {
    component.showDetailCoverPicker = true;
    component.closeDetailCoverPicker();
    expect(component.showDetailCoverPicker).toBeFalse();
  });

  it('onDetailCoverSelected dispatches updateCollectionMeta and closes picker', () => {
    const col = makeCollection();
    col.name = 'My Col';
    (col as any).description = 'some desc';
    component.showDetailCoverPicker = true;
    component.onDetailCoverSelected(
      {
        id: 'col-1',
        name: 'My Col',
        description: 'some desc',
        coverUri: null,
        createdAt: '',
        updatedAt: '',
        cards: [],
      },
      'new-art.jpg',
    );
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCollectionMeta({
        id: 'col-1',
        name: 'My Col',
        description: 'some desc',
        coverUri: 'new-art.jpg',
      }),
    );
    expect(component.showDetailCoverPicker).toBeFalse();
  });

  it('onDetailCoverSelected with null removes cover', () => {
    component.onDetailCoverSelected(
      {
        id: 'col-1',
        name: 'My Col',
        description: null,
        coverUri: 'old.jpg',
        createdAt: '',
        updatedAt: '',
        cards: [],
      },
      null,
    );
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCollectionMeta({
        id: 'col-1',
        name: 'My Col',
        description: null,
        coverUri: null,
      }),
    );
  });
});

// ── Tile flip ────────────────────────────────────────────────────────────────

describe('CollectionDetailComponent — tile flip', () => {
  let component: CollectionDetailComponent;

  beforeEach(async () => {
    await setupTestBed();
    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('toggleTileFlip adds card id to flippedCardIds', () => {
    const card = makeCollectionCard({ id: 'c1' });
    component.toggleTileFlip(card, new MouseEvent('click'));
    expect(component.flippedCardIds.has('c1')).toBeTrue();
  });

  it('toggleTileFlip removes card id on second toggle', () => {
    const card = makeCollectionCard({ id: 'c1' });
    component.toggleTileFlip(card, new MouseEvent('click'));
    component.toggleTileFlip(card, new MouseEvent('click'));
    expect(component.flippedCardIds.has('c1')).toBeFalse();
  });

  it('tileImage returns front when not flipped', () => {
    const card = makeCollectionCard({
      id: 'c1',
      cardDetails: { imageUriNormal: 'front.jpg', imageUriNormalBack: 'back.jpg' } as any,
    });
    expect(component.tileImage(card)).toBe('front.jpg');
  });

  it('tileImage returns back when flipped', () => {
    const card = makeCollectionCard({
      id: 'c1',
      cardDetails: { imageUriNormal: 'front.jpg', imageUriNormalBack: 'back.jpg' } as any,
    });
    component.toggleTileFlip(card, new MouseEvent('click'));
    expect(component.tileImage(card)).toBe('back.jpg');
  });
});

// ── Panel decrement / remove helpers ────────────────────────────────────────

function withCards(store: MockStore, cards: CollectionCardDto[]): void {
  store.setState({
    collection: {
      collections: [],
      activeCollection: makeCollection(cards),
      loading: false,
      error: null,
    },
  });
}

describe('CollectionDetailComponent — onPanelDecrementNormal', () => {
  let component: CollectionDetailComponent;
  let store: MockStore;

  beforeEach(async () => {
    await setupTestBed();
    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(MockStore);
    spyOn(store, 'dispatch');
    fixture.detectChanges();
    (store.dispatch as jasmine.Spy).calls.reset();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('dispatches updateCard with quantity-1 when quantity > 1', () => {
    withCards(store, [
      makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 3, quantityFoil: 1 }),
    ]);
    component.onPanelDecrementNormal('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({
        collectionId: 'col-1',
        cardId: 'c1',
        request: { quantity: 2, quantityFoil: 1 },
      }),
    );
  });

  it('dispatches removeCard when normal is 1 and there is no foil', () => {
    withCards(store, [
      makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 1, quantityFoil: 0 }),
    ]);
    component.onPanelDecrementNormal('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' }),
    );
  });

  it('dispatches updateCard (not removeCard) when normal is 1 but foil exists', () => {
    withCards(store, [
      makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 1, quantityFoil: 2 }),
    ]);
    component.onPanelDecrementNormal('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({
        collectionId: 'col-1',
        cardId: 'c1',
        request: { quantity: 0, quantityFoil: 2 },
      }),
    );
  });

  it('is a no-op when quantity is already 0', () => {
    withCards(store, [
      makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 0, quantityFoil: 2 }),
    ]);
    component.onPanelDecrementNormal('oracle-1');
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('is a no-op when oracleId is not in the collection', () => {
    withCards(store, [
      makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 2, quantityFoil: 0 }),
    ]);
    component.onPanelDecrementNormal('oracle-unknown');
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});

describe('CollectionDetailComponent — onPanelDecrementFoil', () => {
  let component: CollectionDetailComponent;
  let store: MockStore;

  beforeEach(async () => {
    await setupTestBed();
    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(MockStore);
    spyOn(store, 'dispatch');
    fixture.detectChanges();
    (store.dispatch as jasmine.Spy).calls.reset();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('dispatches updateCard with quantityFoil-1 when foil > 1', () => {
    withCards(store, [
      makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 2, quantityFoil: 3 }),
    ]);
    component.onPanelDecrementFoil('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({
        collectionId: 'col-1',
        cardId: 'c1',
        request: { quantity: 2, quantityFoil: 2 },
      }),
    );
  });

  it('dispatches removeCard when foil is 1 and there is no normal', () => {
    withCards(store, [
      makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 0, quantityFoil: 1 }),
    ]);
    component.onPanelDecrementFoil('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' }),
    );
  });

  it('dispatches updateCard (not removeCard) when foil is 1 but normal exists', () => {
    withCards(store, [
      makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 2, quantityFoil: 1 }),
    ]);
    component.onPanelDecrementFoil('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({
        collectionId: 'col-1',
        cardId: 'c1',
        request: { quantity: 2, quantityFoil: 0 },
      }),
    );
  });

  it('is a no-op when quantityFoil is already 0', () => {
    withCards(store, [
      makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 2, quantityFoil: 0 }),
    ]);
    component.onPanelDecrementFoil('oracle-1');
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});

describe('CollectionDetailComponent — onPanelCardRemove', () => {
  let component: CollectionDetailComponent;
  let store: MockStore;

  beforeEach(async () => {
    await setupTestBed();
    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(MockStore);
    spyOn(store, 'dispatch');
    fixture.detectChanges();
    (store.dispatch as jasmine.Spy).calls.reset();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('dispatches removeCard for the matching oracleId', () => {
    withCards(store, [
      makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 2, quantityFoil: 1 }),
    ]);
    component.onPanelCardRemove('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' }),
    );
  });

  it('is a no-op when oracleId is not in the collection', () => {
    withCards(store, [makeCollectionCard({ id: 'c1', oracleId: 'oracle-1' })]);
    component.onPanelCardRemove('oracle-not-there');
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});

// ── Modal quantity controls ──────────────────────────────────────────────────

describe('CollectionDetailComponent — modalDecrementNormal', () => {
  let component: CollectionDetailComponent;
  let store: MockStore;

  beforeEach(async () => {
    await setupTestBed();
    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(MockStore);
    spyOn(store, 'dispatch');
    fixture.detectChanges();
    (store.dispatch as jasmine.Spy).calls.reset();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('dispatches updateCard with quantity-1 (not removeCard) when copies remain', () => {
    const card = makeCollectionCard({
      id: 'c1',
      scryfallId: 'scry-1',
      quantity: 3,
      quantityFoil: 0,
    });
    const col = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementNormal(col, card);

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({
        collectionId: 'col-1',
        cardId: 'c1',
        request: { quantity: 2, quantityFoil: 0 },
      }),
    );
  });

  it('dispatches removeCard only when the last copy of any kind is removed', () => {
    const card = makeCollectionCard({
      id: 'c1',
      scryfallId: 'scry-1',
      quantity: 1,
      quantityFoil: 0,
    });
    const col = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementNormal(col, card);

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' }),
    );
  });

  it('dispatches updateCard to zero when foil copies still exist', () => {
    const card = makeCollectionCard({
      id: 'c1',
      scryfallId: 'scry-1',
      quantity: 1,
      quantityFoil: 2,
    });
    const col = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementNormal(col, card);

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({
        collectionId: 'col-1',
        cardId: 'c1',
        request: { quantity: 0, quantityFoil: 2 },
      }),
    );
  });

  it('is a no-op when quantity is already 0', () => {
    const card = makeCollectionCard({
      id: 'c1',
      scryfallId: 'scry-1',
      quantity: 0,
      quantityFoil: 1,
    });
    const col = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementNormal(col, card);

    expect(store.dispatch).not.toHaveBeenCalled();
  });
});

describe('CollectionDetailComponent — modalDecrementFoil', () => {
  let component: CollectionDetailComponent;
  let store: MockStore;

  beforeEach(async () => {
    await setupTestBed();
    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(MockStore);
    spyOn(store, 'dispatch');
    fixture.detectChanges();
    (store.dispatch as jasmine.Spy).calls.reset();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('dispatches updateCard with quantityFoil-1 (not removeCard) when foil copies remain', () => {
    const card = makeCollectionCard({
      id: 'c1',
      scryfallId: 'scry-1',
      quantity: 1,
      quantityFoil: 3,
    });
    const col = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementFoil(col, card);

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({
        collectionId: 'col-1',
        cardId: 'c1',
        request: { quantity: 1, quantityFoil: 2 },
      }),
    );
  });

  it('dispatches removeCard only when the last foil and no normal remain', () => {
    const card = makeCollectionCard({
      id: 'c1',
      scryfallId: 'scry-1',
      quantity: 0,
      quantityFoil: 1,
    });
    const col = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementFoil(col, card);

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' }),
    );
  });

  it('dispatches updateCard to zero when normal copies still exist', () => {
    const card = makeCollectionCard({
      id: 'c1',
      scryfallId: 'scry-1',
      quantity: 2,
      quantityFoil: 1,
    });
    const col = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementFoil(col, card);

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({
        collectionId: 'col-1',
        cardId: 'c1',
        request: { quantity: 2, quantityFoil: 0 },
      }),
    );
  });

  it('is a no-op when quantityFoil is already 0', () => {
    const card = makeCollectionCard({
      id: 'c1',
      scryfallId: 'scry-1',
      quantity: 2,
      quantityFoil: 0,
    });
    const col = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementFoil(col, card);

    expect(store.dispatch).not.toHaveBeenCalled();
  });

  // ---- viewedEntry ----------------------------------------------

  it('viewedEntry finds the row that pins the printing on screen', () => {
    const pinned = makeCollectionCard({ id: 'a', scryfallId: 'scry-2', quantity: 3 });
    const col = makeCollection([makeCollectionCard({ id: 'b', scryfallId: 'scry-1' }), pinned]);
    component.modalViewScryfallId = 'scry-2';

    expect(component.viewedEntry(col, pinned)?.id).toBe('a');
  });

  it('viewedEntry falls back to an unpinned row when no row pins the viewed printing', () => {
    // The regression: an unpinned row means "owned, printing unspecified", but the modal
    // always views a concrete printing, so matching on printing alone found nothing and
    // a card the grid showed as owned opened with a count of zero.
    const unpinned = makeCollectionCard({ id: 'u', scryfallId: null, quantity: 1 });
    const col = makeCollection([unpinned]);
    component.modalViewScryfallId = 'scry-newest';

    const found = component.viewedEntry(col, unpinned);
    expect(found?.id).toBe('u');
    expect(found?.quantity).toBe(1);
  });

  it('viewedEntry prefers the pinned row over the unpinned one for the same card', () => {
    const unpinned = makeCollectionCard({ id: 'u', scryfallId: null, quantity: 1 });
    const pinned = makeCollectionCard({ id: 'p', scryfallId: 'scry-9', quantity: 4 });
    const col = makeCollection([unpinned, pinned]);
    component.modalViewScryfallId = 'scry-9';

    expect(component.viewedEntry(col, pinned)?.id).toBe('p');
  });

  it('viewedEntry does not fall back to another row once any printing is pinned', () => {
    // Switching the modal to a printing you do not own must resolve to no row, so the
    // + button adds that printing. Falling through to the row you already had made it
    // increment the wrong printing — "it adds the default instead of the one I picked".
    const owned = makeCollectionCard({ id: 'p', scryfallId: 'scry-owned', quantity: 1 });
    const col = makeCollection([owned]);
    component.modalViewScryfallId = 'scry-other';

    expect(component.viewedEntry(col, owned)).toBeNull();
  });

  // ---- grouping the same card across sets -------------------------

  function groupedCollection(): CollectionDetailDto {
    return makeCollection([
      makeCollectionCard({ id: 'r1', scryfallId: 'scry-a', quantity: 1, cardDetails: null }),
      makeCollectionCard({ id: 'r2', scryfallId: 'scry-b', quantity: 2, quantityFoil: 1 }),
    ]);
  }

  it('groups copies of one card from different sets into a single tile', () => {
    const col = groupedCollection();
    expect(component.filteredCards(col).length).toBe(2);

    component.toggleGroupSameCard();
    const grouped = component.filteredCards(col);
    expect(grouped.length).toBe(1);
    expect(grouped[0].quantity).toBe(3);
    expect(grouped[0].quantityFoil).toBe(1);
  });

  it('offers every owned printing in the grouped picker, not just the displayed one', () => {
    const col = groupedCollection();
    component.toggleGroupSameCard();
    component.filteredCards(col); // builds the group members the picker reads

    const opts = component.printingOptions(col.cards[0]);
    expect(opts.length).toBe(2);
    expect(opts.map((o) => o.value)).toEqual(['r1', 'r2']);
    // Keyed by row, so a row that pins no printing still gets an entry.
    expect(component.singlePrintingLabel(col.cards[0])).toBeNull();
  });

  it('includes a row that pins no printing among the grouped choices', () => {
    const col = makeCollection([
      makeCollectionCard({ id: 'r1', scryfallId: 'scry-a', quantity: 1 }),
      makeCollectionCard({ id: 'r2', scryfallId: null, quantity: 1 }),
    ]);
    component.toggleGroupSameCard();
    component.filteredCards(col);

    expect(component.printingOptions(col.cards[0]).map((o) => o.value)).toEqual(['r1', 'r2']);
  });

  it('shows plain text instead of a picker when only one printing is owned', () => {
    const col = makeCollection([makeCollectionCard({ id: 'r1', scryfallId: 'scry-a' })]);
    component.toggleGroupSameCard();
    component.filteredCards(col);

    expect(component.singlePrintingLabel(col.cards[0])).not.toBeNull();
  });

  it('switching the grouped picker changes the shown printing without touching the data', () => {
    const col = groupedCollection();
    component.toggleGroupSameCard();
    expect(component.filteredCards(col)[0].id).toBe('r1');

    (store.dispatch as jasmine.Spy).calls.reset();
    component.onSetChange(col.cards[0], 'r2');

    expect(store.dispatch).not.toHaveBeenCalled();
    expect(component.filteredCards(col)[0].id).toBe('r2');
    // Totals stay the group's, whichever member is on display.
    expect(component.filteredCards(col)[0].quantity).toBe(3);
  });

  it('reports the group total to the modal badges', () => {
    const col = groupedCollection();
    component.toggleGroupSameCard();
    component.filteredCards(col);

    expect(component.modalCount(col, col.cards[0])).toBe(3);
    expect(component.modalFoilCount(col, col.cards[0])).toBe(1);
  });

  it('viewedEntry returns null for a card that is not in the collection', () => {
    const col = makeCollection([makeCollectionCard({ oracleId: 'other', scryfallId: null })]);
    component.modalViewScryfallId = 'scry-1';

    expect(component.viewedEntry(col, makeCollectionCard())).toBeNull();
  });

  it('viewedEntry re-resolves when the viewed printing changes', () => {
    const a = makeCollectionCard({ id: 'a', scryfallId: 'scry-1' });
    const b = makeCollectionCard({ id: 'b', scryfallId: 'scry-2' });
    const col = makeCollection([a, b]);

    component.modalViewScryfallId = 'scry-1';
    expect(component.viewedEntry(col, a)?.id).toBe('a');
    // Memoized on the printing, so switching must not serve the stale row.
    component.modalViewScryfallId = 'scry-2';
    expect(component.viewedEntry(col, a)?.id).toBe('b');
  });
});
