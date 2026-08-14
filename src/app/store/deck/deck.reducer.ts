import { createReducer, on } from '@ngrx/store';
import { DeckDto, DeckDetailDto } from '../../services/deck-api.service';
import { DeckActions } from './deck.actions';

export interface DeckState {
  decks: DeckDto[];
  activeDeck: DeckDetailDto | null;
  loading: boolean;
  error: string | null;
  /** In-flight optimistic card updates, counted per card id. See updateCardSuccess. */
  pendingCardUpdates?: Record<string, number>;
}

const initialState: DeckState = {
  decks: [],
  activeDeck: null,
  loading: false,
  error: null,
  pendingCardUpdates: {},
};

export const deckReducer = createReducer(
  initialState,

  on(DeckActions.loadDecks, (state) => ({ ...state, loading: true, error: null })),
  on(DeckActions.loadDecksSuccess, (state, { decks }) => ({ ...state, loading: false, decks })),
  on(DeckActions.loadDecksFailure, (state, { error }) => ({ ...state, loading: false, error })),

  on(DeckActions.loadDeck, (state) => ({ ...state, loading: true, error: null, activeDeck: null })),
  on(DeckActions.loadDeckSuccess, (state, { deck }) => ({
    ...state,
    loading: false,
    activeDeck: deck,
    // Fresh authoritative baseline: any still-in-flight update's success will now see a
    // zero pending count and apply the server value, converging the two.
    pendingCardUpdates: {},
  })),
  on(DeckActions.loadDeckFailure, (state, { error }) => ({ ...state, loading: false, error })),

  on(DeckActions.createDeckSuccess, (state, { deck }) => ({
    ...state,
    decks: [
      ...state.decks,
      {
        id: deck.id,
        name: deck.name,
        coverUri: deck.coverUri,
        cardCount: 0,
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt,
        format: deck.format ?? null,
        commanderOracleId: deck.commanderOracleId ?? null,
      },
    ],
  })),

  on(
    DeckActions.updateDeckMeta,
    (state, { id, name, coverUri, format, commanderOracleId, tags }) => ({
      ...state,
      decks: state.decks.map((d) =>
        d.id === id ? { ...d, name, coverUri, format, commanderOracleId } : d,
      ),
      activeDeck:
        state.activeDeck?.id === id
          ? {
              ...state.activeDeck,
              name,
              coverUri,
              format,
              commanderOracleId,
              ...(tags !== undefined ? { tags } : {}),
            }
          : state.activeDeck,
    }),
  ),

  on(DeckActions.updateDeckMetaSuccess, (state, { deck }) => ({
    ...state,
    decks: state.decks.map((d) =>
      d.id === deck.id
        ? {
            ...d,
            name: deck.name,
            coverUri: deck.coverUri,
            format: deck.format,
            commanderOracleId: deck.commanderOracleId,
          }
        : d,
    ),
    activeDeck:
      state.activeDeck?.id === deck.id
        ? {
            ...state.activeDeck,
            name: deck.name,
            coverUri: deck.coverUri,
            format: deck.format,
            commanderOracleId: deck.commanderOracleId,
            tags: deck.tags,
          }
        : state.activeDeck,
  })),

  on(DeckActions.deleteDeckSuccess, (state, { id }) => ({
    ...state,
    decks: state.decks.filter((d) => d.id !== id),
  })),
  on(DeckActions.deleteDeckFailure, (state, { error }) => ({ ...state, error })),

  // Optimistic quantity write: the tile updates on click, and because updates are
  // dispatched in order (and the effect serialises them), the next click reads the
  // fresh value instead of racing on a stale one. Failures resync via refreshDeck.
  // Each dispatch bumps a per-card in-flight counter (see updateCardSuccess).
  on(DeckActions.updateCard, (state, { cardId, request }) => {
    if (!state.activeDeck) return state;
    const pending = { ...(state.pendingCardUpdates ?? {}) };
    pending[cardId] = (pending[cardId] ?? 0) + 1;
    return {
      ...state,
      pendingCardUpdates: pending,
      activeDeck: {
        ...state.activeDeck,
        cards: state.activeDeck.cards.map((c) =>
          c.id === cardId
            ? { ...c, quantity: request.quantity, quantityFoil: request.quantityFoil }
            : c,
        ),
      },
    };
  }),

  on(DeckActions.removeCard, (state, { cardId }) => {
    if (!state.activeDeck) return state;
    return {
      ...state,
      activeDeck: {
        ...state.activeDeck,
        cards: state.activeDeck.cards.filter((c) => c.id !== cardId),
      },
    };
  }),

  on(DeckActions.addCardSuccess, (state, { card }) => {
    if (!state.activeDeck) return state;
    const idx = state.activeDeck.cards.findIndex((c) => c.id === card.id);
    const cards =
      idx >= 0
        ? state.activeDeck.cards.map((c, i) => (i === idx ? card : c))
        : [...state.activeDeck.cards, card];
    return { ...state, activeDeck: { ...state.activeDeck, cards } };
  }),

  on(DeckActions.updateCardSuccess, (state, { card }) => {
    if (!state.activeDeck) return state;
    const pending = { ...(state.pendingCardUpdates ?? {}) };
    const remaining = (pending[card.id] ?? 0) - 1;
    // Only the LAST in-flight update for a card applies the server's authoritative
    // quantity — which may be clamped or normalized, so trusting it fixes both the
    // "server clamp invisible to client" bug and post-resync divergence. While newer
    // updates are still outstanding, keep the optimistic value so the tile doesn't
    // flicker backward through the serialized responses.
    const authoritative = remaining <= 0;
    if (authoritative) delete pending[card.id];
    else pending[card.id] = remaining;
    return {
      ...state,
      pendingCardUpdates: pending,
      activeDeck: {
        ...state.activeDeck,
        cards: state.activeDeck.cards.map((c) =>
          c.id === card.id
            ? authoritative
              ? card
              : { ...card, quantity: c.quantity, quantityFoil: c.quantityFoil }
            : c,
        ),
      },
    };
  }),

  on(DeckActions.removeCardSuccess, (state, { cardId }) => {
    if (!state.activeDeck) return state;
    return {
      ...state,
      activeDeck: {
        ...state.activeDeck,
        cards: state.activeDeck.cards.filter((c) => c.id !== cardId),
      },
    };
  }),

  on(DeckActions.addCardFailure, (state, { error }) => ({ ...state, error })),
  on(DeckActions.updateCardFailure, (state, { error }) => ({ ...state, error })),
  on(DeckActions.removeCardFailure, (state, { error }) => ({ ...state, error })),
);
