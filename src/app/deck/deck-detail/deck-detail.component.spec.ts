import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { of } from 'rxjs';
import { DeckDetailComponent } from './deck-detail.component';
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
