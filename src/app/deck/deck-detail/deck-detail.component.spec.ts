import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { of } from 'rxjs';
import { DeckDetailComponent, ViewMode, FreeColumn } from './deck-detail.component';
import { DeckActions } from '../../store/deck/deck.actions';
import { CollectionApiService } from '../../services/collection-api.service';
import { GameApiService } from '../../services/game-api.service';
import { DeckDetailDto } from '../../services/deck-api.service';
import { CollectionCardDto, CardType, ManaColor } from '../../models/game.models';
import { makeCard } from '../../testing/test-factories';

function makeDeckCard(overrides: Partial<CollectionCardDto> = {}): CollectionCardDto {
  return {
    id: 'card-1', oracleId: 'oracle-1', scryfallId: 'scry-1',
    quantity: 1, quantityFoil: 0, notes: null, addedAt: '', cardDetails: null,
    ...overrides,
  };
}

function makeDeck(cards: CollectionCardDto[] = []): DeckDetailDto {
  return { id: 'deck-1', name: 'Test Deck', coverUri: null, format: null, commanderOracleId: null, createdAt: '', updatedAt: '', cards };
}

const INITIAL_STATE = {
  deck: { decks: [], activeDeck: makeDeck(), loading: false, error: null },
};

async function setup() {
  const collectionApi = jasmine.createSpyObj('CollectionApiService', ['getPrintings']);
  collectionApi.getPrintings.and.returnValue(of([]));

  const gameApi = jasmine.createSpyObj<GameApiService>('GameApiService', ['searchCards', 'getSets']);
  gameApi.searchCards.and.returnValue(of([]));
  gameApi.getSets.and.returnValue(of([]));

  await TestBed.configureTestingModule({
    imports: [DeckDetailComponent],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      provideMockStore({ initialState: INITIAL_STATE }),
      { provide: CollectionApiService, useValue: collectionApi },
      { provide: GameApiService,       useValue: gameApi },
      { provide: Router,               useValue: { navigate: jasmine.createSpy() } },
      { provide: ActivatedRoute,       useValue: { snapshot: { paramMap: { get: () => 'deck-1' } } } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(DeckDetailComponent);
  const component = fixture.componentInstance;
  const store = TestBed.inject(MockStore);
  spyOn(store, 'dispatch');
  fixture.detectChanges();
  (store.dispatch as jasmine.Spy).calls.reset();
  return { component, fixture, store };
}

// ── filteredCards ────────────────────────────────────────────────────────────

describe('DeckDetailComponent — filteredCards', () => {
  afterEach(() => TestBed.resetTestingModule());

  const CARDS = [
    makeDeckCard({ id: 'c1', cardDetails: makeCard({ name: 'Lightning Bolt' }) }),
    makeDeckCard({ id: 'c2', cardDetails: makeCard({ name: 'Counterspell' }) }),
    makeDeckCard({ id: 'c3', cardDetails: makeCard({ name: 'Lightning Helix' }) }),
  ];

  it('returns all cards when filterQuery is empty', async () => {
    const { component } = await setup();
    component.filterQuery = '';
    expect(component.filteredCards(makeDeck(CARDS))).toHaveSize(3);
  });

  it('filters by name case-insensitively', async () => {
    const { component } = await setup();
    component.filterQuery = 'lightning';
    const results = component.filteredCards(makeDeck(CARDS));
    expect(results).toHaveSize(2);
    expect(results.map(c => c.id)).toContain('c1');
    expect(results.map(c => c.id)).toContain('c3');
  });

  it('returns empty when no cards match', async () => {
    const { component } = await setup();
    component.filterQuery = 'goblin';
    expect(component.filteredCards(makeDeck(CARDS))).toHaveSize(0);
  });
});

// ── getDeckStats ─────────────────────────────────────────────────────────────

describe('DeckDetailComponent — getDeckStats', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('total counts quantity + quantityFoil across all cards', async () => {
    const { component } = await setup();
    const cards = [
      makeDeckCard({ quantity: 2, quantityFoil: 1, cardDetails: makeCard({ cardTypes: [CardType.Creature] }) }),
      makeDeckCard({ id: 'c2', quantity: 3, quantityFoil: 0, cardDetails: makeCard({ cardTypes: [CardType.Instant] }) }),
    ];
    const stats = component.getDeckStats(makeDeck(cards));
    expect(stats.total).toBe(6);
  });

  it('counts creatures correctly', async () => {
    const { component } = await setup();
    const cards = [
      makeDeckCard({ quantity: 4, cardDetails: makeCard({ cardTypes: [CardType.Creature] }) }),
      makeDeckCard({ id: 'c2', quantity: 2, cardDetails: makeCard({ cardTypes: [CardType.Land] }) }),
    ];
    const stats = component.getDeckStats(makeDeck(cards));
    expect(stats.creatures).toBe(4);
    expect(stats.lands).toBe(2);
  });

  it('avgCmc excludes lands', async () => {
    const { component } = await setup();
    const cards = [
      makeDeckCard({ quantity: 4, cardDetails: makeCard({ cardTypes: [CardType.Creature], manaValue: 2 }) }),
      makeDeckCard({ id: 'land', quantity: 20, cardDetails: makeCard({ cardTypes: [CardType.Land], manaValue: 0 }) }),
    ];
    const stats = component.getDeckStats(makeDeck(cards));
    expect(stats.avgCmc).toBe(2);
  });

  it('avgCmc is 0 for a deck with only lands', async () => {
    const { component } = await setup();
    const cards = [
      makeDeckCard({ quantity: 20, cardDetails: makeCard({ cardTypes: [CardType.Land], manaValue: 0 }) }),
    ];
    const stats = component.getDeckStats(makeDeck(cards));
    expect(stats.avgCmc).toBe(0);
  });
});

// ── getGroups CMC ────────────────────────────────────────────────────────────

describe('DeckDetailComponent — getGroups (CMC sort)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lands go into a separate Lands group at the end', async () => {
    const { component } = await setup();
    component.sortMode = 'cmc';
    const cards = [
      makeDeckCard({ id: 'c1', quantity: 2, cardDetails: makeCard({ cardTypes: [CardType.Creature], manaValue: 2, name: 'A' }) }),
      makeDeckCard({ id: 'land', quantity: 4, cardDetails: makeCard({ cardTypes: [CardType.Land], manaValue: 0, name: 'Forest' }) }),
    ];
    const groups = component.getGroups(makeDeck(cards));
    const last = groups[groups.length - 1];
    expect(last.key).toBe('lands');
    expect(last.label).toBe('Lands');
  });

  it('cards with CMC >= 6 go into 6+ bucket', async () => {
    const { component } = await setup();
    component.sortMode = 'cmc';
    const cards = [
      makeDeckCard({ id: 'big', quantity: 1, cardDetails: makeCard({ cardTypes: [CardType.Creature], manaValue: 7, name: 'Titan' }) }),
    ];
    const groups = component.getGroups(makeDeck(cards));
    expect(groups.some(g => g.key === 'cmc-6+')).toBeTrue();
  });

  it('name sort returns a single All Cards group', async () => {
    const { component } = await setup();
    component.sortMode = 'name';
    const cards = [
      makeDeckCard({ id: 'c1', cardDetails: makeCard({ name: 'Zebra', cardTypes: [CardType.Creature] }) }),
      makeDeckCard({ id: 'c2', cardDetails: makeCard({ name: 'Ant', cardTypes: [CardType.Instant] }) }),
    ];
    const groups = component.getGroups(makeDeck(cards));
    expect(groups).toHaveSize(1);
    expect(groups[0].key).toBe('all');
    expect(groups[0].cards[0].cardDetails!.name).toBe('Ant');
  });

  it('type sort groups creatures before instants', async () => {
    const { component } = await setup();
    component.sortMode = 'type';
    const cards = [
      makeDeckCard({ id: 'inst', cardDetails: makeCard({ cardTypes: [CardType.Instant], name: 'Bolt' }) }),
      makeDeckCard({ id: 'creat', cardDetails: makeCard({ cardTypes: [CardType.Creature], name: 'Bear' }) }),
    ];
    const groups = component.getGroups(makeDeck(cards));
    const keys = groups.map(g => g.key);
    expect(keys.indexOf('type-Creature')).toBeLessThan(keys.indexOf('type-Instant'));
  });
});

// ── Quantity controls ────────────────────────────────────────────────────────

describe('DeckDetailComponent — quantity controls', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('increment dispatches updateCard with quantity+1', async () => {
    const { component, store } = await setup();
    const card = makeDeckCard({ id: 'c1', quantity: 2, quantityFoil: 0 });
    component.increment(card);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateCard({
        deckId: 'deck-1', cardId: 'c1',
        request: { quantity: 3, quantityFoil: 0 },
      })
    );
  });

  it('decrement dispatches removeCard when total count is 1', async () => {
    const { component, store } = await setup();
    const card = makeDeckCard({ id: 'c1', quantity: 1, quantityFoil: 0 });
    component.decrement(card);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.removeCard({ deckId: 'deck-1', cardId: 'c1' })
    );
  });

  it('decrement decrements normal quantity when quantity > 0 and total > 1', async () => {
    const { component, store } = await setup();
    const card = makeDeckCard({ id: 'c1', quantity: 2, quantityFoil: 0 });
    component.decrement(card);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateCard({
        deckId: 'deck-1', cardId: 'c1',
        request: { quantity: 1, quantityFoil: 0 },
      })
    );
  });

  it('decrement decrements foil when quantity is 0', async () => {
    const { component, store } = await setup();
    const card = makeDeckCard({ id: 'c1', quantity: 0, quantityFoil: 2 });
    component.decrement(card);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateCard({
        deckId: 'deck-1', cardId: 'c1',
        request: { quantity: 0, quantityFoil: 1 },
      })
    );
  });

  it('selectedCard syncs from store so a second modal increment uses the updated quantity', async () => {
    const { component, store } = await setup();
    const originalCard = makeDeckCard({ id: 'c1', quantity: 2, quantityFoil: 0 });
    component.openCard(originalCard);
    expect(component.selectedCard?.quantity).toBe(2);

    // Simulate store update after first increment succeeds
    const updatedCard = { ...originalCard, quantity: 3 };
    store.setState({
      deck: { decks: [], activeDeck: makeDeck([updatedCard]), loading: false, error: null },
    });

    expect(component.selectedCard?.quantity).toBe(3);

    (store.dispatch as jasmine.Spy).calls.reset();
    component.increment(component.selectedCard!);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateCard({
        deckId: 'deck-1', cardId: 'c1',
        request: { quantity: 4, quantityFoil: 0 },
      })
    );
  });
});

// ── Tile flip ────────────────────────────────────────────────────────────────

describe('DeckDetailComponent — tile flip', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('toggleTileFlip adds slot key to flippedCardIds', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1' });
    component.toggleTileFlip('grp/0', card, new MouseEvent('click'));
    expect(component.flippedCardIds.has('grp/0')).toBeTrue();
  });

  it('toggleTileFlip removes slot key on second toggle', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1' });
    component.toggleTileFlip('grp/0', card, new MouseEvent('click'));
    component.toggleTileFlip('grp/0', card, new MouseEvent('click'));
    expect(component.flippedCardIds.has('grp/0')).toBeFalse();
  });

  it('tileImage returns front when slot is not flipped', async () => {
    const { component } = await setup();
    const card = makeDeckCard({
      id: 'c1',
      cardDetails: makeCard({ imageUriNormal: 'front.jpg', imageUriNormalBack: 'back.jpg' }),
    });
    expect(component.tileImage(card, 'grp/0')).toBe('front.jpg');
  });

  it('tileImage returns back when slot is flipped', async () => {
    const { component } = await setup();
    const card = makeDeckCard({
      id: 'c1',
      cardDetails: makeCard({ imageUriNormal: 'front.jpg', imageUriNormalBack: 'back.jpg' }),
    });
    component.toggleTileFlip('grp/0', card, new MouseEvent('click'));
    expect(component.tileImage(card, 'grp/0')).toBe('back.jpg');
  });

  it('flipping one slot does not flip other copies of the same card', async () => {
    const { component } = await setup();
    const card = makeDeckCard({
      id: 'c1',
      cardDetails: makeCard({ imageUriNormal: 'front.jpg', imageUriNormalBack: 'back.jpg' }),
    });
    component.toggleTileFlip('grp/0', card, new MouseEvent('click'));
    expect(component.tileImage(card, 'grp/0')).toBe('back.jpg');
    expect(component.tileImage(card, 'grp/1')).toBe('front.jpg');
  });

  it('openCard with slotKey initialises modalFlipped from tile flip state', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1' });
    component.flippedCardIds = new Set(['col-1/2']);
    component.openCard(card, 'col-1/2');
    expect(component.modalFlipped).toBeTrue();
  });

  it('openCard with slotKey initialises modalFlipped as false when tile is not flipped', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1' });
    component.flippedCardIds = new Set();
    component.openCard(card, 'col-1/2');
    expect(component.modalFlipped).toBeFalse();
  });

  it('openCard without slotKey always initialises modalFlipped as false', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1' });
    component.flippedCardIds = new Set(['some/0']);
    component.openCard(card);
    expect(component.modalFlipped).toBeFalse();
  });

  it('setting modalFlipped updates the corresponding tile flip state', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1' });
    component.openCard(card, 'col-1/0');
    component.modalFlipped = true;
    expect(component.flippedCardIds.has('col-1/0')).toBeTrue();
    component.modalFlipped = false;
    expect(component.flippedCardIds.has('col-1/0')).toBeFalse();
  });

  it('setting modalFlipped does not modify flippedCardIds when no slotKey', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1' });
    component.openCard(card); // no slotKey
    component.modalFlipped = true;
    expect(component.flippedCardIds.size).toBe(0);
  });

  it('toggleTileFlip syncs modalFlipped when that slot is open in the modal', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1' });
    component.openCard(card, 'col-1/0');
    expect(component.modalFlipped).toBeFalse();
    component.toggleTileFlip('col-1/0', card, new MouseEvent('click'));
    expect(component.modalFlipped).toBeTrue();
    component.toggleTileFlip('col-1/0', card, new MouseEvent('click'));
    expect(component.modalFlipped).toBeFalse();
  });

  it('toggleTileFlip does not change modalFlipped when a different slot is open', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1' });
    component.openCard(card, 'col-1/1');
    component.toggleTileFlip('col-1/0', card, new MouseEvent('click'));
    expect(component.modalFlipped).toBeFalse();
  });

  it('closeCard clears modalSlotKey', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1' });
    component.openCard(card, 'col-1/0');
    component.closeCard();
    expect(component.modalSlotKey).toBeNull();
  });
});

// ── Free column target selection ─────────────────────────────────────────────

describe('DeckDetailComponent — free column target', () => {
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  it('selectFreeCol sets selectedFreeColId', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-a', label: 'A', cardIds: [] },
      { id: 'col-b', label: 'B', cardIds: [] },
    ];
    component.selectFreeCol('col-b');
    expect(component.selectedFreeColId).toBe('col-b');
  });

  it('selectFreeCol toggles off when clicking the active column', async () => {
    const { component } = await setup();
    component.freeColumns = [{ id: 'col-a', label: 'A', cardIds: [] }];
    component.selectFreeCol('col-a');
    component.selectFreeCol('col-a');
    expect(component.selectedFreeColId).toBeNull();
  });

  it('selectFreeCol clicking a different column changes selection without reordering', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-a', label: 'A', cardIds: [] },
      { id: 'col-b', label: 'B', cardIds: [] },
      { id: 'col-c', label: 'C', cardIds: [] },
    ];
    component.selectFreeCol('col-c');
    component.selectFreeCol('col-a');
    expect(component.freeColumns.map(c => c.id)).toEqual(['col-a', 'col-b', 'col-c']);
    expect(component.selectedFreeColId).toBe('col-a');
  });

  it('getCardsForColumn shows unassigned cards in selected column, not first', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', quantity: 1 });
    const deck = makeDeck([card]);
    component.freeColumns = [
      { id: 'col-a', label: 'A', cardIds: [] },
      { id: 'col-b', label: 'B', cardIds: [] },
    ];
    component.selectedFreeColId = 'col-b';
    expect(component.getCardsForColumn(component.freeColumns[0], deck)).toHaveSize(0);
    expect(component.getCardsForColumn(component.freeColumns[1], deck)).toHaveSize(1);
  });

  it('getCardsForColumn falls back to first column when no column selected', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', quantity: 1 });
    const deck = makeDeck([card]);
    component.freeColumns = [
      { id: 'col-a', label: 'A', cardIds: [] },
      { id: 'col-b', label: 'B', cardIds: [] },
    ];
    component.selectedFreeColId = null;
    expect(component.getCardsForColumn(component.freeColumns[0], deck)).toHaveSize(1);
    expect(component.getCardsForColumn(component.freeColumns[1], deck)).toHaveSize(0);
  });

  it('clearFreeColSelection clears selectedFreeColId', async () => {
    const { component } = await setup();
    component.freeColumns = [{ id: 'col-a', label: 'A', cardIds: [] }];
    component.selectedFreeColId = 'col-a';
    component.clearFreeColSelection();
    expect(component.selectedFreeColId).toBeNull();
  });

  it('clearFreeColSelection is a no-op when nothing is selected', async () => {
    const { component } = await setup();
    component.selectedFreeColId = null;
    expect(() => component.clearFreeColSelection()).not.toThrow();
    expect(component.selectedFreeColId).toBeNull();
  });
});

// ── Rename ───────────────────────────────────────────────────────────────────

describe('DeckDetailComponent — rename', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('startRename sets renameDraft and isRenaming', async () => {
    const { component } = await setup();
    component.startRename(makeDeck());
    expect(component.isRenaming).toBeTrue();
    expect(component.renameDraft).toBe('Test Deck');
  });

  it('commitRename dispatches updateDeckMeta when name changed', async () => {
    const { component, store } = await setup();
    const deck = makeDeck();
    component.renameDraft = 'New Deck Name';
    component.commitRename(deck);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateDeckMeta({ id: 'deck-1', name: 'New Deck Name', coverUri: null, format: null, commanderOracleId: null })
    );
    expect(component.isRenaming).toBeFalse();
  });

  it('commitRename does not dispatch when name is unchanged', async () => {
    const { component, store } = await setup();
    const deck = makeDeck();
    component.renameDraft = 'Test Deck';
    component.commitRename(deck);
    expect(store.dispatch).not.toHaveBeenCalled();
    expect(component.isRenaming).toBeFalse();
  });

  it('cancelRename clears isRenaming', async () => {
    const { component } = await setup();
    component.isRenaming = true;
    component.cancelRename();
    expect(component.isRenaming).toBeFalse();
  });
});

// ── View mode ────────────────────────────────────────────────────────────────

describe('DeckDetailComponent — view mode', () => {
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  it('viewMode defaults to visual', async () => {
    const { component } = await setup();
    expect(component.viewMode).toBe('visual');
  });

  it('setViewMode switches to visual', async () => {
    const { component } = await setup();
    component.setViewMode('visual');
    expect(component.viewMode).toBe('visual');
  });

  it('setViewMode switches back to list', async () => {
    const { component } = await setup();
    component.setViewMode('visual');
    component.setViewMode('list');
    expect(component.viewMode).toBe('list');
  });

  it('setViewMode("free") initializes freeColumns from deck groups', async () => {
    const { component } = await setup();
    const deck = makeDeck([
      makeDeckCard({ id: 'c1', quantity: 2, cardDetails: makeCard({ cardTypes: [CardType.Creature], manaValue: 2, name: 'Bear' }) }),
      makeDeckCard({ id: 'c2', quantity: 4, cardDetails: makeCard({ cardTypes: [CardType.Land], manaValue: 0, name: 'Forest' }) }),
    ]);
    component.setViewMode('free', deck);
    expect(component.freeColumns.length).toBeGreaterThan(0);
    const allCardIds = component.freeColumns.flatMap(c => c.cardIds);
    expect(allCardIds).toContain('c1');
    expect(allCardIds).toContain('c2');
  });

  it('setViewMode("free") loads saved layout from localStorage', async () => {
    const { component } = await setup();
    const saved: FreeColumn[] = [{ id: 'col-1', label: 'Saved', cardIds: ['c1'] }];
    localStorage.setItem('deck-free-deck-1', JSON.stringify(saved));
    component.setViewMode('free', makeDeck());
    expect(component.freeColumns).toEqual(saved);
  });

  it('setViewMode("free") adds missing copies when saved layout is stale', async () => {
    const { component } = await setup();
    // Saved layout has card c1 only once, but deck now has qty=3
    const saved: FreeColumn[] = [{ id: 'col-1', label: 'A', cardIds: ['c1'] }];
    localStorage.setItem('deck-free-deck-1', JSON.stringify(saved));
    const deck = makeDeck([makeDeckCard({ id: 'c1', quantity: 3 })]);
    component.setViewMode('free', deck);
    const allIds = component.freeColumns.flatMap(c => c.cardIds);
    expect(allIds.filter(id => id === 'c1')).toHaveSize(3);
  });
});

// ── Free mode columns ─────────────────────────────────────────────────────────

describe('DeckDetailComponent — free mode columns', () => {
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  function initFree(component: DeckDetailComponent, cards: ReturnType<typeof makeDeckCard>[] = []) {
    const deck = makeDeck(cards);
    component.setViewMode('free', deck);
    return deck;
  }

  it('addFreeColumn appends a new empty column', async () => {
    const { component } = await setup();
    initFree(component);
    const before = component.freeColumns.length;
    component.addFreeColumn();
    expect(component.freeColumns.length).toBe(before + 1);
    expect(component.freeColumns[component.freeColumns.length - 1].label).toBe('New Column');
    expect(component.freeColumns[component.freeColumns.length - 1].cardIds).toHaveSize(0);
  });

  it('removeColumn moves its cards to the first column', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1'] },
      { id: 'col-2', label: 'B', cardIds: ['c2', 'c3'] },
    ];
    component.removeColumn('col-2');
    expect(component.freeColumns).toHaveSize(1);
    expect(component.freeColumns[0].cardIds).toContain('c2');
    expect(component.freeColumns[0].cardIds).toContain('c3');
  });

  it('removeColumn does nothing when only one column remains', async () => {
    const { component } = await setup();
    component.freeColumns = [{ id: 'col-1', label: 'A', cardIds: ['c1'] }];
    component.removeColumn('col-1');
    expect(component.freeColumns).toHaveSize(1);
  });

  it('startEditColumnLabel sets editingColumnId and draft', async () => {
    const { component } = await setup();
    const col: FreeColumn = { id: 'col-1', label: 'Spells', cardIds: [] };
    component.startEditColumnLabel(col);
    expect(component.editingColumnId).toBe('col-1');
    expect(component.columnLabelDraft).toBe('Spells');
  });

  it('commitColumnLabel updates the column label', async () => {
    const { component } = await setup();
    component.freeColumns = [{ id: 'col-1', label: 'Old', cardIds: [] }];
    component.editingColumnId = 'col-1';
    component.columnLabelDraft = 'New Label';
    component.commitColumnLabel();
    expect(component.freeColumns[0].label).toBe('New Label');
    expect(component.editingColumnId).toBeNull();
  });

  it('commitColumnLabel ignores blank draft', async () => {
    const { component } = await setup();
    component.freeColumns = [{ id: 'col-1', label: 'Keep', cardIds: [] }];
    component.editingColumnId = 'col-1';
    component.columnLabelDraft = '   ';
    component.commitColumnLabel();
    expect(component.freeColumns[0].label).toBe('Keep');
  });

  it('cancelColumnLabel clears editingColumnId without saving', async () => {
    const { component } = await setup();
    component.freeColumns = [{ id: 'col-1', label: 'Keep', cardIds: [] }];
    component.editingColumnId = 'col-1';
    component.columnLabelDraft = 'Changed';
    component.cancelColumnLabel();
    expect(component.editingColumnId).toBeNull();
    expect(component.freeColumns[0].label).toBe('Keep');
  });
});

// ── getCardsForColumn ─────────────────────────────────────────────────────────

describe('DeckDetailComponent — getCardsForColumn', () => {
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  it('returns cards in column order', async () => {
    const { component } = await setup();
    const c1 = makeDeckCard({ id: 'c1' });
    const c2 = makeDeckCard({ id: 'c2' });
    const deck = makeDeck([c1, c2]);
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c2', 'c1'] },
    ];
    const result = component.getCardsForColumn(component.freeColumns[0], deck);
    expect(result.map(c => c.id)).toEqual(['c2', 'c1']);
  });

  it('includes unassigned cards in the first column', async () => {
    const { component } = await setup();
    const c1 = makeDeckCard({ id: 'c1' });
    const c2 = makeDeckCard({ id: 'c2' }); // unassigned
    const deck = makeDeck([c1, c2]);
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1'] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    const result = component.getCardsForColumn(component.freeColumns[0], deck);
    expect(result.map(c => c.id)).toContain('c2');
  });

  it('does not include unassigned cards in non-first columns', async () => {
    const { component } = await setup();
    const c2 = makeDeckCard({ id: 'c2' }); // unassigned
    const deck = makeDeck([c2]);
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    const result = component.getCardsForColumn(component.freeColumns[1], deck);
    expect(result.map(c => c.id)).not.toContain('c2');
  });

  it('filters out card ids not present in deck', async () => {
    const { component } = await setup();
    const c1 = makeDeckCard({ id: 'c1' });
    const deck = makeDeck([c1]);
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'removed-card'] },
    ];
    const result = component.getCardsForColumn(component.freeColumns[0], deck);
    expect(result).toHaveSize(1);
    expect(result[0].id).toBe('c1');
  });

  it('shows one tile per copy based on quantity', async () => {
    const { component } = await setup();
    const c1 = makeDeckCard({ id: 'c1', quantity: 3, quantityFoil: 0 });
    const deck = makeDeck([c1]);
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c1', 'c1'] },
    ];
    const result = component.getCardsForColumn(component.freeColumns[0], deck);
    expect(result).toHaveSize(3);
  });

  it('unassigned copies equal total minus assigned count', async () => {
    const { component } = await setup();
    const c1 = makeDeckCard({ id: 'c1', quantity: 4, quantityFoil: 0 });
    const deck = makeDeck([c1]);
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1'] },   // 1 assigned
      { id: 'col-2', label: 'B', cardIds: ['c1'] },   // 1 assigned
    ];
    // 4 total - 2 assigned = 2 unassigned shown in first col
    const result = component.getCardsForColumn(component.freeColumns[0], deck);
    expect(result).toHaveSize(3); // 1 assigned + 2 unassigned
  });
});

// ── Drag and drop ─────────────────────────────────────────────────────────────

describe('DeckDetailComponent — drag and drop', () => {
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  it('onDragEnd clears all drag state', async () => {
    const { component } = await setup();
    component.dragCardId = 'c1';
    component.dragSrcRenderedIdx = 2;
    component.dragSourceColId = 'col-1';
    component.dragOverColId = 'col-2';
    component.dragOverIndex = 3;
    component.onDragEnd();
    expect(component.dragCardId).toBeNull();
    expect(component.dragSrcRenderedIdx).toBeNull();
    expect(component.dragSourceColId).toBeNull();
    expect(component.dragOverColId).toBeNull();
    expect(component.dragOverIndex).toBeNull();
  });

  it('onColDrop moves a card from one column to another at given index', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c2'] },
      { id: 'col-2', label: 'B', cardIds: ['c3'] },
    ];
    component.dragCardId = 'c1';
    component.dragSourceColId = 'col-1';
    component.dragOverColId = 'col-2';
    component.dragOverIndex = 1;

    const event = { preventDefault: () => {} } as DragEvent;
    component.onColDrop('col-2', event);

    expect(component.freeColumns[0].cardIds).not.toContain('c1');
    expect(component.freeColumns[1].cardIds).toEqual(['c3', 'c1']);
  });

  it('onColDrop reorders a card within the same column', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c2', 'c3'] },
    ];
    component.dragCardId = 'c3';
    component.dragSourceColId = 'col-1';
    component.dragOverColId = 'col-1';
    component.dragOverIndex = 0;

    const event = { preventDefault: () => {} } as DragEvent;
    component.onColDrop('col-1', event);

    expect(component.freeColumns[0].cardIds).toEqual(['c3', 'c1', 'c2']);
  });

  it('onColDrop moves only one copy when card appears multiple times', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c1', 'c1'] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    component.dragCardId = 'c1';
    component.dragSourceColId = 'col-1';
    component.dragOverColId = 'col-2';
    component.dragOverIndex = 0;

    const event = { preventDefault: () => {} } as DragEvent;
    component.onColDrop('col-2', event);

    expect(component.freeColumns[0].cardIds).toHaveSize(2);
    expect(component.freeColumns[1].cardIds).toEqual(['c1']);
  });

  it('onColDrop transfers flip state from old slot to new slot', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c2'] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    component.flippedCardIds = new Set(['col-1/0']); // c1 was showing back face
    component.dragCardId = 'c1';
    component.dragSourceColId = 'col-1';
    component.dragSrcRenderedIdx = 0;
    component.dragOverIndex = 0;

    const event = { preventDefault: () => {} } as DragEvent;
    component.onColDrop('col-2', event);

    expect(component.flippedCardIds.has('col-1/0')).toBeFalse(); // old key removed
    expect(component.flippedCardIds.has('col-2/0')).toBeTrue();  // new key set
  });

  it('onColDrop clears stale flip state at the drop target slot', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1'] },
      { id: 'col-2', label: 'B', cardIds: ['c2'] },
    ];
    // col-2/0 has stale flip state from a previous operation
    component.flippedCardIds = new Set(['col-2/0']);
    component.dragCardId = 'c1';
    component.dragSourceColId = 'col-1';
    component.dragSrcRenderedIdx = 0;
    component.dragOverIndex = 0;

    const event = { preventDefault: () => {} } as DragEvent;
    component.onColDrop('col-2', event);

    // c1 was NOT flipped, so the drop slot should also not be flipped
    expect(component.flippedCardIds.has('col-2/0')).toBeFalse();
  });

  it('onColDrop shifts adjacent source-column flip keys down after removal', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c2', 'c3'] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    // c2 (idx 1) and c3 (idx 2) are flipped in col-1; drag c1 from idx 0
    component.flippedCardIds = new Set(['col-1/1', 'col-1/2']);
    component.dragCardId = 'c1';
    component.dragSourceColId = 'col-1';
    component.dragSrcRenderedIdx = 0;
    component.dragOverIndex = 0;

    component.onColDrop('col-2', { preventDefault: () => {} } as DragEvent);

    // c2 shifted from idx 1 to idx 0, c3 shifted from idx 2 to idx 1
    expect(component.flippedCardIds.has('col-1/0')).toBeTrue();
    expect(component.flippedCardIds.has('col-1/1')).toBeTrue();
    expect(component.flippedCardIds.has('col-1/2')).toBeFalse();
  });

  it('onColDrop shifts adjacent target-column flip keys up on insertion', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1'] },
      { id: 'col-2', label: 'B', cardIds: ['c2', 'c3'] },
    ];
    // c2 (col-2/0) and c3 (col-2/1) are flipped; drop c1 at idx 0 of col-2
    component.flippedCardIds = new Set(['col-2/0', 'col-2/1']);
    component.dragCardId = 'c1';
    component.dragSourceColId = 'col-1';
    component.dragSrcRenderedIdx = 0;
    component.dragOverIndex = 0;

    component.onColDrop('col-2', { preventDefault: () => {} } as DragEvent);

    // c2 shifts to idx 1, c3 shifts to idx 2; col-2/0 (c1) was not flipped
    expect(component.flippedCardIds.has('col-2/0')).toBeFalse();
    expect(component.flippedCardIds.has('col-2/1')).toBeTrue();
    expect(component.flippedCardIds.has('col-2/2')).toBeTrue();
  });

  it('onColDrop same-column reorder keeps unaffected flip keys stable', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c2', 'c3'] },
    ];
    // c3 at idx 2 is flipped; move c1 from idx 0 to the end (idx 3 → becomes idx 2 after removal)
    component.flippedCardIds = new Set(['col-1/2']);
    component.dragCardId = 'c1';
    component.dragSourceColId = 'col-1';
    component.dragSrcRenderedIdx = 0;
    component.dragOverIndex = 3;

    component.onColDrop('col-1', { preventDefault: () => {} } as DragEvent);

    // After removing c1, c2→0, c3→1; drop idx 3 → clamped to end → c1 at idx 2
    // c3 shifted from idx 2 to idx 1
    expect(component.flippedCardIds.has('col-1/2')).toBeFalse();
    expect(component.flippedCardIds.has('col-1/1')).toBeTrue();
  });

  it('onColDrop handles unassigned card (not in any cardIds)', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    component.dragCardId = 'unassigned';
    component.dragSourceColId = 'col-1';
    component.dragOverColId = 'col-2';
    component.dragOverIndex = 0;

    const event = { preventDefault: () => {} } as DragEvent;
    component.onColDrop('col-2', event);

    expect(component.freeColumns[1].cardIds).toContain('unassigned');
    expect(component.freeColumns[0].cardIds).not.toContain('unassigned');
  });
});

// ── Column drag and drop ──────────────────────────────────────────────────────

describe('DeckDetailComponent — column drag and drop', () => {
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  it('onColDragEnd clears dragColId and dragOverColInsertIdx', async () => {
    const { component } = await setup();
    component.dragColId = 'col-1';
    component.dragOverColInsertIdx = 2;
    component.onColDragEnd();
    expect(component.dragColId).toBeNull();
    expect(component.dragOverColInsertIdx).toBeNull();
  });

  it('onGroupsListDrop moves column forward (earlier → later position)', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
      { id: 'col-3', label: 'C', cardIds: [] },
    ];
    component.dragColId = 'col-1';
    component.dragOverColInsertIdx = 3; // insert at end
    const event = { preventDefault: () => {} } as DragEvent;
    component.onGroupsListDrop(event);
    expect(component.freeColumns.map(c => c.id)).toEqual(['col-2', 'col-3', 'col-1']);
  });

  it('onGroupsListDrop moves column backward (later → earlier position)', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
      { id: 'col-3', label: 'C', cardIds: [] },
    ];
    component.dragColId = 'col-3';
    component.dragOverColInsertIdx = 0; // insert at start
    const event = { preventDefault: () => {} } as DragEvent;
    component.onGroupsListDrop(event);
    expect(component.freeColumns.map(c => c.id)).toEqual(['col-3', 'col-1', 'col-2']);
  });

  it('onGroupsListDrop clears drag state after drop', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    component.dragColId = 'col-1';
    component.dragOverColInsertIdx = 2;
    const event = { preventDefault: () => {} } as DragEvent;
    component.onGroupsListDrop(event);
    expect(component.dragColId).toBeNull();
    expect(component.dragOverColInsertIdx).toBeNull();
  });

  it('onGroupsListDrop is a no-op when dragColId is null', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    component.dragColId = null;
    const event = { preventDefault: () => {} } as DragEvent;
    component.onGroupsListDrop(event);
    expect(component.freeColumns.map(c => c.id)).toEqual(['col-1', 'col-2']);
  });

  it('onColDrop is guarded when a column drag is in progress', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1'] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    component.dragColId = 'col-1';   // column drag active
    component.dragCardId = 'c1';
    component.dragOverIndex = 0;
    const event = { preventDefault: () => {} } as DragEvent;
    component.onColDrop('col-2', event);
    // card should NOT have moved because column drag is in progress
    expect(component.freeColumns[0].cardIds).toContain('c1');
    expect(component.freeColumns[1].cardIds).not.toContain('c1');
  });
});

// ── Rubber-band selection persistence ────────────────────────────────────────

describe('DeckDetailComponent — rubber-band selection persistence', () => {
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  it('clearFreeColSelection is absorbed when dragSelectJustEnded is true', async () => {
    const { component } = await setup();
    component.selectedCardSlots = new Map([['col-a/0', 'c1'], ['col-a/1', 'c2']]);
    (component as any).dragSelectJustEnded = true;
    component.clearFreeColSelection();
    expect(component.selectedCardSlots.size).toBe(2);
  });

  it('clearFreeColSelection resets the dragSelectJustEnded flag when absorbing', async () => {
    const { component } = await setup();
    (component as any).dragSelectJustEnded = true;
    component.clearFreeColSelection();
    expect((component as any).dragSelectJustEnded).toBeFalse();
  });

  it('clearFreeColSelection clears selection on the next call after absorption', async () => {
    const { component } = await setup();
    component.selectedCardSlots = new Map([['col-a/0', 'c1']]);
    (component as any).dragSelectJustEnded = true;
    component.clearFreeColSelection(); // absorbed
    component.clearFreeColSelection(); // should clear
    expect(component.selectedCardSlots.size).toBe(0);
  });

  it('clearFreeColSelection also preserves dragSelectedColIds when absorbed', async () => {
    const { component } = await setup();
    component.dragSelectedColIds = new Set(['col-a', 'col-b']);
    (component as any).dragSelectJustEnded = true;
    component.clearFreeColSelection();
    expect(component.dragSelectedColIds.size).toBe(2);
  });

  it('onDocumentMouseUp sets dragSelectJustEnded when drag was active', async () => {
    const { component } = await setup();
    (component as any).dragSelectListEl = document.createElement('div');
    component.isDragSelecting = true;
    component.selectedCardSlots = new Map([['col-1/0', 'c1']]);
    component.onDocumentMouseUp();
    expect((component as any).dragSelectJustEnded).toBeTrue();
  });

  it('onDocumentMouseUp does not set dragSelectJustEnded when no drag occurred', async () => {
    const { component } = await setup();
    (component as any).dragSelectListEl = document.createElement('div');
    component.isDragSelecting = false;
    component.onDocumentMouseUp();
    expect((component as any).dragSelectJustEnded).toBeFalse();
  });

  it('onDocumentMouseUp clears dragSelectListEl and isDragSelecting', async () => {
    const { component } = await setup();
    (component as any).dragSelectListEl = document.createElement('div');
    component.isDragSelecting = true;
    component.onDocumentMouseUp();
    expect((component as any).dragSelectListEl).toBeNull();
    expect(component.isDragSelecting).toBeFalse();
  });

  it('onDocumentMouseUp is a no-op when dragSelectListEl is null', async () => {
    const { component } = await setup();
    (component as any).dragSelectListEl = null;
    component.isDragSelecting = true;
    component.onDocumentMouseUp();
    expect((component as any).dragSelectJustEnded).toBeFalse();
  });
});

// ── Multi-card drag and drop ──────────────────────────────────────────────────

describe('DeckDetailComponent — multi-card drag and drop', () => {
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  function makeDragEvent(): DragEvent {
    return {
      preventDefault: () => {},
      dataTransfer: { effectAllowed: '', setData: jasmine.createSpy('setData') },
    } as unknown as DragEvent;
  }

  it('onCardDragStart sets isDraggingMultiCards when card is in a multi-selection', async () => {
    const { component } = await setup();
    component.selectedCardSlots = new Map([['col-1/0', 'c1'], ['col-1/1', 'c2']]);
    const card = makeDeckCard({ id: 'c1' });
    component.onCardDragStart(card, 'col-1', 0, makeDragEvent());
    expect(component.isDraggingMultiCards).toBeTrue();
  });

  it('onCardDragStart builds multiDragCards from selectedCardSlots', async () => {
    const { component } = await setup();
    component.selectedCardSlots = new Map([['col-1/0', 'c1'], ['col-2/0', 'c2']]);
    const card = makeDeckCard({ id: 'c1' });
    component.onCardDragStart(card, 'col-1', 0, makeDragEvent());
    const multi = (component as any).multiDragCards as { colId: string; cardId: string; renderedIdx: number }[];
    expect(multi).toHaveSize(2);
    expect(multi.some(m => m.colId === 'col-1' && m.cardId === 'c1' && m.renderedIdx === 0)).toBeTrue();
    expect(multi.some(m => m.colId === 'col-2' && m.cardId === 'c2' && m.renderedIdx === 0)).toBeTrue();
  });

  it('onCardDragStart stays in single-card mode when card not in selection', async () => {
    const { component } = await setup();
    component.selectedCardSlots = new Map([['col-1/0', 'c1'], ['col-1/1', 'c2']]);
    const card = makeDeckCard({ id: 'c3' }); // not in selection
    component.onCardDragStart(card, 'col-1', 2, makeDragEvent());
    expect(component.isDraggingMultiCards).toBeFalse();
    expect((component as any).multiDragCards).toHaveSize(0);
  });

  it('onCardDragStart stays in single-card mode when only one card is selected', async () => {
    const { component } = await setup();
    component.selectedCardSlots = new Map([['col-1/0', 'c1']]); // size === 1
    const card = makeDeckCard({ id: 'c1' });
    component.onCardDragStart(card, 'col-1', 0, makeDragEvent());
    expect(component.isDraggingMultiCards).toBeFalse();
  });

  it('onDragEnd clears isDraggingMultiCards, multiDragCards, and selectedCardSlots', async () => {
    const { component } = await setup();
    component.isDraggingMultiCards = true;
    (component as any).multiDragCards = [{ colId: 'col-1', cardId: 'c1', renderedIdx: 0 }];
    component.selectedCardSlots = new Map([['col-1/0', 'c1']]);
    component.onDragEnd();
    expect(component.isDraggingMultiCards).toBeFalse();
    expect((component as any).multiDragCards).toHaveSize(0);
    expect(component.selectedCardSlots.size).toBe(0);
  });

  it('onColDrop moves multiple cards from different source columns to target', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c3'] },
      { id: 'col-2', label: 'B', cardIds: ['c2'] },
      { id: 'col-3', label: 'C', cardIds: [] },
    ];
    component.isDraggingMultiCards = true;
    (component as any).multiDragCards = [
      { colId: 'col-1', cardId: 'c1', renderedIdx: 0 },
      { colId: 'col-2', cardId: 'c2', renderedIdx: 0 },
    ];
    component.dragCardId = 'c1';
    component.dragOverIndex = 0;
    component.onColDrop('col-3', makeDragEvent());
    expect(component.freeColumns[0].cardIds).toEqual(['c3']);
    expect(component.freeColumns[1].cardIds).toEqual([]);
    expect(component.freeColumns[2].cardIds).toContain('c1');
    expect(component.freeColumns[2].cardIds).toContain('c2');
  });

  it('onColDrop moves multiple cards from the same source column', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c2', 'c3'] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    component.isDraggingMultiCards = true;
    (component as any).multiDragCards = [
      { colId: 'col-1', cardId: 'c1', renderedIdx: 0 },
      { colId: 'col-1', cardId: 'c3', renderedIdx: 2 },
    ];
    component.dragCardId = 'c1';
    component.dragOverIndex = 0;
    component.onColDrop('col-2', makeDragEvent());
    expect(component.freeColumns[0].cardIds).toEqual(['c2']);
    expect(component.freeColumns[1].cardIds).toEqual(['c1', 'c3']);
  });

  it('onColDrop adjusts drop index when source cards preceded the drop point in target column', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c2', 'c3', 'c4', 'c5'] },
    ];
    component.isDraggingMultiCards = true;
    // Select first two cards, drop after position 4 (after c4 in the original)
    (component as any).multiDragCards = [
      { colId: 'col-1', cardId: 'c1', renderedIdx: 0 },
      { colId: 'col-1', cardId: 'c2', renderedIdx: 1 },
    ];
    component.dragCardId = 'c1';
    component.dragOverIndex = 4;
    component.onColDrop('col-1', makeDragEvent());
    // c1 and c2 removed from top, then inserted after c4: [c3, c4, c1, c2, c5]
    expect(component.freeColumns[0].cardIds).toEqual(['c3', 'c4', 'c1', 'c2', 'c5']);
  });

  it('onColDrop handles duplicate card ids correctly, moving only the selected count', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c1', 'c1'] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    component.isDraggingMultiCards = true;
    // Select 2 of the 3 copies (both are explicit: renderedIdx 0 and 1 < col length 3)
    (component as any).multiDragCards = [
      { colId: 'col-1', cardId: 'c1', renderedIdx: 0 },
      { colId: 'col-1', cardId: 'c1', renderedIdx: 1 },
    ];
    component.dragCardId = 'c1';
    component.dragOverIndex = 0;
    component.onColDrop('col-2', makeDragEvent());
    expect(component.freeColumns[0].cardIds).toEqual(['c1']); // 1 copy stays
    expect(component.freeColumns[1].cardIds).toEqual(['c1', 'c1']); // 2 copies moved
  });

  it('executeMultiCardDrop preserves flip state of a flipped card during multi-drag', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c2'] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    // c1 and c2 selected; c2 is flipped
    component.selectedCardSlots = new Map([['col-1/0', 'c1'], ['col-1/1', 'c2']]);
    component.flippedCardIds = new Set(['col-1/1']);
    component.isDraggingMultiCards = true;
    (component as any).multiDragCards = [
      { colId: 'col-1', cardId: 'c1', renderedIdx: 0 },
      { colId: 'col-1', cardId: 'c2', renderedIdx: 1 },
    ];
    component.dragCardId = 'c1';
    component.dragOverIndex = 0;
    component.onColDrop('col-2', makeDragEvent());

    // c1 at col-2/0 (not flipped), c2 at col-2/1 (was flipped → stays flipped)
    expect(component.flippedCardIds.has('col-2/0')).toBeFalse();
    expect(component.flippedCardIds.has('col-2/1')).toBeTrue();
    // Old source keys are gone
    expect(component.flippedCardIds.has('col-1/0')).toBeFalse();
    expect(component.flippedCardIds.has('col-1/1')).toBeFalse();
  });

  it('executeMultiCardDrop shifts non-dragged flip keys in source column', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c2', 'c3'] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    // Drag c1 (idx 0) and c2 (idx 1); c3 (idx 2) stays and is flipped
    component.selectedCardSlots = new Map([['col-1/0', 'c1'], ['col-1/1', 'c2']]);
    component.flippedCardIds = new Set(['col-1/2']);
    component.isDraggingMultiCards = true;
    (component as any).multiDragCards = [
      { colId: 'col-1', cardId: 'c1', renderedIdx: 0 },
      { colId: 'col-1', cardId: 'c2', renderedIdx: 1 },
    ];
    component.dragCardId = 'c1';
    component.dragOverIndex = 0;
    component.onColDrop('col-2', makeDragEvent());

    // c3 shifted from col-1/2 → col-1/0
    expect(component.flippedCardIds.has('col-1/2')).toBeFalse();
    expect(component.flippedCardIds.has('col-1/0')).toBeTrue();
  });

  it('executeMultiCardDrop shifts non-dragged flip keys in target column', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c2'] },
      { id: 'col-2', label: 'B', cardIds: ['c3', 'c4'] },
    ];
    // Drag c1 and c2 from col-1 to col-2/0; c3 at col-2/0 is flipped
    component.selectedCardSlots = new Map([['col-1/0', 'c1'], ['col-1/1', 'c2']]);
    component.flippedCardIds = new Set(['col-2/0']);
    component.isDraggingMultiCards = true;
    (component as any).multiDragCards = [
      { colId: 'col-1', cardId: 'c1', renderedIdx: 0 },
      { colId: 'col-1', cardId: 'c2', renderedIdx: 1 },
    ];
    component.dragCardId = 'c1';
    component.dragOverIndex = 0;
    component.onColDrop('col-2', makeDragEvent());

    // c3 shifted from col-2/0 → col-2/2 (2 cards inserted before it)
    expect(component.flippedCardIds.has('col-2/0')).toBeFalse();
    expect(component.flippedCardIds.has('col-2/2')).toBeTrue();
  });

  it('executeMultiCardDrop does not remove explicit card when only unassigned copies are dragged', async () => {
    const { component } = await setup();
    // col-1 has 1 explicit c1; unassigned copies of c1 and c2 are rendered beyond cardIds.length
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1'] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    component.isDraggingMultiCards = true;
    // renderedIdx 1 and 2 are >= col-1.cardIds.length (1), so both are unassigned
    (component as any).multiDragCards = [
      { colId: 'col-1', cardId: 'c1', renderedIdx: 1 },
      { colId: 'col-1', cardId: 'c2', renderedIdx: 2 },
    ];
    component.selectedCardSlots = new Map([['col-1/1', 'c1'], ['col-1/2', 'c2']]);
    component.dragCardId = 'c1';
    component.dragOverIndex = 0;
    component.onColDrop('col-2', makeDragEvent());

    // Explicit c1 in col-1 must NOT be removed (user dragged unassigned copies)
    expect(component.freeColumns[0].cardIds).toEqual(['c1']);
    // Both unassigned copies inserted into col-2
    expect(component.freeColumns[1].cardIds).toEqual(['c1', 'c2']);
  });

  it('executeMultiCardDrop removes only the explicit copy when mixed explicit+unassigned selected', async () => {
    const { component } = await setup();
    // col-1 has ['c1']; user selects explicit c1 (idx 0) AND an unassigned c1 (idx 1)
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1'] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    component.isDraggingMultiCards = true;
    (component as any).multiDragCards = [
      { colId: 'col-1', cardId: 'c1', renderedIdx: 0 }, // explicit
      { colId: 'col-1', cardId: 'c1', renderedIdx: 1 }, // unassigned
    ];
    component.selectedCardSlots = new Map([['col-1/0', 'c1'], ['col-1/1', 'c1']]);
    component.dragCardId = 'c1';
    component.dragOverIndex = 0;
    component.onColDrop('col-2', makeDragEvent());

    // Explicit copy removed from col-1 (1 removal queued for renderedIdx 0)
    expect(component.freeColumns[0].cardIds).toEqual([]);
    // Both copies inserted into col-2
    expect(component.freeColumns[1].cardIds).toEqual(['c1', 'c1']);
  });
});

// ── Multi-column drag and drop ────────────────────────────────────────────────

describe('DeckDetailComponent — multi-column drag and drop', () => {
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  function makeColDragEvent(): DragEvent {
    return {
      stopPropagation: () => {},
      preventDefault: () => {},
      dataTransfer: { effectAllowed: '', setData: jasmine.createSpy('setData') },
    } as unknown as DragEvent;
  }

  it('onColHeaderDragStart sets isDraggingMultiCols when col is in a multi-selection', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    component.dragSelectedColIds = new Set(['col-1', 'col-2']);
    component.onColHeaderDragStart(component.freeColumns[0], makeColDragEvent());
    expect(component.isDraggingMultiCols).toBeTrue();
  });

  it('onColHeaderDragStart builds multiDragColIds in freeColumns order', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
      { id: 'col-3', label: 'C', cardIds: [] },
    ];
    component.dragSelectedColIds = new Set(['col-3', 'col-1']); // reversed insertion order
    component.onColHeaderDragStart(component.freeColumns[0], makeColDragEvent());
    // Should be in freeColumns order: col-1 before col-3
    expect(component.multiDragColIds).toEqual(['col-1', 'col-3']);
  });

  it('onColHeaderDragStart stays in single-col mode when col not in selection', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    component.dragSelectedColIds = new Set(['col-2', 'col-3']); // col-1 not selected
    component.onColHeaderDragStart(component.freeColumns[0], makeColDragEvent());
    expect(component.isDraggingMultiCols).toBeFalse();
    expect(component.multiDragColIds).toHaveSize(0);
  });

  it('onColHeaderDragStart stays in single-col mode when only one column is selected', async () => {
    const { component } = await setup();
    component.freeColumns = [{ id: 'col-1', label: 'A', cardIds: [] }];
    component.dragSelectedColIds = new Set(['col-1']); // size === 1
    component.onColHeaderDragStart(component.freeColumns[0], makeColDragEvent());
    expect(component.isDraggingMultiCols).toBeFalse();
  });

  it('onColDragEnd clears isDraggingMultiCols and multiDragColIds', async () => {
    const { component } = await setup();
    component.isDraggingMultiCols = true;
    component.multiDragColIds = ['col-1', 'col-2'];
    component.onColDragEnd();
    expect(component.isDraggingMultiCols).toBeFalse();
    expect(component.multiDragColIds).toHaveSize(0);
  });

  it('onGroupsListDrop moves a group of columns to a later position', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
      { id: 'col-3', label: 'C', cardIds: [] },
      { id: 'col-4', label: 'D', cardIds: [] },
    ];
    component.dragColId = 'col-1';
    component.isDraggingMultiCols = true;
    component.multiDragColIds = ['col-1', 'col-2'];
    component.dragOverColInsertIdx = 4; // insert at end
    component.onGroupsListDrop(makeColDragEvent());
    expect(component.freeColumns.map(c => c.id)).toEqual(['col-3', 'col-4', 'col-1', 'col-2']);
  });

  it('onGroupsListDrop moves a group of columns to an earlier position', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
      { id: 'col-3', label: 'C', cardIds: [] },
      { id: 'col-4', label: 'D', cardIds: [] },
    ];
    component.dragColId = 'col-3';
    component.isDraggingMultiCols = true;
    component.multiDragColIds = ['col-3', 'col-4'];
    component.dragOverColInsertIdx = 0; // insert at start
    component.onGroupsListDrop(makeColDragEvent());
    expect(component.freeColumns.map(c => c.id)).toEqual(['col-3', 'col-4', 'col-1', 'col-2']);
  });

  it('onGroupsListDrop moves non-contiguous columns preserving their relative order', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
      { id: 'col-3', label: 'C', cardIds: [] },
      { id: 'col-4', label: 'D', cardIds: [] },
      { id: 'col-5', label: 'E', cardIds: [] },
    ];
    component.dragColId = 'col-1';
    component.isDraggingMultiCols = true;
    component.multiDragColIds = ['col-1', 'col-3']; // non-contiguous
    component.dragOverColInsertIdx = 5; // insert at end
    component.onGroupsListDrop(makeColDragEvent());
    expect(component.freeColumns.map(c => c.id)).toEqual(['col-2', 'col-4', 'col-5', 'col-1', 'col-3']);
  });

  it('onGroupsListDrop clears multi-col drag state after drop', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    component.dragColId = 'col-1';
    component.isDraggingMultiCols = true;
    component.multiDragColIds = ['col-1', 'col-2'];
    component.dragOverColInsertIdx = 2;
    component.onGroupsListDrop(makeColDragEvent());
    expect(component.isDraggingMultiCols).toBeFalse();
    expect(component.multiDragColIds).toHaveSize(0);
    expect(component.dragColId).toBeNull();
    expect(component.dragOverColInsertIdx).toBeNull();
  });

  it('onGroupsListDrop falls back to single-column move when multiDragColIds has only one entry', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: [] },
      { id: 'col-2', label: 'B', cardIds: [] },
      { id: 'col-3', label: 'C', cardIds: [] },
    ];
    component.dragColId = 'col-1';
    component.isDraggingMultiCols = true;
    component.multiDragColIds = ['col-1']; // only one
    component.dragOverColInsertIdx = 3;
    component.onGroupsListDrop(makeColDragEvent());
    expect(component.freeColumns.map(c => c.id)).toEqual(['col-2', 'col-3', 'col-1']);
  });
});

// ── Detail cover picker ───────────────────────────────────────────────────────

describe('DeckDetailComponent — detail cover picker', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('openDetailCoverPicker sets showDetailCoverPicker to true', async () => {
    const { component } = await setup();
    component.openDetailCoverPicker(makeDeck());
    expect(component.showDetailCoverPicker).toBeTrue();
  });

  it('closeDetailCoverPicker sets showDetailCoverPicker to false', async () => {
    const { component } = await setup();
    component.showDetailCoverPicker = true;
    component.closeDetailCoverPicker();
    expect(component.showDetailCoverPicker).toBeFalse();
  });

  it('onDetailCoverSelected dispatches updateDeckMeta and closes picker', async () => {
    const { component, store } = await setup();
    const deck = makeDeck();
    component.showDetailCoverPicker = true;
    component.onDetailCoverSelected(deck, 'new-art.jpg');
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateDeckMeta({ id: 'deck-1', name: 'Test Deck', coverUri: 'new-art.jpg', format: null, commanderOracleId: null })
    );
    expect(component.showDetailCoverPicker).toBeFalse();
  });

  it('onDetailCoverSelected with null removes cover', async () => {
    const { component, store } = await setup();
    const deck = { ...makeDeck(), coverUri: 'old.jpg' };
    component.onDetailCoverSelected(deck, null);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateDeckMeta({ id: 'deck-1', name: 'Test Deck', coverUri: null, format: null, commanderOracleId: null })
    );
  });
});

// ── freeIncrement / freeDecrement ────────────────────────────────────────────

describe('DeckDetailComponent — freeIncrement / freeDecrement', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('freeIncrement pushes card id into the column and dispatches updateCard', async () => {
    const { component, store } = await setup();
    component.freeColumns = [{ id: 'col-1', label: 'A', cardIds: ['c1'] }];
    const card = makeDeckCard({ id: 'c1', quantity: 1, quantityFoil: 0 });
    component.freeIncrement(card, 'col-1');
    expect(component.freeColumns[0].cardIds).toEqual(['c1', 'c1']);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateCard({ deckId: 'deck-1', cardId: 'c1', request: { quantity: 2, quantityFoil: 0 } })
    );
  });

  it('freeIncrement marks layout dirty', async () => {
    const { component } = await setup();
    component.freeColumns = [{ id: 'col-1', label: 'A', cardIds: [] }];
    component.freeLayoutDirty = false;
    const card = makeDeckCard({ id: 'c1', quantity: 1, quantityFoil: 0 });
    component.freeIncrement(card, 'col-1');
    expect(component.freeLayoutDirty).toBeTrue();
  });

  it('freeDecrement removes one card id from the column and dispatches updateCard', async () => {
    const { component, store } = await setup();
    component.freeColumns = [{ id: 'col-1', label: 'A', cardIds: ['c1', 'c1'] }];
    const card = makeDeckCard({ id: 'c1', quantity: 2, quantityFoil: 0 });
    component.freeDecrement(card, 'col-1');
    expect(component.freeColumns[0].cardIds).toEqual(['c1']);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateCard({ deckId: 'deck-1', cardId: 'c1', request: { quantity: 1, quantityFoil: 0 } })
    );
  });

  it('freeDecrement removes last copy from all columns and dispatches removeCard', async () => {
    const { component, store } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1'] },
      { id: 'col-2', label: 'B', cardIds: ['c2'] },
    ];
    const card = makeDeckCard({ id: 'c1', quantity: 1, quantityFoil: 0 });
    component.freeDecrement(card, 'col-1');
    expect(component.freeColumns[0].cardIds).toEqual([]);
    expect(component.freeColumns[1].cardIds).toEqual(['c2']);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.removeCard({ deckId: 'deck-1', cardId: 'c1' })
    );
  });

  it('freeDecrement cleans up card from all columns when count reaches 1', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1'] },
      { id: 'col-2', label: 'B', cardIds: ['c1'] },
    ];
    const card = makeDeckCard({ id: 'c1', quantity: 1, quantityFoil: 0 });
    component.freeDecrement(card, 'col-1');
    expect(component.freeColumns[0].cardIds).toEqual([]);
    expect(component.freeColumns[1].cardIds).toEqual([]);
  });

  it('freeDecrement removes only the last occurrence from the target column', async () => {
    const { component } = await setup();
    component.freeColumns = [
      { id: 'col-1', label: 'A', cardIds: ['c1', 'c2', 'c1'] },
      { id: 'col-2', label: 'B', cardIds: [] },
    ];
    const card = makeDeckCard({ id: 'c1', quantity: 3, quantityFoil: 0 });
    component.freeDecrement(card, 'col-1');
    expect(component.freeColumns[0].cardIds).toEqual(['c1', 'c2']);
  });

  it('freeDecrement marks layout dirty', async () => {
    const { component } = await setup();
    component.freeColumns = [{ id: 'col-1', label: 'A', cardIds: ['c1', 'c1'] }];
    component.freeLayoutDirty = false;
    const card = makeDeckCard({ id: 'c1', quantity: 2, quantityFoil: 0 });
    component.freeDecrement(card, 'col-1');
    expect(component.freeLayoutDirty).toBeTrue();
  });
});

// ── Delete key ───────────────────────────────────────────────────────────────

describe('DeckDetailComponent — Delete key', () => {
  afterEach(() => TestBed.resetTestingModule());

  function press(key: string, tagName = 'DIV'): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true });
    Object.defineProperty(event, 'target', { value: { tagName } });
    return event;
  }

  it('does nothing when not in free view', async () => {
    const { component, store } = await setup();
    component.viewMode = 'list';
    component.selectedCardSlots = new Map([['col-1/0', 'c1']]);
    component.onDocumentKeyDown(press('Delete'));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('does nothing when no slots are selected', async () => {
    const { component, store } = await setup();
    component.viewMode = 'free';
    component.selectedCardSlots = new Map();
    component.onDocumentKeyDown(press('Delete'));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('does nothing when target is an input', async () => {
    const { component, store } = await setup();
    component.viewMode = 'free';
    component.selectedCardSlots = new Map([['col-1/0', 'c1']]);
    component.onDocumentKeyDown(press('Delete', 'INPUT'));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches removeCard and clears selection when deleting last copy', async () => {
    const { component, store } = await setup();
    const card = makeDeckCard({ id: 'c1', quantity: 1, quantityFoil: 0 });
    store.setState({ deck: { decks: [], activeDeck: makeDeck([card]), loading: false, error: null } });
    component.viewMode = 'free';
    component.freeColumns = [{ id: 'col-1', label: 'A', cardIds: ['c1'] }];
    component.selectedCardSlots = new Map([['col-1/0', 'c1']]);
    component.onDocumentKeyDown(press('Delete'));
    await Promise.resolve();
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.removeCard({ deckId: 'deck-1', cardId: 'c1' })
    );
    expect(component.selectedCardSlots.size).toBe(0);
    expect(component.freeColumns[0].cardIds).toEqual([]);
  });

  it('dispatches updateCard when deleting one of multiple copies', async () => {
    const { component, store } = await setup();
    const card = makeDeckCard({ id: 'c1', quantity: 3, quantityFoil: 0 });
    store.setState({ deck: { decks: [], activeDeck: makeDeck([card]), loading: false, error: null } });
    component.viewMode = 'free';
    component.freeColumns = [{ id: 'col-1', label: 'A', cardIds: ['c1', 'c1', 'c1'] }];
    component.selectedCardSlots = new Map([['col-1/0', 'c1']]);
    component.onDocumentKeyDown(press('Delete'));
    await Promise.resolve();
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateCard({ deckId: 'deck-1', cardId: 'c1', request: { quantity: 2, quantityFoil: 0 } })
    );
    expect(component.freeColumns[0].cardIds).toEqual(['c1', 'c1']);
  });

  it('removes all rubber-band selected slots across multiple cards', async () => {
    const { component, store } = await setup();
    const c1 = makeDeckCard({ id: 'c1', quantity: 2, quantityFoil: 0 });
    const c2 = makeDeckCard({ id: 'c2', quantity: 1, quantityFoil: 0 });
    store.setState({ deck: { decks: [], activeDeck: makeDeck([c1, c2]), loading: false, error: null } });
    component.viewMode = 'free';
    component.freeColumns = [{ id: 'col-1', label: 'A', cardIds: ['c1', 'c1', 'c2'] }];
    component.selectedCardSlots = new Map([['col-1/0', 'c1'], ['col-1/2', 'c2']]);
    component.onDocumentKeyDown(press('Delete'));
    await Promise.resolve();
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateCard({ deckId: 'deck-1', cardId: 'c1', request: { quantity: 1, quantityFoil: 0 } })
    );
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.removeCard({ deckId: 'deck-1', cardId: 'c2' })
    );
    expect(component.freeColumns[0].cardIds).toEqual(['c1']);
  });

  it('Backspace key works the same as Delete', async () => {
    const { component, store } = await setup();
    const card = makeDeckCard({ id: 'c1', quantity: 1, quantityFoil: 0 });
    store.setState({ deck: { decks: [], activeDeck: makeDeck([card]), loading: false, error: null } });
    component.viewMode = 'free';
    component.freeColumns = [{ id: 'col-1', label: 'A', cardIds: ['c1'] }];
    component.selectedCardSlots = new Map([['col-1/0', 'c1']]);
    component.onDocumentKeyDown(press('Backspace'));
    await Promise.resolve();
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.removeCard({ deckId: 'deck-1', cardId: 'c1' })
    );
  });
});

// ── Commander format ──────────────────────────────────────────────────────────

describe('DeckDetailComponent — Commander format', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('dispatches updateDeckMeta with format:commander when Commander is selected', async () => {
    const { component, store } = await setup();
    component.toggleFormatMenu();
    component.setFormat('commander', makeDeck());
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateDeckMeta({
        id: 'deck-1', name: 'Test Deck', coverUri: null,
        format: 'commander', commanderOracleId: null,
      })
    );
    expect(component.showFormatMenu).toBeFalse();
  });

  it('dispatches updateDeckMeta with format:null when No Format is selected', async () => {
    const { component, store } = await setup();
    const commanderDeck = { ...makeDeck(), format: 'commander', commanderOracleId: 'oracle-cmdr' };
    component.setFormat(null, commanderDeck);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateDeckMeta({
        id: 'deck-1', name: 'Test Deck', coverUri: null,
        format: null, commanderOracleId: null,
      })
    );
  });

  it('shows commander panel 2 seconds after selecting Commander', async () => {
    const { component, fixture, store } = await setup();

    // Click the format dropdown button
    component.toggleFormatMenu();
    expect(component.showFormatMenu).toBeTrue();

    // Select Commander from the menu
    component.setFormat('commander', makeDeck());
    expect(component.showFormatMenu).toBeFalse();

    // Simulate store update (optimistic reducer + server response)
    store.setState({
      deck: {
        decks: [],
        activeDeck: { ...makeDeck(), format: 'commander', commanderOracleId: null },
        loading: false,
        error: null,
      },
    });
    fixture.detectChanges();

    // Wait 2 seconds — verifies format has not reverted
    await new Promise(resolve => setTimeout(resolve, 2000));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.cp-panel'))
      .withContext('commander panel should be visible').toBeTruthy();

    expect(el.querySelector('.cp-portrait-wrap'))
      .withContext('commander portrait slot should be visible').toBeTruthy();

    expect(el.querySelector('.cp-no-cmdr'))
      .withContext('"Select Commander" prompt should appear').toBeTruthy();

    expect(el.querySelectorAll('.cp-check').length)
      .withContext('4 validation pills: size, commander, singleton, color ID').toBe(4);

    const formatBtn = el.querySelector<HTMLElement>('.format-btn');
    expect(formatBtn?.textContent?.trim())
      .withContext('format button should show CMDR label').toContain('CMDR');
  }, 10000); // extend Jasmine timeout to allow the 2-second wait
});

// ── eligibleCommanders ────────────────────────────────────────────────────────

describe('DeckDetailComponent — eligibleCommanders', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('includes legendary creatures', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', oracleId: 'o1', cardDetails: makeCard({ cardTypes: [CardType.Creature], supertypes: ['Legendary'] }) });
    const eligible = component.eligibleCommanders(makeDeck([card]));
    expect(eligible.map(c => c.id)).toContain('c1');
  });

  it('includes legendary planeswalkers', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', oracleId: 'o1', cardDetails: makeCard({ cardTypes: [CardType.Planeswalker], supertypes: ['Legendary'] }) });
    const eligible = component.eligibleCommanders(makeDeck([card]));
    expect(eligible.map(c => c.id)).toContain('c1');
  });

  it('excludes non-legendary creatures', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', cardDetails: makeCard({ cardTypes: [CardType.Creature], supertypes: [] }) });
    expect(component.eligibleCommanders(makeDeck([card]))).toHaveSize(0);
  });

  it('excludes legendary non-creature/non-planeswalker cards', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', cardDetails: makeCard({ cardTypes: [CardType.Enchantment], supertypes: ['Legendary'] }) });
    expect(component.eligibleCommanders(makeDeck([card]))).toHaveSize(0);
  });

  it('excludes cards with no cardDetails', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', cardDetails: null });
    expect(component.eligibleCommanders(makeDeck([card]))).toHaveSize(0);
  });
});

// ── commanderCard ─────────────────────────────────────────────────────────────

describe('DeckDetailComponent — commanderCard', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns null when commanderOracleId is not set', async () => {
    const { component } = await setup();
    expect(component.commanderCard(makeDeck())).toBeNull();
  });

  it('returns the card whose oracleId matches commanderOracleId', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', oracleId: 'oracle-cmdr' });
    const deck = { ...makeDeck([card]), commanderOracleId: 'oracle-cmdr' };
    expect(component.commanderCard(deck)?.id).toBe('c1');
  });

  it('returns null when no card matches', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', oracleId: 'oracle-other' });
    const deck = { ...makeDeck([card]), commanderOracleId: 'oracle-cmdr' };
    expect(component.commanderCard(deck)).toBeNull();
  });
});

// ── singletonViolations ───────────────────────────────────────────────────────

describe('DeckDetailComponent — singletonViolations', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns empty when all non-basics appear exactly once', async () => {
    const { component } = await setup();
    const cards = [
      makeDeckCard({ id: 'c1', oracleId: 'o1', quantity: 1, cardDetails: makeCard({ supertypes: [] }) }),
      makeDeckCard({ id: 'c2', oracleId: 'o2', quantity: 1, cardDetails: makeCard({ supertypes: [] }) }),
    ];
    expect(component.singletonViolations(makeDeck(cards))).toHaveSize(0);
  });

  it('flags a card that appears twice', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', oracleId: 'o1', quantity: 2, cardDetails: makeCard({ supertypes: [] }) });
    const violations = component.singletonViolations(makeDeck([card]));
    expect(violations.map(c => c.id)).toContain('c1');
  });

  it('flags cards sharing an oracleId across different printings', async () => {
    const { component } = await setup();
    const p1 = makeDeckCard({ id: 'c1', oracleId: 'o1', quantity: 1, cardDetails: makeCard({ supertypes: [] }) });
    const p2 = makeDeckCard({ id: 'c2', oracleId: 'o1', quantity: 1, cardDetails: makeCard({ supertypes: [] }) });
    const violations = component.singletonViolations(makeDeck([p1, p2]));
    expect(violations.length).toBe(2);
  });

  it('does not flag basic lands even when count > 1', async () => {
    const { component } = await setup();
    const forest = makeDeckCard({ id: 'c1', oracleId: 'o-forest', quantity: 20, cardDetails: makeCard({ cardTypes: [CardType.Land], supertypes: ['Basic'] }) });
    expect(component.singletonViolations(makeDeck([forest]))).toHaveSize(0);
  });
});

// ── colorIdentityViolations ───────────────────────────────────────────────────

describe('DeckDetailComponent — colorIdentityViolations', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns empty when no commander is set', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', cardDetails: makeCard({ colorIdentity: [ManaColor.Red] }) });
    expect(component.colorIdentityViolations(makeDeck([card]))).toHaveSize(0);
  });

  it('returns empty when all cards are within commander color identity', async () => {
    const { component } = await setup();
    const cmdr = makeDeckCard({ id: 'cmdr', oracleId: 'o-cmdr', cardDetails: makeCard({ colorIdentity: [ManaColor.Red, ManaColor.White] }) });
    const card  = makeDeckCard({ id: 'c1',   oracleId: 'o1',     cardDetails: makeCard({ colorIdentity: [ManaColor.Red] }) });
    const deck  = { ...makeDeck([cmdr, card]), commanderOracleId: 'o-cmdr' };
    expect(component.colorIdentityViolations(deck)).toHaveSize(0);
  });

  it('flags cards with colors outside commander identity', async () => {
    const { component } = await setup();
    const cmdr  = makeDeckCard({ id: 'cmdr', oracleId: 'o-cmdr', cardDetails: makeCard({ colorIdentity: [ManaColor.White] }) });
    const blue  = makeDeckCard({ id: 'c1',   oracleId: 'o1',     cardDetails: makeCard({ colorIdentity: [ManaColor.Blue] }) });
    const deck  = { ...makeDeck([cmdr, blue]), commanderOracleId: 'o-cmdr' };
    const violations = component.colorIdentityViolations(deck);
    expect(violations.map(c => c.id)).toContain('c1');
  });

  it('does not flag the commander itself', async () => {
    const { component } = await setup();
    const cmdr = makeDeckCard({ id: 'cmdr', oracleId: 'o-cmdr', cardDetails: makeCard({ colorIdentity: [ManaColor.Blue] }) });
    const deck = { ...makeDeck([cmdr]), commanderOracleId: 'o-cmdr' };
    const violations = component.colorIdentityViolations(deck);
    expect(violations.map(c => c.id)).not.toContain('cmdr');
  });

  it('does not flag colorless cards', async () => {
    const { component } = await setup();
    const cmdr      = makeDeckCard({ id: 'cmdr', oracleId: 'o-cmdr', cardDetails: makeCard({ colorIdentity: [ManaColor.White] }) });
    const colorless = makeDeckCard({ id: 'c1',   oracleId: 'o1',     cardDetails: makeCard({ colorIdentity: [] }) });
    const deck      = { ...makeDeck([cmdr, colorless]), commanderOracleId: 'o-cmdr' };
    expect(component.colorIdentityViolations(deck)).toHaveSize(0);
  });
});

// ── cardViolationType / cardViolationClass ────────────────────────────────────

describe('DeckDetailComponent — cardViolationType & cardViolationClass', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns null for non-commander format', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', oracleId: 'o1', quantity: 2, cardDetails: makeCard({ supertypes: [] }) });
    const deck = makeDeck([card]); // format: null
    expect(component.cardViolationType(card, deck)).toBeNull();
  });

  it('returns "singleton" when only singleton is violated', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', oracleId: 'o1', quantity: 2, cardDetails: makeCard({ supertypes: [], colorIdentity: [ManaColor.White] }) });
    const cmdr = makeDeckCard({ id: 'cmdr', oracleId: 'o-cmdr', cardDetails: makeCard({ colorIdentity: [ManaColor.White] }) });
    const deck = { ...makeDeck([cmdr, card]), format: 'commander', commanderOracleId: 'o-cmdr' };
    expect(component.cardViolationType(card, deck)).toBe('singleton');
  });

  it('returns "color-id" when only color identity is violated', async () => {
    const { component } = await setup();
    const cmdr = makeDeckCard({ id: 'cmdr', oracleId: 'o-cmdr', cardDetails: makeCard({ colorIdentity: [ManaColor.White] }) });
    const card = makeDeckCard({ id: 'c1',   oracleId: 'o1',     quantity: 1, cardDetails: makeCard({ colorIdentity: [ManaColor.Blue], supertypes: [] }) });
    const deck = { ...makeDeck([cmdr, card]), format: 'commander', commanderOracleId: 'o-cmdr' };
    expect(component.cardViolationType(card, deck)).toBe('color-id');
  });

  it('returns "both" when both violations apply', async () => {
    const { component } = await setup();
    const cmdr = makeDeckCard({ id: 'cmdr', oracleId: 'o-cmdr', cardDetails: makeCard({ colorIdentity: [ManaColor.White] }) });
    const card = makeDeckCard({ id: 'c1',   oracleId: 'o1',     quantity: 2, cardDetails: makeCard({ colorIdentity: [ManaColor.Blue], supertypes: [] }) });
    const deck = { ...makeDeck([cmdr, card]), format: 'commander', commanderOracleId: 'o-cmdr' };
    expect(component.cardViolationType(card, deck)).toBe('both');
  });

  it('cardViolationClass returns empty string when no violation', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', quantity: 1, cardDetails: makeCard({ supertypes: [] }) });
    const deck = { ...makeDeck([card]), format: 'commander', commanderOracleId: null };
    expect(component.cardViolationClass(card, deck)).toBe('');
  });

  it('cardViolationClass returns "violation-singleton" for singleton violators', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', oracleId: 'o1', quantity: 2, cardDetails: makeCard({ supertypes: [], colorIdentity: [ManaColor.White] }) });
    const cmdr = makeDeckCard({ id: 'cmdr', oracleId: 'o-cmdr', cardDetails: makeCard({ colorIdentity: [ManaColor.White] }) });
    const deck = { ...makeDeck([cmdr, card]), format: 'commander', commanderOracleId: 'o-cmdr' };
    expect(component.cardViolationClass(card, deck)).toBe('violation-singleton');
  });
});

// ── hasCommanderViolations ────────────────────────────────────────────────────

describe('DeckDetailComponent — hasCommanderViolations', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns false for non-commander format', async () => {
    const { component } = await setup();
    expect(component.hasCommanderViolations(makeDeck())).toBeFalse();
  });

  it('returns true when deck total is not 100', async () => {
    const { component } = await setup();
    const cmdr = makeDeckCard({ id: 'cmdr', oracleId: 'o-cmdr', quantity: 1, cardDetails: makeCard({ supertypes: ['Legendary'], cardTypes: [CardType.Creature] }) });
    const deck = { ...makeDeck([cmdr]), format: 'commander', commanderOracleId: 'o-cmdr' };
    expect(component.hasCommanderViolations(deck)).toBeTrue();
  });

  it('returns true when commanderOracleId is null', async () => {
    const { component } = await setup();
    const deck = { ...makeDeck(), format: 'commander', commanderOracleId: null };
    expect(component.hasCommanderViolations(deck)).toBeTrue();
  });

  it('returns true when singleton violations exist', async () => {
    const { component } = await setup();
    const cmdr = makeDeckCard({ id: 'cmdr', oracleId: 'o-cmdr', quantity: 1, cardDetails: makeCard({ colorIdentity: [], supertypes: ['Legendary'], cardTypes: [CardType.Creature] }) });
    const dup  = makeDeckCard({ id: 'c1',   oracleId: 'o1',     quantity: 2, cardDetails: makeCard({ colorIdentity: [], supertypes: [] }) });
    // Pad to 100 total (1 + 2 + 97 basic lands)
    const lands = Array.from({ length: 97 }, (_, i) =>
      makeDeckCard({ id: `land-${i}`, oracleId: `o-land-${i}`, quantity: 1, cardDetails: makeCard({ cardTypes: [CardType.Land], supertypes: ['Basic'] }) })
    );
    const deck = { ...makeDeck([cmdr, dup, ...lands]), format: 'commander', commanderOracleId: 'o-cmdr' };
    expect(component.hasCommanderViolations(deck)).toBeTrue();
  });
});

// ── totalOracleCount ──────────────────────────────────────────────────────────

describe('DeckDetailComponent — totalOracleCount', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns 1 for a single card with quantity 1', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1', oracleId: 'o1', quantity: 1, quantityFoil: 0 });
    expect(component.totalOracleCount(card, makeDeck([card]))).toBe(1);
  });

  it('sums across different printings with the same oracleId', async () => {
    const { component } = await setup();
    const p1 = makeDeckCard({ id: 'c1', oracleId: 'o1', quantity: 1, quantityFoil: 0, cardDetails: makeCard() });
    const p2 = makeDeckCard({ id: 'c2', oracleId: 'o1', quantity: 2, quantityFoil: 1, cardDetails: makeCard() });
    expect(component.totalOracleCount(p1, makeDeck([p1, p2]))).toBe(4);
  });

  it('does not count cards with a different oracleId', async () => {
    const { component } = await setup();
    const c1 = makeDeckCard({ id: 'c1', oracleId: 'o1', quantity: 1 });
    const c2 = makeDeckCard({ id: 'c2', oracleId: 'o2', quantity: 3 });
    expect(component.totalOracleCount(c1, makeDeck([c1, c2]))).toBe(1);
  });
});

// ── targetCount ───────────────────────────────────────────────────────────────

describe('DeckDetailComponent — targetCount', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns 100 for commander format', async () => {
    const { component } = await setup();
    const deck = { ...makeDeck(), format: 'commander' };
    expect(component.targetCount(deck)).toBe(100);
  });

  it('returns 60 for non-commander format', async () => {
    const { component } = await setup();
    expect(component.targetCount(makeDeck())).toBe(60);
  });

  it('returns 60 when format is null', async () => {
    const { component } = await setup();
    const deck = { ...makeDeck(), format: null };
    expect(component.targetCount(deck)).toBe(60);
  });
});

// ── setSortMode in free mode ──────────────────────────────────────────────────

describe('DeckDetailComponent — setSortMode (free mode sort reset)', () => {
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  it('shows sort-reset modal when changing sort in free mode', async () => {
    const { component } = await setup();
    const deck = makeDeck([makeDeckCard({ id: 'c1', quantity: 1, cardDetails: makeCard({ cardTypes: [CardType.Creature], manaValue: 2, name: 'Bear' }) })]);
    component.setViewMode('free', deck);
    component.sortMode = 'cmc';
    component.setSortMode('type', deck);
    expect(component.showSortResetModal).toBeTrue();
  });

  it('does not show modal when setting same sort mode in free mode', async () => {
    const { component } = await setup();
    const deck = makeDeck();
    component.setViewMode('free', deck);
    component.sortMode = 'cmc';
    component.setSortMode('cmc', deck);
    expect(component.showSortResetModal).toBeFalse();
  });

  it('does not show modal when not in free mode', async () => {
    const { component } = await setup();
    component.sortMode = 'cmc';
    component.setViewMode('list');
    component.setSortMode('type');
    expect(component.showSortResetModal).toBeFalse();
    expect(component.sortMode).toBe('type');
  });

  it('confirmSortReset applies the new sort mode and rebuilds columns', async () => {
    const { component } = await setup();
    const deck = makeDeck([makeDeckCard({ id: 'c1', quantity: 1, cardDetails: makeCard({ cardTypes: [CardType.Creature], manaValue: 2, name: 'Bear' }) })]);
    component.setViewMode('free', deck);
    component.sortMode = 'cmc';
    component.setSortMode('type', deck);
    component.confirmSortReset();
    expect(component.sortMode).toBe('type');
    expect(component.showSortResetModal).toBeFalse();
    expect(component.freeColumns.length).toBeGreaterThan(0);
  });

  it('cancelSortReset keeps original sort mode', async () => {
    const { component } = await setup();
    const deck = makeDeck();
    component.setViewMode('free', deck);
    component.sortMode = 'cmc';
    component.setSortMode('type', deck);
    component.cancelSortReset();
    expect(component.sortMode).toBe('cmc');
    expect(component.showSortResetModal).toBeFalse();
  });
});
