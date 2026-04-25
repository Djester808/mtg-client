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
import { CollectionCardDto, CardType } from '../../models/game.models';
import { makeCard } from '../../testing/test-factories';

function makeDeckCard(overrides: Partial<CollectionCardDto> = {}): CollectionCardDto {
  return {
    id: 'card-1', oracleId: 'oracle-1', scryfallId: 'scry-1',
    quantity: 1, quantityFoil: 0, notes: null, addedAt: '', cardDetails: null,
    ...overrides,
  };
}

function makeDeck(cards: CollectionCardDto[] = []): DeckDetailDto {
  return { id: 'deck-1', name: 'Test Deck', coverUri: null, createdAt: '', updatedAt: '', cards };
}

const INITIAL_STATE = {
  deck: { decks: [], activeDeck: makeDeck(), loading: false, error: null },
};

async function setup() {
  const collectionApi = jasmine.createSpyObj('CollectionApiService', ['getPrintings']);
  collectionApi.getPrintings.and.returnValue(of([]));

  const gameApi = jasmine.createSpyObj<GameApiService>('GameApiService', ['searchCards']);
  gameApi.searchCards.and.returnValue(of([]));

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
});

// ── Tile flip ────────────────────────────────────────────────────────────────

describe('DeckDetailComponent — tile flip', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('toggleTileFlip adds card id to flippedCardIds', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1' });
    component.toggleTileFlip(card, new MouseEvent('click'));
    expect(component.flippedCardIds.has('c1')).toBeTrue();
  });

  it('toggleTileFlip removes card id on second toggle', async () => {
    const { component } = await setup();
    const card = makeDeckCard({ id: 'c1' });
    component.toggleTileFlip(card, new MouseEvent('click'));
    component.toggleTileFlip(card, new MouseEvent('click'));
    expect(component.flippedCardIds.has('c1')).toBeFalse();
  });

  it('tileImage returns front when not flipped', async () => {
    const { component } = await setup();
    const card = makeDeckCard({
      id: 'c1',
      cardDetails: makeCard({ imageUriNormal: 'front.jpg', imageUriNormalBack: 'back.jpg' }),
    });
    expect(component.tileImage(card)).toBe('front.jpg');
  });

  it('tileImage returns back when flipped', async () => {
    const { component } = await setup();
    const card = makeDeckCard({
      id: 'c1',
      cardDetails: makeCard({ imageUriNormal: 'front.jpg', imageUriNormalBack: 'back.jpg' }),
    });
    component.toggleTileFlip(card, new MouseEvent('click'));
    expect(component.tileImage(card)).toBe('back.jpg');
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
      DeckActions.updateDeckMeta({ id: 'deck-1', name: 'New Deck Name', coverUri: null })
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

  it('viewMode defaults to list', async () => {
    const { component } = await setup();
    expect(component.viewMode).toBe('list');
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
});

// ── Drag and drop ─────────────────────────────────────────────────────────────

describe('DeckDetailComponent — drag and drop', () => {
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  it('onDragEnd clears all drag state', async () => {
    const { component } = await setup();
    component.dragCardId = 'c1';
    component.dragSourceColId = 'col-1';
    component.dragOverColId = 'col-2';
    component.dragOverIndex = 3;
    component.onDragEnd();
    expect(component.dragCardId).toBeNull();
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
      DeckActions.updateDeckMeta({ id: 'deck-1', name: 'Test Deck', coverUri: 'new-art.jpg' })
    );
    expect(component.showDetailCoverPicker).toBeFalse();
  });

  it('onDetailCoverSelected with null removes cover', async () => {
    const { component, store } = await setup();
    const deck = { ...makeDeck(), coverUri: 'old.jpg' };
    component.onDetailCoverSelected(deck, null);
    expect(store.dispatch).toHaveBeenCalledWith(
      DeckActions.updateDeckMeta({ id: 'deck-1', name: 'Test Deck', coverUri: null })
    );
  });
});
