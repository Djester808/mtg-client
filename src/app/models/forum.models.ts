import { CollectionCardDto } from './game.models';

export interface ForumPostSummary {
  id: string;
  deckId: string;
  authorUsername: string;
  deckName: string;
  deckCoverUri: string | null;
  deckFormat: string | null;
  description: string | null;
  colorIdentity: string[];
  cardCount: number;
  commentCount: number;
  publishedAt: string;
}

export interface ForumPostDetail {
  id: string;
  deckId: string;
  authorId: string;
  authorUsername: string;
  deckName: string;
  deckCoverUri: string | null;
  deckFormat: string | null;
  commanderOracleId: string | null;
  description: string | null;
  colorIdentity: string[];
  publishedAt: string;
  updatedAt: string;
  cards: CollectionCardDto[];
  comments: ForumComment[];
}

export interface ForumComment {
  id: string;
  authorId: string;
  authorUsername: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
