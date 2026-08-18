import { ForumPostSummary } from './forum.models';

/**
 * The API's profile contract, mirrored. The server half is `MtgEngine.Api/Dtos/ProfileDtos.cs`
 * and it is the definition — a field added there and not here is simply dropped on arrival.
 *
 * The split that matters: everything on `UserProfile` is public and served to anonymous
 * visitors. Anything about money lives on `MyProfile.privateStats`, which only the owner's
 * own endpoint returns.
 */

export interface ColorCount {
  color: string;
  deckCount: number;
}

export interface FormatCount {
  format: string;
  deckCount: number;
}

export interface ProfileStats {
  decksBuilt: number;
  decksPublished: number;
  collections: number;
  /** Total copies owned, foils included. */
  cardsOwned: number;
  distinctCards: number;
  commentsPosted: number;
  /** Comments other people left on this user's decks. */
  commentsReceived: number;
  colorSpread: ColorCount[];
  formats: FormatCount[];
  lastActiveAt: string | null;
}

export interface CommanderBrief {
  oracleId: string;
  name: string;
  imageUriArtCrop: string | null;
  colorIdentity: string[];
  deckCount: number;
}

export interface PlayedCard {
  oracleId: string;
  name: string;
  imageUriArtCrop: string | null;
  imageUriNormal: string | null;
  deckCount: number;
}

export interface ActiveDeck {
  deckId: string;
  name: string;
  coverUri: string | null;
  format: string | null;
  cardCount: number;
  updatedAt: string;
  /** Set when the deck is published, so the card can link to its forum post. */
  forumPostId: string | null;
}

export interface UserComment {
  commentId: string;
  forumPostId: string;
  deckId: string;
  deckName: string;
  content: string;
  createdAt: string;
  edited: boolean;
}

export interface UserCommentPage {
  total: number;
  page: number;
  pageSize: number;
  items: UserComment[];
}

export interface UserProfile {
  username: string;
  /** Self-chosen; fall back to `username` when null. */
  displayName: string | null;
  tagline: string | null;
  bio: string | null;
  favoriteFormat: string | null;
  /** Already carries a `v=` cache-buster; null means "render initials". */
  avatarUrl: string | null;
  joinedAt: string;
  deckCount: number;
  commentCount: number;
  stats: ProfileStats;
  favoriteCommander: CommanderBrief | null;
  topCommanders: CommanderBrief[];
  mostPlayedCards: PlayedCard[];
  topDecks: ForumPostSummary[];
  recentlyActive: ActiveDeck[];
  publishedDecks: ForumPostSummary[];
  recentComments: UserComment[];
}

export interface PlayerSummary {
  username: string;
  displayName: string | null;
  tagline: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  deckCount: number;
  commentCount: number;
}

/** Withheld from the public profile — see the DTO's remarks for why. */
export interface PrivateStats {
  collectionValueUsd: number;
  /** Copies that had a price; below `cardsOwned` when a printing has no listing. */
  copiesValued: number;
  unpublishedDecks: number;
}

export interface MyProfile {
  profile: UserProfile;
  email: string;
  privateStats: PrivateStats;
}

/** Every field optional; sending null or blank clears it. */
export interface UpdateProfileRequest {
  displayName: string | null;
  tagline: string | null;
  bio: string | null;
  favoriteFormat: string | null;
  favoriteCommanderOracleId: string | null;
}

export interface AvatarLimits {
  maxBytes: number;
  maxDimension: number;
  acceptedContentTypes: string[];
}
