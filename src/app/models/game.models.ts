// ============================================================
// MTG Engine — Domain Models (mirrors C# MtgEngine.Domain)
// ============================================================

// ---- Enums ------------------------------------------------

export enum ManaColor {
  Colorless = 'C',
  White     = 'W',
  Blue      = 'U',
  Black     = 'B',
  Red       = 'R',
  Green     = 'G',
}

export enum CardType {
  Creature     = 'Creature',
  Instant      = 'Instant',
  Sorcery      = 'Sorcery',
  Enchantment  = 'Enchantment',
  Artifact     = 'Artifact',
  Land         = 'Land',
  Planeswalker = 'Planeswalker',
}

export enum Phase {
  Beginning      = 'Beginning',
  PreCombatMain  = 'PreCombatMain',
  Combat         = 'Combat',
  PostCombatMain = 'PostCombatMain',
  Ending         = 'Ending',
}

export enum Step {
  Untap              = 'Untap',
  Upkeep             = 'Upkeep',
  Draw               = 'Draw',
  Main               = 'Main',
  BeginningOfCombat  = 'BeginningOfCombat',
  DeclareAttackers   = 'DeclareAttackers',
  DeclareBlockers    = 'DeclareBlockers',
  FirstStrikeDamage  = 'FirstStrikeDamage',
  CombatDamage       = 'CombatDamage',
  EndOfCombat        = 'EndOfCombat',
  End                = 'End',
  Cleanup            = 'Cleanup',
}

export enum GameResult {
  InProgress  = 'InProgress',
  Player1Wins = 'Player1Wins',
  Player2Wins = 'Player2Wins',
  Draw        = 'Draw',
}

export enum StackObjectType {
  Spell            = 'Spell',
  ActivatedAbility = 'ActivatedAbility',
  TriggeredAbility = 'TriggeredAbility',
}

export enum ZoneName {
  Library    = 'Library',
  Hand       = 'Hand',
  Battlefield= 'Battlefield',
  Graveyard  = 'Graveyard',
  Exile      = 'Exile',
  Stack      = 'Stack',
}

export enum CounterType {
  PlusOnePlusOne   = 'PlusOnePlusOne',
  MinusOneMinusOne = 'MinusOneMinusOne',
  Loyalty          = 'Loyalty',
  Charge           = 'Charge',
  Poison           = 'Poison',
}

// ---- Card / Permanent DTOs --------------------------------

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
  imageUriSmall: string | null;
  imageUriArtCrop: string | null;
  colorIdentity: ManaColor[];
  ownerId: string;
  flavorText: string | null;
  artist: string | null;
  setCode: string | null;
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

// ---- UI-only models (not from server) ---------------------

export type CardZone = 'hand' | 'battlefield' | 'graveyard' | 'exile';

export interface CardDisplayState {
  permanentId?: string;
  card: CardDto;
  zone: CardZone;
  isTapped: boolean;
  isAttacking: boolean;
  isBlocking: boolean;
  isSelected: boolean;
  isTargeted: boolean;
  counters: Record<string, number>;
  effectivePower: number | null;
  effectiveToughness: number | null;
  damageMarked: number;
}
