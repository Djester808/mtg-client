import { createActionGroup, emptyProps, props } from '@ngrx/store';
import {
  CollectionDto,
  CollectionDetailDto,
  CollectionCardDto,
  CreateCollectionRequest,
  AddCardToCollectionRequest,
  UpdateCollectionCardRequest,
  MoveCardRequest,
  MoveCardResultDto,
  MoveCardsResultDto,
  MergeCollectionsResultDto,
} from '../../models/game.models';

export const CollectionActions = createActionGroup({
  source: 'Collection',
  events: {
    // Load all
    'Load Collections': emptyProps(),
    'Load Collections Success': props<{ collections: CollectionDto[] }>(),
    'Load Collections Failure': props<{ error: string }>(),

    // Load one
    'Load Collection': props<{ id: string }>(),
    'Load Collection Success': props<{ collection: CollectionDetailDto }>(),
    'Load Collection Failure': props<{ error: string }>(),

    // Create
    'Create Collection': props<{ request: CreateCollectionRequest }>(),
    'Create Collection Success': props<{ collection: CollectionDetailDto }>(),
    'Create Collection Failure': props<{ error: string }>(),

    // Delete
    'Delete Collection': props<{ id: string }>(),
    'Delete Collection Success': props<{ id: string }>(),
    'Delete Collection Failure': props<{ error: string }>(),

    // Re-fetch the active collection without blanking it (resync after a failed
    // optimistic card mutation).
    'Refresh Collection': props<{ id: string }>(),

    // Update meta (name / cover)
    'Update Collection Meta': props<{
      id: string;
      name: string;
      description: string | null;
      coverUri: string | null;
    }>(),
    'Update Collection Meta Success': props<{ collection: CollectionDetailDto }>(),
    'Update Collection Meta Failure': props<{ error: string }>(),

    // Add card
    'Add Card': props<{ collectionId: string; request: AddCardToCollectionRequest }>(),
    'Add Card Success': props<{ card: CollectionCardDto }>(),
    'Add Card Failure': props<{ collectionId: string; error: string }>(),

    // Update card
    'Update Card': props<{
      collectionId: string;
      cardId: string;
      request: UpdateCollectionCardRequest;
    }>(),
    'Update Card Success': props<{ card: CollectionCardDto }>(),
    'Update Card Failure': props<{ collectionId: string; error: string }>(),

    // Remove card
    'Remove Card': props<{ collectionId: string; cardId: string }>(),
    'Remove Card Success': props<{ cardId: string }>(),
    'Remove Card Failure': props<{ collectionId: string; error: string }>(),

    // Move a card to another collection. `targetName` rides along only so the success
    // toast can name the destination without re-reading the store.
    'Move Card': props<{
      collectionId: string;
      cardId: string;
      request: MoveCardRequest;
      targetName: string;
    }>(),
    'Move Card Success': props<{
      collectionId: string;
      cardId: string;
      result: MoveCardResultDto;
      targetName: string;
    }>(),
    'Move Card Failure': props<{ collectionId: string; error: string }>(),

    // Move several cards at once (multi-select).
    'Move Cards': props<{
      collectionId: string;
      cardIds: string[];
      targetCollectionId: string;
      targetName: string;
    }>(),
    'Move Cards Success': props<{
      collectionId: string;
      result: MoveCardsResultDto;
      targetName: string;
    }>(),
    'Move Cards Failure': props<{ collectionId: string; error: string }>(),

    // Merge one collection into another.
    'Merge Collections': props<{
      targetCollectionId: string;
      sourceCollectionId: string;
      deleteSource: boolean;
      targetName: string;
    }>(),
    'Merge Collections Success': props<{
      sourceCollectionId: string;
      result: MergeCollectionsResultDto;
      targetName: string;
    }>(),
    'Merge Collections Failure': props<{ collectionId: string; error: string }>(),
  },
});
