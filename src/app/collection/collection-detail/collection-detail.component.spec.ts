import { TestBed, fakeAsync } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { of } from 'rxjs';
import { CollectionDetailComponent } from './collection-detail.component';
import { GameApiService } from '../../services/game-api.service';
import { CollectionApiService } from '../../services/collection-api.service';
import { CollectionActions } from '../../store/collection/collection.actions';
import { CollectionDetailDto, CollectionCardDto } from '../../models/game.models';

function makeCollectionCard(overrides: Partial<CollectionCardDto> = {}): CollectionCardDto {
  return {
    id: 'card-1', oracleId: 'oracle-1', scryfallId: 'scry-1',
    quantity: 1, quantityFoil: 0, notes: null, addedAt: '', cardDetails: null,
    ...overrides,
  };
}

function makeCollection(cards: CollectionCardDto[] = []): CollectionDetailDto {
  return { id: 'col-1', name: 'Test', description: null, coverUri: null, createdAt: '', updatedAt: '', cards };
}

const INITIAL_STATE = {
  collection: { collections: [], activeCollection: makeCollection(), loading: false, error: null },
};

async function setupTestBed() {
  const gameApi = jasmine.createSpyObj<GameApiService>('GameApiService', ['searchCards', 'getSets']);
  gameApi.searchCards.and.returnValue(of([]));
  gameApi.getSets.and.returnValue(of([]));

  const collectionApi = jasmine.createSpyObj('CollectionApiService', ['getPrintings']);
  collectionApi.getPrintings.and.returnValue(of([]));

  await TestBed.configureTestingModule({
    imports: [CollectionDetailComponent, CommonModule, FormsModule],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      provideMockStore({ initialState: INITIAL_STATE }),
      { provide: GameApiService,       useValue: gameApi },
      { provide: CollectionApiService, useValue: collectionApi },
      { provide: Router,               useValue: { navigate: jasmine.createSpy() } },
      { provide: ActivatedRoute,       useValue: { snapshot: { paramMap: { get: () => 'col-1' } } } },
    ],
  }).compileComponents();

  return { collectionApi };
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
      })
    );
  });

  it('dispatches addCard with quantity 0 and quantityFoil 1 for a foil add', () => {
    component.onPanelCardAdd({ oracleId: 'oracle-x', scryfallId: 'scry-x', foil: true });

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.addCard({
        collectionId: 'col-1',
        request: { oracleId: 'oracle-x', scryfallId: 'scry-x', quantity: 0, quantityFoil: 1 },
      })
    );
  });
});

// ── filteredCards ────────────────────────────────────────────────────────────

describe('CollectionDetailComponent — filteredCards', () => {
  let component: CollectionDetailComponent;

  const CARDS = [
    makeCollectionCard({ id: 'c1', oracleId: 'o1', cardDetails: { name: 'Lightning Bolt' } as any }),
    makeCollectionCard({ id: 'c2', oracleId: 'o2', cardDetails: { name: 'Counterspell' } as any }),
    makeCollectionCard({ id: 'c3', oracleId: 'o3', cardDetails: { name: 'Lightning Helix' } as any }),
  ];

  beforeEach(async () => {
    await setupTestBed();
    const fixture = TestBed.createComponent(CollectionDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('returns all cards when filterQuery is empty', () => {
    component.filterQuery = '';
    expect(component.filteredCards(makeCollection(CARDS))).toHaveSize(3);
  });

  it('returns matching cards case-insensitively', () => {
    component.filterQuery = 'lightning';
    const results = component.filteredCards(makeCollection(CARDS));
    expect(results).toHaveSize(2);
    expect(results.map(c => c.id)).toContain('c1');
    expect(results.map(c => c.id)).toContain('c3');
  });

  it('returns empty array when no cards match', () => {
    component.filterQuery = 'goblin';
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
        collectionId: 'col-1', cardId: 'c1',
        request: { quantity: 3, quantityFoil: 0 },
      })
    );
  });

  it('decrementNormal dispatches updateCard when quantity > 1', () => {
    const card = makeCollectionCard({ id: 'c1', quantity: 3, quantityFoil: 0 });
    component.decrementNormal(card);
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({
        collectionId: 'col-1', cardId: 'c1',
        request: { quantity: 2, quantityFoil: 0 },
      })
    );
  });

  it('decrementNormal dispatches removeCard when quantity is 1 and no foil', () => {
    const card = makeCollectionCard({ id: 'c1', quantity: 1, quantityFoil: 0 });
    component.decrementNormal(card);
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' })
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
        collectionId: 'col-1', cardId: 'c1',
        request: { quantity: 1, quantityFoil: 1 },
      })
    );
  });

  it('decrementFoil dispatches removeCard when foil is 1 and no normal', () => {
    const card = makeCollectionCard({ id: 'c1', quantity: 0, quantityFoil: 1 });
    component.decrementFoil(card);
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' })
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
      { id: 'col-1', name: 'My Col', description: 'some desc', coverUri: null, createdAt: '', updatedAt: '', cards: [] },
      'new-art.jpg',
    );
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCollectionMeta({
        id: 'col-1', name: 'My Col', description: 'some desc', coverUri: 'new-art.jpg',
      })
    );
    expect(component.showDetailCoverPicker).toBeFalse();
  });

  it('onDetailCoverSelected with null removes cover', () => {
    component.onDetailCoverSelected(
      { id: 'col-1', name: 'My Col', description: null, coverUri: 'old.jpg', createdAt: '', updatedAt: '', cards: [] },
      null,
    );
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCollectionMeta({
        id: 'col-1', name: 'My Col', description: null, coverUri: null,
      })
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
    collection: { collections: [], activeCollection: makeCollection(cards), loading: false, error: null },
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
    withCards(store, [makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 3, quantityFoil: 1 })]);
    component.onPanelDecrementNormal('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({ collectionId: 'col-1', cardId: 'c1', request: { quantity: 2, quantityFoil: 1 } })
    );
  });

  it('dispatches removeCard when normal is 1 and there is no foil', () => {
    withCards(store, [makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 1, quantityFoil: 0 })]);
    component.onPanelDecrementNormal('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' })
    );
  });

  it('dispatches updateCard (not removeCard) when normal is 1 but foil exists', () => {
    withCards(store, [makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 1, quantityFoil: 2 })]);
    component.onPanelDecrementNormal('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({ collectionId: 'col-1', cardId: 'c1', request: { quantity: 0, quantityFoil: 2 } })
    );
  });

  it('is a no-op when quantity is already 0', () => {
    withCards(store, [makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 0, quantityFoil: 2 })]);
    component.onPanelDecrementNormal('oracle-1');
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('is a no-op when oracleId is not in the collection', () => {
    withCards(store, [makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 2, quantityFoil: 0 })]);
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
    withCards(store, [makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 2, quantityFoil: 3 })]);
    component.onPanelDecrementFoil('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({ collectionId: 'col-1', cardId: 'c1', request: { quantity: 2, quantityFoil: 2 } })
    );
  });

  it('dispatches removeCard when foil is 1 and there is no normal', () => {
    withCards(store, [makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 0, quantityFoil: 1 })]);
    component.onPanelDecrementFoil('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' })
    );
  });

  it('dispatches updateCard (not removeCard) when foil is 1 but normal exists', () => {
    withCards(store, [makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 2, quantityFoil: 1 })]);
    component.onPanelDecrementFoil('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({ collectionId: 'col-1', cardId: 'c1', request: { quantity: 2, quantityFoil: 0 } })
    );
  });

  it('is a no-op when quantityFoil is already 0', () => {
    withCards(store, [makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 2, quantityFoil: 0 })]);
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
    withCards(store, [makeCollectionCard({ id: 'c1', oracleId: 'oracle-1', quantity: 2, quantityFoil: 1 })]);
    component.onPanelCardRemove('oracle-1');
    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' })
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
    const card = makeCollectionCard({ id: 'c1', scryfallId: 'scry-1', quantity: 3, quantityFoil: 0 });
    const col  = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementNormal(col, card);

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({ collectionId: 'col-1', cardId: 'c1', request: { quantity: 2, quantityFoil: 0 } })
    );
  });

  it('dispatches removeCard only when the last copy of any kind is removed', () => {
    const card = makeCollectionCard({ id: 'c1', scryfallId: 'scry-1', quantity: 1, quantityFoil: 0 });
    const col  = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementNormal(col, card);

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' })
    );
  });

  it('dispatches updateCard to zero when foil copies still exist', () => {
    const card = makeCollectionCard({ id: 'c1', scryfallId: 'scry-1', quantity: 1, quantityFoil: 2 });
    const col  = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementNormal(col, card);

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({ collectionId: 'col-1', cardId: 'c1', request: { quantity: 0, quantityFoil: 2 } })
    );
  });

  it('is a no-op when quantity is already 0', () => {
    const card = makeCollectionCard({ id: 'c1', scryfallId: 'scry-1', quantity: 0, quantityFoil: 1 });
    const col  = makeCollection([card]);
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
    const card = makeCollectionCard({ id: 'c1', scryfallId: 'scry-1', quantity: 1, quantityFoil: 3 });
    const col  = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementFoil(col, card);

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({ collectionId: 'col-1', cardId: 'c1', request: { quantity: 1, quantityFoil: 2 } })
    );
  });

  it('dispatches removeCard only when the last foil and no normal remain', () => {
    const card = makeCollectionCard({ id: 'c1', scryfallId: 'scry-1', quantity: 0, quantityFoil: 1 });
    const col  = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementFoil(col, card);

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.removeCard({ collectionId: 'col-1', cardId: 'c1' })
    );
  });

  it('dispatches updateCard to zero when normal copies still exist', () => {
    const card = makeCollectionCard({ id: 'c1', scryfallId: 'scry-1', quantity: 2, quantityFoil: 1 });
    const col  = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementFoil(col, card);

    expect(store.dispatch).toHaveBeenCalledWith(
      CollectionActions.updateCard({ collectionId: 'col-1', cardId: 'c1', request: { quantity: 2, quantityFoil: 0 } })
    );
  });

  it('is a no-op when quantityFoil is already 0', () => {
    const card = makeCollectionCard({ id: 'c1', scryfallId: 'scry-1', quantity: 2, quantityFoil: 0 });
    const col  = makeCollection([card]);
    component.modalViewScryfallId = 'scry-1';

    component.modalDecrementFoil(col, card);

    expect(store.dispatch).not.toHaveBeenCalled();
  });
});
