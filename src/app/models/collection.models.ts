import { CardDto } from './game.models';

export interface CollectionDto {
  id: string;
  name: string;
  description: string | null;
  coverUri: string | null;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionCardDto {
  id: string;
  oracleId: string;
  scryfallId: string | null;
  quantity: number;
  quantityFoil: number;
  notes: string | null;
  board?: string;
  addedAt: string;
  /** Market price when this entry was created; null for entries predating price tracking. */
  priceUsdAtAdd?: number | null;
  priceUsdFoilAtAdd?: number | null;
  cardDetails: CardDto | null;
}

/** Moves copies of one card row to another collection; omit quantities to move it whole. */
export interface MoveCardRequest {
  targetCollectionId: string;
  quantity?: number | null;
  quantityFoil?: number | null;
}

export interface MoveCardResultDto {
  /** The destination row after the moved copies were folded in. */
  target: CollectionCardDto;
  /** What is left in the source, or null when the row moved whole. */
  sourceRemainder: CollectionCardDto | null;
}

/** Moves several whole card rows at once. */
export interface MoveCardsRequest {
  targetCollectionId: string;
  cardIds: string[];
}

export interface MoveCardsResultDto {
  cardsMoved: number;
  cardsFolded: number;
  copiesTransferred: number;
  /** Source rows that no longer exist, so the view can drop them. */
  removedCardIds: string[];
}

export interface MergeCollectionsRequest {
  sourceCollectionId: string;
  deleteSource?: boolean;
}

export interface MergeCollectionsResultDto {
  cardsMoved: number;
  cardsFolded: number;
  copiesTransferred: number;
  sourceDeleted: boolean;
  target: CollectionDetailDto;
}

/**
 * What can happen to a card in a collection. Mirrors the API's
 * `CollectionCardEventType`, which serializes as its name, not an ordinal.
 */
export type CardHistoryEventType =
  | 'Added'
  | 'QuantityChanged'
  | 'PrintingChanged'
  | 'Removed'
  | 'MovedOut'
  | 'MovedIn';

/**
 * One entry in the card modal's History tab.
 *
 * Every name here is the value recorded when the event happened, not resolved now — a
 * collection can be renamed or deleted, and the history has to keep reading correctly
 * either way. `setCode` is only populated for events where the server already had the
 * card definition in hand (the add path), so treat null as "not recorded", not "unknown
 * printing".
 */
export interface CardHistoryEntryDto {
  id: string;
  eventType: CardHistoryEventType;
  collectionId: string;
  collectionName: string;
  isDeck: boolean;
  board: string;
  scryfallId: string | null;
  setCode: string | null;
  quantityDelta: number;
  quantityFoilDelta: number;
  quantityAfter: number;
  quantityFoilAfter: number;
  counterpartCollectionId: string | null;
  /** The other collection in a transfer; null for everything else. */
  counterpartCollectionName: string | null;
  priceUsd: number | null;
  createdAt: string;
}

/** One day's prices for a printing, from the price-history endpoint. */
export interface PricePointDto {
  date: string;
  usd: number | null;
  usdFoil: number | null;
  eur: number | null;
  tix: number | null;
}

export interface CollectionDetailDto {
  id: string;
  name: string;
  description: string | null;
  coverUri: string | null;
  createdAt: string;
  updatedAt: string;
  cards: CollectionCardDto[];
}

export interface CreateCollectionRequest {
  name: string;
  description?: string | null;
}

export interface UpdateCollectionRequest {
  name: string;
  description?: string | null;
  coverUri?: string | null;
}

export interface AddCardToCollectionRequest {
  oracleId: string;
  scryfallId?: string | null;
  quantity?: number;
  quantityFoil?: number;
  notes?: string | null;
  board?: string;
}

export interface UpdateCollectionCardRequest {
  quantity: number;
  quantityFoil: number;
  scryfallId?: string | null;
  notes?: string | null;
}

/**
 * Scryfall's daily market prices for one printing (USD TCGplayer, EUR Cardmarket,
 * tix Cardhoarder). A null field means no listing for that finish, not zero.
 */
export interface CardPricesDto {
  usd: number | null;
  usdFoil: number | null;
  usdEtched: number | null;
  eur: number | null;
  eurFoil: number | null;
  tix: number | null;
  /** TCGplayer product id → tcgplayer.com/product/{id}. */
  tcgplayerId: number | null;
  /** Cardmarket product id (no stable public URL; unused for links). */
  cardmarketId: number | null;
  /** MTGO catalog id → cardhoarder.com/cards/{id}. */
  mtgoId: number | null;
}

export interface PrintingDto {
  scryfallId: string;
  setCode: string;
  setName: string;
  collectorNumber: string | null;
  imageUriSmall: string | null;
  imageUriNormal: string | null;
  imageUriLarge: string | null;
  imageUriNormalBack: string | null;
  oracleText: string | null;
  flavorText: string | null;
  artist: string | null;
  manaCost: string | null;
  /** Optional so object literals predating prices (tests, factories) stay valid. */
  prices?: CardPricesDto | null;
}

// SetSummaryDto lives in game.models.ts. A second, narrower copy here used to shadow
// it through game.models' re-export — which shape you got depended on the import path.
