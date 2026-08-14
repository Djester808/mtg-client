import { createReducer, on } from '@ngrx/store';
import { CollectionDto, CollectionDetailDto } from '../../models/game.models';
import { CollectionActions } from './collection.actions';

export interface CollectionState {
  collections: CollectionDto[];
  activeCollection: CollectionDetailDto | null;
  loading: boolean;
  error: string | null;
}

const initialState: CollectionState = {
  collections: [],
  activeCollection: null,
  loading: false,
  error: null,
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

  // Optimistic quantity write — see deck.reducer for the rationale. Failures
  // resync via refreshCollection.
  on(CollectionActions.updateCard, (state, { cardId, request }) => {
    if (!state.activeCollection) return state;
    return {
      ...state,
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

  // Update card
  on(CollectionActions.updateCardSuccess, (state, { card }) => {
    if (!state.activeCollection) return state;
    return {
      ...state,
      activeCollection: {
        ...state.activeCollection,
        // Keep the local quantities — see deck.reducer for the rationale.
        cards: state.activeCollection.cards.map((c) =>
          c.id === card.id ? { ...card, quantity: c.quantity, quantityFoil: c.quantityFoil } : c,
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
