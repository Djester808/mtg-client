// Re-export enums and collection models so all existing import paths continue to work.
export * from './enums';
export * from './collection.models';

import {
  ManaColor,
  CounterType,
  StackObjectType,
  Phase,
  Step,
  GameResult,
  CardType,
} from './enums';
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
  /**
   * Whether casting this asks the caster for a number first (CR 601.2b). Only a card in a game
   * has one — optional, because every other producer of a `CardDto` is a card database and not
   * a rules engine, and a required field would be a lie in all of them.
   */
  announcesVariable?: boolean;
}

// ---- Game state ---------------------------------------------------------------
//
// Restored exactly as they were before the engine UI was removed in 0bb19e9. These are
// the shapes the board, the lobby and the NgRx game slice are written against.

/** One thing a permanent can be asked to do (CR 602.1). */
export interface PermanentAbilityDto {
  id: string;
  text: string;
  requiresTap: boolean;
  targetCount: number;
  isManaAbility: boolean;
  /** Whether its cost asks the player for a number before it is activated (CR 601.2b). */
  announcesVariable: boolean;
}

export interface PermanentDto {
  permanentId: string;
  /**
   * What this permanent can be asked to do.
   *
   * The board used to assume: the only ability it could reach was one called "mana", and only
   * on a land. That made a Sol Ring untappable and a Prodigal Pyromancer unplayable — both
   * abilities existed in the engine and neither had a way in.
   */
  abilities: PermanentAbilityDto[];
  sourceCard: CardDto;
  controllerId: string;
  isTapped: boolean;
  hasSummoningSickness: boolean;
  damageMarked: number;
  counters: Record<CounterType, number>;
  /**
   * The names of the Auras and Equipment attached to this permanent (CR 303.4, 704.5m).
   *
   * Names rather than ids: the board's only use for this is a label under the card, and every
   * consumer that would want the object itself can already find it on the battlefield by name.
   */
  attachments: string[];
  effectivePower: number | null;
  effectiveToughness: number | null;
}

// ---- Stack DTOs -------------------------------------------

export interface StackObjectDto {
  stackObjectId: string;
  type: StackObjectType;
  controllerId: string;
  description: string;
  sourceCardName: string;
  targets: TargetDto[];
}

export interface TargetDto {
  type: 'Permanent' | 'Player' | 'Card' | 'StackObject';
  id: string;
}

// ---- Player / Game State DTOs -----------------------------

export interface ManaPoolDto {
  amounts: Partial<Record<ManaColor, number>>;
  total: number;
}

export interface PlayerStateDto {
  playerId: string;
  name: string;
  life: number;
  poisonCounters: number;
  manaPool: ManaPoolDto;
  handCount: number;
  libraryCount: number;
  graveyardCount: number;
  exileCount: number;
  hand: CardDto[]; // only populated for the local player
  graveyard: CardDto[]; // public
  exile: CardDto[]; // public
  hasLandPlayedThisTurn: boolean;
  /**
   * Combat damage this player has taken from each commander, by the commander's name
   * (CR 903.10a). Public: everyone at the table needs to know how close a commander is to
   * twenty-one, because it changes every block.
   */
  commanderDamage: Record<string, number>;
  /** This player's commander, if the game has them (CR 903.3). */
  commanderName: string | null;
  /** Whether this player has lost (CR 104.3). */
  hasLost: boolean;
}

export interface CombatStateDto {
  attackers: string[]; // permanentIds
  attackersToBlockers: Record<string, string[]>; // attackerId -> blockerIds
  attackersDeclared: boolean;
  blockersDeclared: boolean;
}

/**
 * A decision the game has stopped for.
 *
 * The engine this board was written against never asked anything — it resolved everything
 * itself, which is part of why it was wrong. The rebuilt one stops and asks: whether to keep an
 * opening hand (CR 103.4), how to divide combat damage among blockers (CR 510.1c), what order
 * to put simultaneous triggers on the stack (CR 603.3b).
 *
 * `options` is filled in only for the player being asked, because the options can themselves be
 * hidden information — bottoming after a mulligan lists that player's hand. Everyone else is
 * told the game is waiting and on whom, which is the difference between a board that has
 * stopped and a board that has frozen.
 */
export interface ChoiceDto {
  id: string;
  playerId: string;
  kind: string;
  prompt: string;
  minPicks: number;
  maxPicks: number;
  /** True when the order of the picks is the answer (CR 603.3b, 616.1). */
  isOrdering: boolean;
  /** True when the answer is an amount per option rather than a selection (CR 510.1c). */
  isDivision: boolean;
  /** How much is being divided, for a division. */
  totalToDivide: number;
  options: { id: string; label: string }[] | null;
}

export interface GameStateDto {
  gameId: string;
  players: PlayerStateDto[];
  battlefield: PermanentDto[];
  stack: StackObjectDto[];
  turn: number;
  activePlayerId: string;
  priorityPlayerId: string;
  currentPhase: Phase;
  currentStep: Step;
  result: GameResult;
  combat: CombatStateDto | null;
  /** Set while the game is waiting on a decision; nothing else may happen until it is made. */
  choice: ChoiceDto | null;
}

// ---- SignalR message shapes --------------------------------

export interface GameStateDiffDto {
  changedPermanents: PermanentDto[];
  removedPermanentIds: string[];
  stack: StackObjectDto[];
  priorityPlayerId: string;
  currentPhase: Phase;
  currentStep: Step;
  playerUpdates: Partial<PlayerStateDto>[];
  result: GameResult;
  combat: CombatStateDto | null;
}
