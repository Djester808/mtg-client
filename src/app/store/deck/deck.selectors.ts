import { createSelector } from '@ngrx/store';
import { AppState } from '..';
import { DeckState } from './deck.reducer';

const selectDeckState = (state: AppState) => state.deck as DeckState;

export const selectDecks = createSelector(selectDeckState, s => s.decks);
export const selectActiveDeck = createSelector(selectDeckState, s => s.activeDeck);
export const selectDeckLoading = createSelector(selectDeckState, s => s.loading);
export const selectDeckError = createSelector(selectDeckState, s => s.error);
