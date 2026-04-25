import {
  CardDto, CardType, ManaColor, CounterType,
  PermanentDto, PlayerStateDto, GameStateDto,
  Phase, Step, GameResult,
} from '../models/game.models';

export function makeCard(overrides: Partial<CardDto> = {}): CardDto {
  return {
    cardId: 'card-1',
    oracleId: 'oracle-1',
    name: 'Test Creature',
    manaCost: '1G',
    manaValue: 2,
    cardTypes: [CardType.Creature],
    subtypes: ['Beast'],
    supertypes: [],
    oracleText: '',
    power: 2,
    toughness: 2,
    startingLoyalty: null,
    keywords: [],
    imageUriNormal: null,
    imageUriNormalBack: null,
    imageUriSmall: null,
    imageUriArtCrop: null,
    colorIdentity: [ManaColor.Green],
    ownerId: 'p1',
    flavorText: null,
    artist: null,
    setCode: null,
    legalities: {},
    ...overrides,
  };
}

export const emptyCounters: Record<CounterType, number> = {
  [CounterType.PlusOnePlusOne]:   0,
  [CounterType.MinusOneMinusOne]: 0,
  [CounterType.Loyalty]:          0,
  [CounterType.Charge]:           0,
  [CounterType.Poison]:           0,
};

export function makePermanent(overrides: Partial<PermanentDto> = {}): PermanentDto {
  return {
    permanentId: 'perm-1',
    sourceCard: makeCard(),
    controllerId: 'p1',
    isTapped: false,
    hasSummoningSickness: false,
    damageMarked: 0,
    counters: { ...emptyCounters },
    attachments: [],
    effectivePower: 2,
    effectiveToughness: 2,
    ...overrides,
  };
}

export function makePlayer(hand: CardDto[] = []): PlayerStateDto {
  return {
    playerId: 'p1',
    name: 'Alice',
    life: 20,
    poisonCounters: 0,
    manaPool: { amounts: {}, total: 0 },
    handCount: hand.length,
    libraryCount: 30,
    graveyardCount: 0,
    exileCount: 0,
    hand,
    graveyard: [],
    exile: [],
    hasLandPlayedThisTurn: false,
  };
}

export function makeGameState(result: GameResult = GameResult.InProgress): GameStateDto {
  return {
    gameId: 'game-1',
    players: [],
    battlefield: [],
    stack: [],
    turn: 1,
    activePlayerId: 'p1',
    priorityPlayerId: 'p1',
    currentPhase: Phase.PreCombatMain,
    currentStep: Step.Main,
    result,
    combat: null,
  };
}
