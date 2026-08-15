// Re-export enums and collection models so all existing import paths continue to work.
export * from './enums';
export * from './collection.models';

import { ManaColor, CardType } from './enums';
import { CardPricesDto } from './collection.models';

export interface RulingDto {
  source: string;
  publishedAt: string;
  comment: string;
}

export interface CandidateCardDto {
  card: CardDto;
  scryfallId: string | null;
  /** Set of the printing shown, preferring the set being browsed over the oldest one. */
  setCode: string | null;
  setName: string | null;
  /**
   * Synergy score, present only when the pool was ranked by it. Rendering this rather than
   * fetching scores separately is what keeps the displayed number and the sort order the
   * same number.
   */
  score: number | null;
}

/** A page of the browsable candidate pool; `total` is the unpaged match count. */
export interface CandidatePoolDto {
  total: number;
  cards: CandidateCardDto[];
}

export interface SetSummaryDto {
  code: string;
  name: string;
  cardCount: number;
  /** ISO date, or null for the few sets with no dated printing. Server returns newest first. */
  releasedAt: string | null;
}

/** An AI fit assessment of a card for a commander deck: 0–100 plus the reasoning. */
export interface SynergyScore {
  score: number;
  reason: string;
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
  /** Prices of the printing this card object reflects; optional for pre-prices literals. */
  prices?: CardPricesDto | null;
}
