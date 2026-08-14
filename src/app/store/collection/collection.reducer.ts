import { createReducer, on } from '@ngrx/store';
import { CollectionDto, CollectionDetailDto } from '../../models/game.models';
import { CollectionActions } from './collection.actions';

export interface CollectionState {
  collections: CollectionDto[];
  activeCollection: CollectionDetailDto | null;
  loading: boolean;
  error: string | null;
  /** In-flight optimistic card updates, counted per card id. See updateCardSuccess. */
  pendingCardUpdates?: Record<string, number>;
}

const initialState: CollectionState = {
  collections: [],
  activeCollection: null,
  loading: false,
  error: null,
  pendingCardUpdates: {},
};

export const collectionReducer = createReducer(
  initialState,

  // Load all
  on(CollectionActions.loadCollections, (state) => ({ ...state, loading: true, error: null })),
  on(CollectionActions.loadCollectionsSuccess, (state, { collections }) => ({
    ...state,
    loading: false,
    collections,
  })),
  on(CollectionActions.loadCollectionsFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  // Load one
  on(CollectionActions.loadCollection, (state) => ({
    ...state,
    loading: true,
    error: null,
    activeCollection: null,
  })),
  on(CollectionActions.loadCollectionSuccess, (state, { collection }) => ({
    ...state,
    loading: false,
    activeCollection: collection,
    pendingCardUpdates: {},
  })),
  on(CollectionActions.loadCollectionFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  // Create
  on(CollectionActions.createCollectionSuccess, (state, { collection }) => ({
    ...state,
    collections: [
      ...state.collections,
      {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        coverUri: collection.coverUri ?? null,
        cardCount: 0,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      },
    ],
  })),

  // Delete
  on(CollectionActions.deleteCollectionSuccess, (state, { id }) => ({
    ...state,
    collections: state.collections.filter((c) => c.id !== id),
  })),
  on(CollectionActions.deleteCollectionFailure, (state, { error }) => ({ ...state, error })),

  // Update meta
  on(CollectionActions.updateCollectionMetaSuccess, (state, { collection }) => ({
    ...state,
    collections: state.collections.map((c) =>
      c.id === collection.id
        ? {
            ...c,
            name: collection.name,
            description: collection.description,
            coverUri: collection.coverUri ?? null,
          }
        : c,
    ),
    activeCollection:
      state.activeCollection?.id === collection.id
        ? {
            ...state.activeCollection,
            name: collection.name,
            description: collection.description,
            coverUri: collection.coverUri ?? null,
          }
        : state.activeCollection,
  })),

  // Optimistic quantity write — see deck.reducer for the full rationale. Failures
  // resync via refreshCollection; a per-card in-flight counter drives which success
  // applies the server's authoritative quantity.
  on(CollectionActions.updateCard, (state, { cardId, request }) => {
    if (!state.activeCollection) return state;
    const pending = { ...(state.pendingCardUpdates ?? {}) };
    pending[cardId] = (pending[cardId] ?? 0) + 1;
    return {
      ...state,
      pendingCardUpdates: pending,
      activeCollection: {
        ...state.activeCollection,
        cards: state.activeCollection.cards.map((c) =>
          c.id === cardId
            ? { ...c, quantity: request.quantity, quantityFoil: request.quantityFoil }
            : c,
        ),
      },
    };
  }),

  on(CollectionActions.removeCard, (state, { cardId }) => {
    if (!state.activeCollection) return state;
    return {
      ...state,
      activeCollection: {
        ...state.activeCollection,
        cards: state.activeCollection.cards.filter((c) => c.id !== cardId),
      },
    };
  }),

  // Add card (upsert into activeCollection)
  on(CollectionActions.addCardSuccess, (state, { card }) => {
    if (!state.activeCollection) return state;
    const idx = state.activeCollection.cards.findIndex((c) => c.id === card.id);
    const cards =
      idx >= 0
        ? state.activeCollection.cards.map((c, i) => (i === idx ? card : c))
        : [...state.activeCollection.cards, card];
    return { ...state, activeCollection: { ...state.activeCollection, cards } };
  }),

  // Update card — the last in-flight update applies the server's authoritative
  // quantity; earlier ones keep the optimistic value (see deck.reducer).
  on(CollectionActions.updateCardSuccess, (state, { card }) => {
    if (!state.activeCollection) return state;
    const pending = { ...(state.pendingCardUpdates ?? {}) };
    const remaining = (pending[card.id] ?? 0) - 1;
    const authoritative = remaining <= 0;
    if (authoritative) delete pending[card.id];
    else pending[card.id] = remaining;
    return {
      ...state,
      pendingCardUpdates: pending,
      activeCollection: {
        ...state.activeCollection,
        cards: state.activeCollection.cards.map((c) =>
          c.id === card.id
            ? authoritative
              ? card
              : { ...card, quantity: c.quantity, quantityFoil: c.quantityFoil }
            : c,
        ),
      },
    };
  }),

  // Remove card
  on(CollectionActions.removeCardSuccess, (state, { cardId }) => {
    if (!state.activeCollection) return state;
    return {
      ...state,
      activeCollection: {
        ...state.activeCollection,
        cards: state.activeCollection.cards.filter((c) => c.id !== cardId),
      },
    };
  }),

  // Card mutation failures — surface error without clearing collection
  on(CollectionActions.addCardFailure, (state, { error }) => ({ ...state, error })),
  on(CollectionActions.updateCardFailure, (state, { error }) => ({ ...state, error })),
  on(CollectionActions.removeCardFailure, (state, { error }) => ({ ...state, error })),
);
