import { CardDto, CardType, ManaColor } from '../models/game.models';

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
    imageUriLarge: null,
    imageUriNormalBack: null,
    imageUriSmall: null,
    imageUriArtCrop: null,
    colorIdentity: [ManaColor.Green],
    ownerId: 'p1',
    flavorText: null,
    artist: null,
    setCode: null,
    rarity: null,
    legalities: {},
    gameChanger: false,
    ...overrides,
  };
}
