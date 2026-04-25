// Re-export enums and collection models so all existing import paths continue to work.
export * from './enums';
export * from './collection.models';

import { ManaColor, CounterType, StackObjectType, Phase, Step, GameResult, CardType } from './enums';

// ---- Card / Permanent DTOs --------------------------------

export interface RulingDto {
  source: string;
  publishedAt: string;
  comment: string;
}

export interface CardDto {
  cardId: string;
  oracleId: string;
  name: string;
  manaCost: string;         // e.g. "2WW"
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
  imageUriNormalBack: string | null;
  imageUriSmall: string | null;
  imageUriArtCrop: string | null;
  colorIdentity: ManaColor[];
  ownerId: string;
  flavorText: string | null;
  artist: string | null;
  setCode: string | null;
  legalities: Record<string, string>;
}

export interface PermanentDto {
  permanentId: string;
  sourceCard: CardDto;
  controllerId: string;
  isTapped: boolean;
  hasSummoningSickness: boolean;
  damageMarked: number;
  counters: Record<CounterType, number>;
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
  hand: CardDto[];           // only populated for the local player
  graveyard: CardDto[];      // public
  exile: CardDto[];          // public
  hasLandPlayedThisTurn: boolean;
}

export interface CombatStateDto {
  attackers: string[];                          // permanentIds
  attackersToBlockers: Record<string, string[]>; // attackerId -> blockerIds
  attackersDeclared: boolean;
  blockersDeclared: boolean;
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
