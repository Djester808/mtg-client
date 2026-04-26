import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { CollectionCardDto, AddCardToCollectionRequest, UpdateCollectionCardRequest } from '../../models/game.models';
import { DeckDto, DeckDetailDto } from '../../services/deck-api.service';

export const DeckActions = createActionGroup({
  source: 'Deck',
  events: {
    // Load all
    'Load Decks':         emptyProps(),
    'Load Decks Success': props<{ decks: DeckDto[] }>(),
    'Load Decks Failure': props<{ error: string }>(),

    // Load one
    'Load Deck':         props<{ id: string }>(),
    'Load Deck Success': props<{ deck: DeckDetailDto }>(),
    'Load Deck Failure': props<{ error: string }>(),

    // Create
    'Create Deck':         props<{ name: string; coverUri: string | null }>(),
    'Create Deck Success': props<{ deck: DeckDetailDto }>(),
    'Create Deck Failure': props<{ error: string }>(),

    // Update meta (name / cover / format / commander)
    'Update Deck Meta':         props<{ id: string; name: string; coverUri: string | null; format: string | null; commanderOracleId: string | null }>(),
    'Update Deck Meta Success': props<{ deck: DeckDetailDto }>(),
    'Update Deck Meta Failure': props<{ error: string }>(),

    // Delete
    'Delete Deck':         props<{ id: string }>(),
    'Delete Deck Success': props<{ id: string }>(),

    // Add card
    'Add Card':         props<{ deckId: string; request: AddCardToCollectionRequest }>(),
    'Add Card Success': props<{ card: CollectionCardDto }>(),
    'Add Card Failure': props<{ error: string }>(),

    // Update card
    'Update Card':         props<{ deckId: string; cardId: string; request: UpdateCollectionCardRequest }>(),
    'Update Card Success': props<{ card: CollectionCardDto }>(),
    'Update Card Failure': props<{ error: string }>(),

    // Remove card
    'Remove Card':         props<{ deckId: string; cardId: string }>(),
    'Remove Card Success': props<{ cardId: string }>(),
    'Remove Card Failure': props<{ error: string }>(),
  },
});
