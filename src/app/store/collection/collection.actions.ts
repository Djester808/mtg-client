import { createActionGroup, emptyProps, props } from '@ngrx/store';
import {
  CollectionDto,
  CollectionDetailDto,
  CollectionCardDto,
  CreateCollectionRequest,
  AddCardToCollectionRequest,
  UpdateCollectionCardRequest,
} from '../../models/game.models';

export const CollectionActions = createActionGroup({
  source: 'Collection',
  events: {
    // Load all
    'Load Collections':         emptyProps(),
    'Load Collections Success': props<{ collections: CollectionDto[] }>(),
    'Load Collections Failure': props<{ error: string }>(),

    // Load one
    'Load Collection':         props<{ id: string }>(),
    'Load Collection Success': props<{ collection: CollectionDetailDto }>(),
    'Load Collection Failure': props<{ error: string }>(),

    // Create
    'Create Collection':         props<{ request: CreateCollectionRequest }>(),
    'Create Collection Success': props<{ collection: CollectionDetailDto }>(),
    'Create Collection Failure': props<{ error: string }>(),

    // Delete
    'Delete Collection':         props<{ id: string }>(),
    'Delete Collection Success': props<{ id: string }>(),

    // Add card
    'Add Card':         props<{ collectionId: string; request: AddCardToCollectionRequest }>(),
    'Add Card Success': props<{ card: CollectionCardDto }>(),
    'Add Card Failure': props<{ error: string }>(),

    // Update card
    'Update Card':         props<{ collectionId: string; cardId: string; request: UpdateCollectionCardRequest }>(),
    'Update Card Success': props<{ card: CollectionCardDto }>(),
    'Update Card Failure': props<{ error: string }>(),

    // Remove card
    'Remove Card':         props<{ collectionId: string; cardId: string }>(),
    'Remove Card Success': props<{ cardId: string }>(),
    'Remove Card Failure': props<{ error: string }>(),
  },
});
