import { createReducer, on } from '@ngrx/store';
import { CollectionCardDto } from '../../models/game.models';
import { DeckDto, DeckDetailDto } from '../../services/deck-api.service';
import { DeckActions } from './deck.actions';

export interface DeckState {
  decks: DeckDto[];
  activeDeck: DeckDetailDto | null;
  loading: boolean;
  error: string | null;
}

const initialState: DeckState = {
  decks: [],
  activeDeck: null,
  loading: false,
  error: null,
};

export const deckReducer = createReducer(
  initialState,

  on(DeckActions.loadDecks, state => ({ ...state, loading: true, error: null })),
  on(DeckActions.loadDecksSuccess, (state, { decks }) => ({ ...state, loading: false, decks })),
  on(DeckActions.loadDecksFailure, (state, { error }) => ({ ...state, loading: false, error })),

  on(DeckActions.loadDeck, state => ({ ...state, loading: true, error: null, activeDeck: null })),
  on(DeckActions.loadDeckSuccess, (state, { deck }) => ({ ...state, loading: false, activeDeck: deck })),
  on(DeckActions.loadDeckFailure, (state, { error }) => ({ ...state, loading: false, error })),

  on(DeckActions.createDeckSuccess, (state, { deck }) => ({
    ...state,
    decks: [...state.decks, {
      id: deck.id,
      name: deck.name,
      coverUri: deck.coverUri,
      cardCount: 0,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
      format: deck.format ?? null,
      commanderOracleId: deck.commanderOracleId ?? null,
    }],
  })),

  on(DeckActions.updateDeckMeta, (state, { id, name, coverUri, format, commanderOracleId }) => ({
    ...state,
    decks: state.decks.map(d => d.id === id
      ? { ...d, name, coverUri, format, commanderOracleId }
      : d
    ),
    activeDeck: state.activeDeck?.id === id
      ? { ...state.activeDeck, name, coverUri, format, commanderOracleId }
      : state.activeDeck,
  })),

  on(DeckActions.updateDeckMetaSuccess, (state, { deck }) => ({
    ...state,
    decks: state.decks.map(d => d.id === deck.id
      ? { ...d, name: deck.name, coverUri: deck.coverUri, format: deck.format, commanderOracleId: deck.commanderOracleId }
      : d
    ),
    activeDeck: state.activeDeck?.id === deck.id
      ? { ...state.activeDeck, name: deck.name, coverUri: deck.coverUri, format: deck.format, commanderOracleId: deck.commanderOracleId }
      : state.activeDeck,
  })),

  on(DeckActions.deleteDeckSuccess, (state, { id }) => ({
    ...state,
    decks: state.decks.filter(d => d.id !== id),
  })),

  on(DeckActions.addCardSuccess, (state, { card }) => {
    if (!state.activeDeck) return state;
    const idx = state.activeDeck.cards.findIndex(c => c.id === card.id);
    const cards = idx >= 0
      ? state.activeDeck.cards.map((c, i) => i === idx ? card : c)
      : [...state.activeDeck.cards, card];
    return { ...state, activeDeck: { ...state.activeDeck, cards } };
  }),

  on(DeckActions.updateCardSuccess, (state, { card }) => {
    if (!state.activeDeck) return state;
    return {
      ...state,
      activeDeck: {
        ...state.activeDeck,
        cards: state.activeDeck.cards.map(c => c.id === card.id ? card : c),
      },
    };
  }),

  on(DeckActions.removeCardSuccess, (state, { cardId }) => {
    if (!state.activeDeck) return state;
    return {
      ...state,
      activeDeck: {
        ...state.activeDeck,
        cards: state.activeDeck.cards.filter(c => c.id !== cardId),
      },
    };
  }),

  on(DeckActions.addCardFailure, (state, { error }) => ({ ...state, error })),
  on(DeckActions.updateCardFailure, (state, { error }) => ({ ...state, error })),
  on(DeckActions.removeCardFailure, (state, { error }) => ({ ...state, error })),
);
