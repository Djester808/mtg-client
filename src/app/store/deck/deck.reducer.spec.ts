import { deckReducer, DeckState } from './deck.reducer';
import { DeckActions } from './deck.actions';
import { DeckDto, DeckDetailDto } from '../../services/deck-api.service';
import { CollectionCardDto } from '../../models/game.models';
import { makeCard } from '../../testing/test-factories';

function initialState(): DeckState {
  return { decks: [], activeDeck: null, loading: false, error: null, pendingCardUpdates: {} };
}

function makeDeckDto(overrides: Partial<DeckDto> = {}): DeckDto {
  return {
    id: 'deck-1',
    name: 'My Deck',
    coverUri: null,
    format: 'commander',
    commanderOracleId: null,
    cardCount: 0,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

function makeDeckDetail(overrides: Partial<DeckDetailDto> = {}): DeckDetailDto {
  return {
    id: 'deck-1',
    name: 'My Deck',
    coverUri: null,
    format: 'commander',
    commanderOracleId: null,
    tags: [],
    notes: null,
    isPublished: false,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    cards: [],
    ...overrides,
  };
}

function makeDeckCard(overrides: Partial<CollectionCardDto> = {}): CollectionCardDto {
  return {
    id: 'cc-1',
    oracleId: 'oracle-1',
    scryfallId: 'sf-1',
    quantity: 1,
    quantityFoil: 0,
    notes: null,
    board: 'main',
    addedAt: '2024-01-01',
    cardDetails: makeCard(),
    ...overrides,
  };
}

describe('deckReducer', () => {
  // ---- load ---------------------------------------------------------

  it('sets loading and clears active deck on loadDeck', () => {
    const base: DeckState = { ...initialState(), activeDeck: makeDeckDetail() };
    const state = deckReducer(base, DeckActions.loadDeck({ id: 'deck-1' }));
    expect(state.loading).toBeTrue();
    expect(state.activeDeck).toBeNull();
  });

  it('stores the deck and resets pending updates on loadDeckSuccess', () => {
    const base: DeckState = { ...initialState(), pendingCardUpdates: { 'cc-1': 2 } };
    const deck = makeDeckDetail({ id: 'deck-2' });
    const state = deckReducer(base, DeckActions.loadDeckSuccess({ deck }));
    expect(state.activeDeck).toEqual(deck);
    expect(state.pendingCardUpdates).toEqual({});
  });

  it('appends a new deck on createDeckSuccess', () => {
    const state = deckReducer(
      initialState(),
      DeckActions.createDeckSuccess({ deck: makeDeckDetail({ id: 'new' }) }),
    );
    expect(state.decks.map((d) => d.id)).toEqual(['new']);
    expect(state.decks[0].cardCount).toBe(0);
  });

  // ---- optimistic quantity + pending counter ------------------------

  it('applies quantity optimistically and counts the in-flight update', () => {
    const base: DeckState = {
      ...initialState(),
      activeDeck: makeDeckDetail({ cards: [makeDeckCard({ id: 'cc-1', quantity: 1 })] }),
    };
    const state = deckReducer(
      base,
      DeckActions.updateCard({
        deckId: 'deck-1',
        cardId: 'cc-1',
        request: { quantity: 2, quantityFoil: 0 },
      }),
    );
    expect(state.activeDeck!.cards[0].quantity).toBe(2);
    expect(state.pendingCardUpdates!['cc-1']).toBe(1);
  });

  it('keeps the optimistic quantity while a newer update is still pending', () => {
    let state: DeckState = {
      ...initialState(),
      activeDeck: makeDeckDetail({ cards: [makeDeckCard({ id: 'cc-1', quantity: 1 })] }),
    };
    state = deckReducer(
      state,
      DeckActions.updateCard({
        deckId: 'deck-1',
        cardId: 'cc-1',
        request: { quantity: 2, quantityFoil: 0 },
      }),
    );
    state = deckReducer(
      state,
      DeckActions.updateCard({
        deckId: 'deck-1',
        cardId: 'cc-1',
        request: { quantity: 3, quantityFoil: 0 },
      }),
    );
    // First PUT's response lands; a newer update is still outstanding.
    state = deckReducer(
      state,
      DeckActions.updateCardSuccess({
        card: makeDeckCard({ id: 'cc-1', quantity: 2, quantityFoil: 0 }),
      }),
    );
    expect(state.activeDeck!.cards[0].quantity).toBe(3);
    expect(state.pendingCardUpdates!['cc-1']).toBe(1);
  });

  it('applies the server quantity authoritatively when the last update settles', () => {
    let state: DeckState = {
      ...initialState(),
      activeDeck: makeDeckDetail({ cards: [makeDeckCard({ id: 'cc-1', quantity: 1 })] }),
    };
    state = deckReducer(
      state,
      DeckActions.updateCard({
        deckId: 'deck-1',
        cardId: 'cc-1',
        request: { quantity: 10000, quantityFoil: 0 },
      }),
    );
    state = deckReducer(
      state,
      DeckActions.updateCardSuccess({
        card: makeDeckCard({ id: 'cc-1', quantity: 9999, quantityFoil: 0, notes: 'server' }),
      }),
    );
    expect(state.activeDeck!.cards[0].quantity).toBe(9999);
    expect(state.activeDeck!.cards[0].notes).toBe('server');
    expect(state.pendingCardUpdates!['cc-1']).toBeUndefined();
  });

  it('removes a card optimistically on removeCard', () => {
    const base: DeckState = {
      ...initialState(),
      activeDeck: makeDeckDetail({
        cards: [makeDeckCard({ id: 'cc-1' }), makeDeckCard({ id: 'cc-2' })],
      }),
    };
    const state = deckReducer(base, DeckActions.removeCard({ deckId: 'deck-1', cardId: 'cc-1' }));
    expect(state.activeDeck!.cards.map((c) => c.id)).toEqual(['cc-2']);
  });

  it('upserts on addCardSuccess: appends a new card, replaces a matching id', () => {
    const base: DeckState = {
      ...initialState(),
      activeDeck: makeDeckDetail({ cards: [makeDeckCard({ id: 'cc-1', quantity: 1 })] }),
    };
    const appended = deckReducer(
      base,
      DeckActions.addCardSuccess({ card: makeDeckCard({ id: 'cc-2' }) }),
    );
    expect(appended.activeDeck!.cards.map((c) => c.id)).toEqual(['cc-1', 'cc-2']);

    const replaced = deckReducer(
      base,
      DeckActions.addCardSuccess({
        card: makeDeckCard({ id: 'cc-1', quantity: 4 }),
      }),
    );
    expect(replaced.activeDeck!.cards).toHaveSize(1);
    expect(replaced.activeDeck!.cards[0].quantity).toBe(4);
  });

  // ---- meta + delete + failures -------------------------------------

  it('optimistically updates deck meta in both the list and the active deck', () => {
    const base: DeckState = {
      ...initialState(),
      decks: [makeDeckDto({ id: 'deck-1', name: 'Old' })],
      activeDeck: makeDeckDetail({ id: 'deck-1', name: 'Old' }),
    };
    const state = deckReducer(
      base,
      DeckActions.updateDeckMeta({
        id: 'deck-1',
        name: 'New',
        coverUri: null,
        format: 'commander',
        commanderOracleId: null,
      }),
    );
    expect(state.decks[0].name).toBe('New');
    expect(state.activeDeck!.name).toBe('New');
  });

  it('removes a deck on deleteDeckSuccess and stores error on deleteDeckFailure', () => {
    const base: DeckState = { ...initialState(), decks: [makeDeckDto({ id: 'deck-1' })] };
    expect(deckReducer(base, DeckActions.deleteDeckSuccess({ id: 'deck-1' })).decks).toHaveSize(0);
    expect(deckReducer(base, DeckActions.deleteDeckFailure({ error: 'nope' })).error).toBe('nope');
  });

  it('stores error on card mutation failures', () => {
    expect(
      deckReducer(initialState(), DeckActions.addCardFailure({ deckId: 'deck-1', error: 'a' }))
        .error,
    ).toBe('a');
    expect(
      deckReducer(initialState(), DeckActions.updateCardFailure({ deckId: 'deck-1', error: 'b' }))
        .error,
    ).toBe('b');
    expect(
      deckReducer(initialState(), DeckActions.removeCardFailure({ deckId: 'deck-1', error: 'c' }))
        .error,
    ).toBe('c');
  });
});
