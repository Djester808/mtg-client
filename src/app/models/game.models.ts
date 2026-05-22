// Re-export enums and collection models so all existing import paths continue to work.
export * from './enums';
export * from './collection.models';

import { ManaColor, CardType } from './enums';

export interface RulingDto {
  source: string;
  publishedAt: string;
  comment: string;
}

export interface SetSummaryDto {
  code: string;
  name: string;
  cardCount: number;
}

export interface CardDto {
  cardId: string;
  oracleId: string;
  name: string;
  manaCost: string;
  manaValue: number;
  cardTypes: CardType[];
  subtypes: string[];
  supertypes: string[];
  oracleText: string;
  power: number | null;
  toughness: number | null;
  startingLoyalty: number | null;
  keywords: string[];
  imageUriNormal: string | null;
  imageUriLarge: string | null;
  imageUriNormalBack: string | null;
  imageUriSmall: string | null;
  imageUriArtCrop: string | null;
  colorIdentity: ManaColor[];
  ownerId: string;
  flavorText: string | null;
  artist: string | null;
  setCode: string | null;
  rarity: string | null;
  legalities: Record<string, string>;
  gameChanger: boolean;
}
