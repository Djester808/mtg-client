import { CardDto } from './game.models';

export interface CommanderSummary {
  oracleId: string;
  name: string;
  imageUri: string | null;
  imageUriArtCrop: string | null;
  colorIdentity: string[];
  manaCost: string | null;
  deckCount: number;
  rank: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface CommanderProfile extends CommanderSummary {
  oracleText: string | null;
  topTags: TagCount[];
}

export interface CommanderCardEntry {
  card: CardDto;
  deckCount: number;
  totalDecks: number;
  inclusionPercent: number;
  isGameChanger: boolean;
}

export interface CommanderCards {
  totalDecks: number;
  cards: CommanderCardEntry[];
}

export interface CommanderHistoryPoint {
  month: string;
  deckCount: number;
}

export interface SimilarCommander {
  oracleId: string;
  name: string;
  imageUri: string | null;
  imageUriArtCrop: string | null;
  colorIdentity: string[];
  deckCount: number;
  sharedCards: number;
  rank: number;
}

export interface CommanderDeck {
  forumPostId: string;
  deckId: string;
  name: string;
  description: string | null;
  authorUsername: string;
  publishedAt: string;
  cardCount: number;
  bracket: number;
  tags: string[];
  colorIdentity: string[];
}
