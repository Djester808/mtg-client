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
  cardDetails: CardDto | null;
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

export interface PrintingDto {
  scryfallId: string;
  setCode: string;
  setName: string;
  collectorNumber: string | null;
  imageUriSmall: string | null;
  imageUriNormal: string | null;
  imageUriNormalBack: string | null;
  oracleText: string | null;
  flavorText: string | null;
  artist: string | null;
  manaCost: string | null;
}

export interface SetSummaryDto {
  code: string;
  name: string;
  cardCount: number;
}
