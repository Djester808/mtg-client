import { DeckLegalityService } from './deck-legality.service';
import { CollectionCardDto, ManaColor } from '../models/game.models';
import { DeckDetailDto } from '../services/deck-api.service';
import { makeCard } from '../testing/test-factories';

function makeDeckCard(overrides: Partial<CollectionCardDto> = {}): CollectionCardDto {
  return {
    id: 'cc-1',
    oracleId: 'oracle-1',
    scryfallId: 'sf-1',
    quantity: 1,
    quantityFoil: 0,
    notes: null,
    board: 'main',
    addedAt: '2024-01-01',
    cardDetails: makeCard(),
    ...overrides,
  };
}

function makeDeck(cards: CollectionCardDto[], overrides: Partial<DeckDetailDto> = {}): DeckDetailDto {
  return {
    id: 'deck-1',
    name: 'Test Deck',
    coverUri: null,
    format: 'commander',
    commanderOracleId: null,
    tags: [],
    notes: null,
    isPublished: false,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    cards,
    ...overrides,
  } as DeckDetailDto;
}

describe('DeckLegalityService', () => {
  let svc: DeckLegalityService;
  beforeEach(() => (svc = new DeckLegalityService()));

  // ---- singleton ----------------------------------------------------

  it('flags a non-basic card appearing more than once by copies', () => {
    const deck = makeDeck([makeDeckCard({ id: 'a', oracleId: 'o', quantity: 2 })]);
    expect(svc.singletonViolations(deck).map((c) => c.id)).toEqual(['a']);
  });

  it('flags copies split across two printing rows of the same oracle id', () => {
    const deck = makeDeck([
      makeDeckCard({ id: 'a', oracleId: 'o', scryfallId: 's1', quantity: 1 }),
      makeDeckCard({ id: 'b', oracleId: 'o', scryfallId: 's2', quantity: 1 }),
    ]);
    expect(svc.singletonViolations(deck).map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('never flags basic lands', () => {
    const basic = makeDeckCard({
      id: 'plains',
      oracleId: 'plains',
      quantity: 30,
      cardDetails: makeCard({ name: 'Plains', supertypes: ['Basic'] }),
    });
    expect(svc.singletonViolations(makeDeck([basic]))).toHaveSize(0);
  });

  it('ignores side/maybe boards for singleton', () => {
    const deck = makeDeck([makeDeckCard({ id: 'a', oracleId: 'o', quantity: 2, board: 'side' })]);
    expect(svc.singletonViolations(deck)).toHaveSize(0);
  });

  // ---- color identity ----------------------------------------------

  it('flags cards outside the commander color identity', () => {
    const cmdr = makeDeckCard({
      id: 'cmdr',
      oracleId: 'cmdr-o',
      cardDetails: makeCard({ colorIdentity: [ManaColor.Red] }),
    });
    const offColor = makeDeckCard({
      id: 'x',
      oracleId: 'x-o',
      cardDetails: makeCard({ colorIdentity: [ManaColor.Blue] }),
    });
    const deck = makeDeck([cmdr, offColor], { commanderOracleId: 'cmdr-o' });
    expect(svc.colorIdentityViolations(deck).map((c) => c.id)).toEqual(['x']);
  });

  it('returns none when there is no commander', () => {
    const deck = makeDeck([makeDeckCard({ cardDetails: makeCard({ colorIdentity: [ManaColor.Blue] }) })]);
    expect(svc.colorIdentityViolations(deck)).toHaveSize(0);
  });

  // ---- banned / game changers --------------------------------------

  it('flags banned cards', () => {
    const deck = makeDeck([
      makeDeckCard({ id: 'b', cardDetails: makeCard({ legalities: { commander: 'banned' } }) }),
    ]);
    expect(svc.bannedInCommander(deck).map((c) => c.id)).toEqual(['b']);
  });

  it('collects game changers', () => {
    const deck = makeDeck([
      makeDeckCard({ id: 'gc', cardDetails: makeCard({ gameChanger: true }) }),
      makeDeckCard({ id: 'reg', cardDetails: makeCard({ gameChanger: false }) }),
    ]);
    expect(svc.gameChangerCards(deck).map((c) => c.id)).toEqual(['gc']);
  });

  // ---- card violation type/class -----------------------------------

  it('reports banned with highest priority, then both/singleton/color-id', () => {
    const cmdr = makeDeckCard({ id: 'cmdr', oracleId: 'cmdr-o', cardDetails: makeCard({ colorIdentity: [ManaColor.Red] }) });
    const both = makeDeckCard({
      id: 'both', oracleId: 'both-o', quantity: 2,
      cardDetails: makeCard({ colorIdentity: [ManaColor.Blue] }),
    });
    const deck = makeDeck([cmdr, both], { commanderOracleId: 'cmdr-o' });
    expect(svc.cardViolationType(both, deck)).toBe('both');
    expect(svc.cardViolationClass(both, deck)).toContain('violation-both');
  });

  it('returns null violation type outside commander format', () => {
    const deck = makeDeck([makeDeckCard({ quantity: 3 })], { format: 'standard' });
    expect(svc.cardViolationType(deck.cards[0], deck)).toBeNull();
  });

  // ---- format violations -------------------------------------------

  it('flags cards not legal in a non-commander format', () => {
    const deck = makeDeck(
      [makeDeckCard({ id: 'x', cardDetails: makeCard({ legalities: { modern: 'banned' } }) })],
      { format: 'modern' },
    );
    expect(svc.formatViolations(deck).map((c) => c.id)).toEqual(['x']);
  });

  // ---- brackets -----------------------------------------------------

  it('rates a game-changer-heavy deck as bracket 4', () => {
    const cards = Array.from({ length: 4 }, (_, i) =>
      makeDeckCard({ id: `gc${i}`, oracleId: `o${i}`, cardDetails: makeCard({ gameChanger: true }) }),
    );
    expect(svc.commanderBracket(makeDeck(cards))).toBe(4);
  });

  it('rates an extra-turn deck as bracket 2', () => {
    const deck = makeDeck([
      makeDeckCard({ id: 'et', cardDetails: makeCard({ oracleText: 'Take an extra turn after this one.' }) }),
    ]);
    expect(svc.commanderBracket(deck)).toBe(2);
  });

  it('rates a vanilla deck as bracket 1', () => {
    expect(svc.commanderBracket(makeDeck([makeDeckCard()]))).toBe(1);
  });

  // ---- misc ---------------------------------------------------------

  it('totalOracleCount sums copies per oracle id and board', () => {
    const deck = makeDeck([
      makeDeckCard({ id: 'a', oracleId: 'o', quantity: 1, scryfallId: 's1' }),
      makeDeckCard({ id: 'b', oracleId: 'o', quantity: 2, scryfallId: 's2' }),
    ]);
    expect(svc.totalOracleCount(deck.cards[0], deck)).toBe(3);
  });

  it('formatLabel maps known formats and upcases the rest', () => {
    expect(svc.formatLabel('commander')).toBe('CMDR');
    expect(svc.formatLabel('pauper')).toBe('PAU');
    expect(svc.formatLabel('weird')).toBe('WEIRD');
    expect(svc.formatLabel(null)).toBe('FORMAT');
  });

  it('caches by deck identity — same object returns the same arrays', () => {
    const deck = makeDeck([makeDeckCard({ quantity: 2 })]);
    expect(svc.singletonViolations(deck)).toBe(svc.singletonViolations(deck));
  });
});
