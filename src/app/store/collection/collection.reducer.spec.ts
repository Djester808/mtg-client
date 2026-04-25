import { collectionReducer, CollectionState } from './collection.reducer';
import { CollectionActions } from './collection.actions';
import { CollectionDetailDto, CollectionCardDto, CollectionDto } from '../../models/game.models';
import { makeCard } from '../../testing/test-factories';

function initialState(): CollectionState {
  return {
    collections: [],
    activeCollection: null,
    loading: false,
    error: null,
  };
}

function makeCollectionDto(overrides: Partial<CollectionDto> = {}): CollectionDto {
  return {
    id: 'col-1', name: 'My Collection',
    description: null, coverUri: null, cardCount: 0,
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
    ...overrides,
  };
}

function makeCollectionDetail(overrides: Partial<CollectionDetailDto> = {}): CollectionDetailDto {
  return {
    id: 'col-1', name: 'My Collection',
    description: null, coverUri: null,
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
    cards: [],
    ...overrides,
  };
}

function makeCollectionCard(overrides: Partial<CollectionCardDto> = {}): CollectionCardDto {
  return {
    id: 'cc-1', oracleId: 'oracle-1', scryfallId: 'sf-1',
    quantity: 1, quantityFoil: 0, notes: null,
    addedAt: '2024-01-01', cardDetails: makeCard(),
    ...overrides,
  };
}

describe('collectionReducer', () => {

  // ---- loadCollections ----------------------------------------

  it('sets loading on loadCollections', () => {
    const state = collectionReducer(initialState(), CollectionActions.loadCollections());
    expect(state.loading).toBeTrue();
    expect(state.error).toBeNull();
  });

  it('stores collections and clears loading on success', () => {
    const collections = [makeCollectionDto()];
    const state = collectionReducer(
      { ...initialState(), loading: true },
      CollectionActions.loadCollectionsSuccess({ collections }),
    );
    expect(state.loading).toBeFalse();
    expect(state.collections).toEqual(collections);
  });

  it('stores error and clears loading on failure', () => {
    const state = collectionReducer(
      { ...initialState(), loading: true },
      CollectionActions.loadCollectionsFailure({ error: 'network error' }),
    );
    expect(state.loading).toBeFalse();
    expect(state.error).toBe('network error');
  });

  // ---- loadCollection ----------------------------------------

  it('clears active collection and sets loading on loadCollection', () => {
    const base: CollectionState = {
      ...initialState(),
      activeCollection: makeCollectionDetail(),
    };
    const state = collectionReducer(base, CollectionActions.loadCollection({ id: 'col-1' }));
    expect(state.loading).toBeTrue();
    expect(state.activeCollection).toBeNull();
  });

  it('stores active collection on loadCollectionSuccess', () => {
    const detail = makeCollectionDetail({ id: 'col-2', name: 'Loaded' });
    const state = collectionReducer(
      { ...initialState(), loading: true },
      CollectionActions.loadCollectionSuccess({ collection: detail }),
    );
    expect(state.loading).toBeFalse();
    expect(state.activeCollection).toEqual(detail);
  });

  // ---- createCollection ----------------------------------------

  it('appends new collection summary on createCollectionSuccess', () => {
    const detail = makeCollectionDetail({ id: 'new-col', name: 'New' });
    const base: CollectionState = {
      ...initialState(),
      collections: [makeCollectionDto({ id: 'existing' })],
    };
    const state = collectionReducer(base, CollectionActions.createCollectionSuccess({ collection: detail }));
    expect(state.collections).toHaveSize(2);
    expect(state.collections[1].id).toBe('new-col');
    expect(state.collections[1].cardCount).toBe(0);
  });

  // ---- deleteCollection ----------------------------------------

  it('removes collection by id on deleteCollectionSuccess', () => {
    const base: CollectionState = {
      ...initialState(),
      collections: [makeCollectionDto({ id: 'col-1' }), makeCollectionDto({ id: 'col-2' })],
    };
    const state = collectionReducer(base, CollectionActions.deleteCollectionSuccess({ id: 'col-1' }));
    expect(state.collections).toHaveSize(1);
    expect(state.collections[0].id).toBe('col-2');
  });

  // ---- addCard ----------------------------------------

  it('appends new card to active collection on addCardSuccess', () => {
    const base: CollectionState = {
      ...initialState(),
      activeCollection: makeCollectionDetail({ cards: [] }),
    };
    const card = makeCollectionCard({ id: 'cc-new' });
    const state = collectionReducer(base, CollectionActions.addCardSuccess({ card }));
    expect(state.activeCollection!.cards).toHaveSize(1);
    expect(state.activeCollection!.cards[0].id).toBe('cc-new');
  });

  it('upserts (replaces) an existing card on addCardSuccess when id matches', () => {
    const existing = makeCollectionCard({ id: 'cc-1', quantity: 1 });
    const base: CollectionState = {
      ...initialState(),
      activeCollection: makeCollectionDetail({ cards: [existing] }),
    };
    const updated = makeCollectionCard({ id: 'cc-1', quantity: 3 });
    const state = collectionReducer(base, CollectionActions.addCardSuccess({ card: updated }));
    expect(state.activeCollection!.cards).toHaveSize(1);
    expect(state.activeCollection!.cards[0].quantity).toBe(3);
  });

  it('returns same state on addCardSuccess when activeCollection is null', () => {
    const card = makeCollectionCard();
    const base = initialState();
    const state = collectionReducer(base, CollectionActions.addCardSuccess({ card }));
    expect(state).toBe(base);
  });

  // ---- updateCard ----------------------------------------

  it('replaces the card in active collection on updateCardSuccess', () => {
    const original = makeCollectionCard({ id: 'cc-1', quantity: 1, quantityFoil: 0 });
    const base: CollectionState = {
      ...initialState(),
      activeCollection: makeCollectionDetail({ cards: [original] }),
    };
    const updated = makeCollectionCard({ id: 'cc-1', quantity: 2, quantityFoil: 1 });
    const state = collectionReducer(base, CollectionActions.updateCardSuccess({ card: updated }));
    expect(state.activeCollection!.cards[0].quantity).toBe(2);
    expect(state.activeCollection!.cards[0].quantityFoil).toBe(1);
  });

  // ---- removeCard ----------------------------------------

  it('removes card by id on removeCardSuccess', () => {
    const card1 = makeCollectionCard({ id: 'cc-1' });
    const card2 = makeCollectionCard({ id: 'cc-2' });
    const base: CollectionState = {
      ...initialState(),
      activeCollection: makeCollectionDetail({ cards: [card1, card2] }),
    };
    const state = collectionReducer(base, CollectionActions.removeCardSuccess({ cardId: 'cc-1' }));
    expect(state.activeCollection!.cards).toHaveSize(1);
    expect(state.activeCollection!.cards[0].id).toBe('cc-2');
  });

  it('returns same state on removeCardSuccess when activeCollection is null', () => {
    const base = initialState();
    const state = collectionReducer(base, CollectionActions.removeCardSuccess({ cardId: 'cc-1' }));
    expect(state).toBe(base);
  });

  // ---- updateCollectionMeta ----------------------------------------

  it('updates name, description, and coverUri in collections list on updateCollectionMetaSuccess', () => {
    const base: CollectionState = {
      ...initialState(),
      collections: [makeCollectionDto({ id: 'col-1', name: 'Old', description: null, coverUri: null })],
    };
    const updated = makeCollectionDetail({ id: 'col-1', name: 'New', description: 'desc', coverUri: 'art.jpg' });
    const state = collectionReducer(base, CollectionActions.updateCollectionMetaSuccess({ collection: updated }));
    expect(state.collections[0].name).toBe('New');
    expect(state.collections[0].description).toBe('desc');
    expect(state.collections[0].coverUri).toBe('art.jpg');
  });

  it('updates activeCollection on updateCollectionMetaSuccess when ids match', () => {
    const base: CollectionState = {
      ...initialState(),
      collections: [makeCollectionDto({ id: 'col-1' })],
      activeCollection: makeCollectionDetail({ id: 'col-1', name: 'Old', coverUri: null }),
    };
    const updated = makeCollectionDetail({ id: 'col-1', name: 'New', coverUri: 'art.jpg' });
    const state = collectionReducer(base, CollectionActions.updateCollectionMetaSuccess({ collection: updated }));
    expect(state.activeCollection!.name).toBe('New');
    expect(state.activeCollection!.coverUri).toBe('art.jpg');
  });

  it('leaves activeCollection unchanged on updateCollectionMetaSuccess when ids do not match', () => {
    const active = makeCollectionDetail({ id: 'col-2', name: 'Untouched' });
    const base: CollectionState = {
      ...initialState(),
      collections: [makeCollectionDto({ id: 'col-1' })],
      activeCollection: active,
    };
    const updated = makeCollectionDetail({ id: 'col-1', name: 'Changed' });
    const state = collectionReducer(base, CollectionActions.updateCollectionMetaSuccess({ collection: updated }));
    expect(state.activeCollection).toBe(active);
  });

  it('does not change other collections on updateCollectionMetaSuccess', () => {
    const base: CollectionState = {
      ...initialState(),
      collections: [
        makeCollectionDto({ id: 'col-1', name: 'Target' }),
        makeCollectionDto({ id: 'col-2', name: 'Other' }),
      ],
    };
    const updated = makeCollectionDetail({ id: 'col-1', name: 'Updated' });
    const state = collectionReducer(base, CollectionActions.updateCollectionMetaSuccess({ collection: updated }));
    expect(state.collections[1].name).toBe('Other');
  });

  // ---- failure actions ----------------------------------------

  it('stores error on addCardFailure', () => {
    const state = collectionReducer(initialState(), CollectionActions.addCardFailure({ error: 'conflict' }));
    expect(state.error).toBe('conflict');
  });

  it('stores error on updateCardFailure', () => {
    const state = collectionReducer(initialState(), CollectionActions.updateCardFailure({ error: 'not found' }));
    expect(state.error).toBe('not found');
  });

  it('stores error on removeCardFailure', () => {
    const state = collectionReducer(initialState(), CollectionActions.removeCardFailure({ error: 'server error' }));
    expect(state.error).toBe('server error');
  });
});
