import { CardGridFilterService, CardGroupMode } from './card-grid-filter.service';
import { CardFilterState, EMPTY_FILTER } from '../models/card-filters';
import { CollectionCardDto, CardType, ManaColor } from '../models/game.models';

function card(over: Partial<CollectionCardDto> = {}, details: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    oracleId: 'o1',
    scryfallId: 's1',
    quantity: 1,
    quantityFoil: 0,
    notes: null,
    addedAt: '',
    ...over,
    cardDetails:
      details === null
        ? null
        : ({
            name: 'Card',
            colorIdentity: [],
            cardTypes: [],
            manaValue: 0,
            setCode: 'aaa',
            ...details,
          } as never),
  } as CollectionCardDto;
}

function state(over: Partial<CardFilterState> = {}): CardFilterState {
  return { ...EMPTY_FILTER, ...over };
}

/** Section labels in order — what a grid's headings read as. */
function labels(svc: CardGridFilterService, cards: CollectionCardDto[], mode: CardGroupMode) {
  return svc.sections(cards, mode).map((s) => s.label);
}

describe('CardGridFilterService', () => {
  let svc: CardGridFilterService;
  beforeEach(() => (svc = new CardGridFilterService()));

  // ---- matches ---------------------------------------------------

  it('matches everything when no filter is set', () => {
    expect(svc.matches(card(), state())).toBeTrue();
  });

  it('filters by name and by oracle id', () => {
    const c = card({ oracleId: 'abc-123' }, { name: 'Llanowar Elves' });
    expect(svc.matches(c, state({ query: 'llanowar' }))).toBeTrue();
    expect(svc.matches(c, state({ query: 'ABC-1' }))).toBeTrue();
    expect(svc.matches(c, state({ query: 'goblin' }))).toBeFalse();
  });

  it('treats multicolor as a cardinality question, not a membership one', () => {
    const mono = card({}, { colorIdentity: ['G'] });
    const gold = card({}, { colorIdentity: ['G', 'W'] });
    const s = state({ colors: new Set(['M']) });
    expect(svc.matches(mono, s)).toBeFalse();
    expect(svc.matches(gold, s)).toBeTrue();
  });

  it('treats colorless as identity-empty', () => {
    const s = state({ colors: new Set(['C']) });
    expect(svc.matches(card({}, { colorIdentity: [] }), s)).toBeTrue();
    expect(svc.matches(card({}, { colorIdentity: ['U'] }), s)).toBeFalse();
  });

  // Replaces an earlier test named "matches any selected color, not all of them", which
  // pinned the behaviour this filter was reported for: picking Red listed every Boros,
  // Grixis and five-colour card that merely contained red. The rule is now "within these
  // colours" — see utils/color-filter.ts, which owns it for every screen.
  it('matches only cards whose whole identity fits inside the selection', () => {
    const s = state({ colors: new Set(['R', 'G']) });
    expect(svc.matches(card({}, { colorIdentity: ['G'] }), s)).toBeTrue();
    expect(svc.matches(card({}, { colorIdentity: ['R', 'G'] }), s)).toBeTrue();
    // The regression: red *and something you did not ask for*.
    expect(svc.matches(card({}, { colorIdentity: ['R', 'U'] }), s)).toBeFalse();
    expect(svc.matches(card({}, { colorIdentity: ['U'] }), s)).toBeFalse();
  });

  it('a single colour means mono-coloured, not "contains that colour"', () => {
    const s = state({ colors: new Set(['R']) });
    expect(svc.matches(card({}, { colorIdentity: ['R'] }), s)).toBeTrue();
    expect(svc.matches(card({}, { colorIdentity: ['R', 'W'] }), s)).toBeFalse();
    expect(svc.matches(card({}, { colorIdentity: ['W', 'U', 'B', 'R', 'G'] }), s)).toBeFalse();
    // Colourless is its own pip, so it does not ride along with a colour selection.
    expect(svc.matches(card({}, { colorIdentity: [] }), s)).toBeFalse();
  });

  it('matches any selected type', () => {
    const s = state({ types: new Set(['Creature']) });
    expect(svc.matches(card({}, { cardTypes: ['Creature'] }), s)).toBeTrue();
    expect(svc.matches(card({}, { cardTypes: ['Instant'] }), s)).toBeFalse();
  });

  it('matches any selected rarity, and never a printing with none recorded', () => {
    const s = state({ rarities: new Set(['rare', 'mythic']) });
    expect(svc.matches(card({}, { rarity: 'mythic' }), s)).toBeTrue();
    expect(svc.matches(card({}, { rarity: 'common' }), s)).toBeFalse();
    expect(svc.matches(card({}, { rarity: null }), s)).toBeFalse();
  });

  it('re-runs the filter when only the rarity changes', () => {
    const cards = [card({}, { rarity: 'rare' })];
    const first = svc.apply(cards, state());
    expect(svc.apply(cards, state({ rarities: new Set(['rare']) }))).not.toBe(first);
  });

  it('treats 6+ as an open-ended CMC band', () => {
    expect(svc.matches(card({}, { manaValue: 7 }), state({ cmc: '6+' }))).toBeTrue();
    expect(svc.matches(card({}, { manaValue: 5 }), state({ cmc: '6+' }))).toBeFalse();
    expect(svc.matches(card({}, { manaValue: 0 }), state({ cmc: '0' }))).toBeTrue();
  });

  it('filters by set, case-insensitively', () => {
    const c = card({}, { setCode: 'DBL' });
    expect(svc.matches(c, state({ set: 'dbl' }))).toBeTrue();
    expect(svc.matches(c, state({ set: 'vow' }))).toBeFalse();
  });

  // ---- apply -----------------------------------------------------

  it('sorts by name, and honours direction', () => {
    const cards = [card({ id: 'b' }, { name: 'Beta' }), card({ id: 'a' }, { name: 'Alpha' })];
    expect(svc.apply(cards, state()).map((c) => c.id)).toEqual(['a', 'b']);
    expect(svc.apply(cards, state({ sortDir: 'desc' })).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('sorts by cmc and falls back to name within a cost', () => {
    const cards = [
      card({ id: 'x' }, { name: 'Zed', manaValue: 1 }),
      card({ id: 'y' }, { name: 'Ann', manaValue: 1 }),
      card({ id: 'z' }, { name: 'Mid', manaValue: 0 }),
    ];
    expect(svc.apply(cards, state({ sort: 'cmc' })).map((c) => c.id)).toEqual(['z', 'y', 'x']);
  });

  it('memoizes on cards identity and state, and rebuilds when either changes', () => {
    const cards = [card()];
    const first = svc.apply(cards, state());
    expect(svc.apply(cards, state())).toBe(first);
    expect(svc.apply(cards, state({ sortDir: 'desc' }))).not.toBe(first);
  });

  it("does not mutate the caller's array while sorting", () => {
    const cards = [card({ id: 'b' }, { name: 'Beta' }), card({ id: 'a' }, { name: 'Alpha' })];
    svc.apply(cards, state());
    expect(cards.map((c) => c.id)).toEqual(['b', 'a']);
  });

  // ---- group -----------------------------------------------------

  it('folds copies of one card across sets into a single row with summed totals', () => {
    const cards = [
      card({ id: 'r1', scryfallId: 'a', quantity: 1 }),
      card({ id: 'r2', scryfallId: 'b', quantity: 2, quantityFoil: 1 }),
    ];
    const { rows, members } = svc.group(cards, new Map());
    expect(rows.length).toBe(1);
    expect(rows[0].quantity).toBe(3);
    expect(rows[0].quantityFoil).toBe(1);
    expect(members.get('o1')!.length).toBe(2);
  });

  it('keeps the original row object when a card has only one printing', () => {
    // Identity matters: trackBy keys on it, so a copy would churn the tile's DOM.
    const only = card();
    expect(svc.group([only], new Map()).rows[0]).toBe(only);
  });

  it('displays the chosen member without changing the totals', () => {
    const cards = [
      card({ id: 'r1', scryfallId: 'a', quantity: 1 }),
      card({ id: 'r2', scryfallId: 'b', quantity: 2 }),
    ];
    const picked = svc.group(cards, new Map([['o1', 'r2']])).rows[0];
    expect(picked.id).toBe('r2');
    expect(picked.quantity).toBe(3);
  });

  it('groups unrelated cards separately', () => {
    const cards = [card({ id: 'r1' }), card({ id: 'r2', oracleId: 'o2' })];
    expect(svc.group(cards, new Map()).rows.length).toBe(2);
  });

  it('rebuilds when the display choice changes', () => {
    const cards = [card({ id: 'r1', scryfallId: 'a' }), card({ id: 'r2', scryfallId: 'b' })];
    const first = svc.group(cards, new Map());
    expect(svc.group(cards, new Map())).toBe(first);
    expect(svc.group(cards, new Map([['o1', 'r2']]))).not.toBe(first);
  });

  // ---- totals ----------------------------------------------------

  it('reports totals only for cards that are actually grouped', () => {
    const cards = [
      card({ id: 'r1', scryfallId: 'a', quantity: 1 }),
      card({ id: 'r2', scryfallId: 'b', quantity: 2, quantityFoil: 3 }),
    ];
    const { members } = svc.group(cards, new Map());
    expect(svc.totals(members, 'o1')).toEqual({ quantity: 3, quantityFoil: 3 });

    const single = svc.group([card()], new Map());
    expect(svc.totals(single.members, 'o1')).toBeNull();
  });

  // ---- sections --------------------------------------------------

  const creature = (over: Partial<CollectionCardDto>, details: Record<string, unknown> = {}) =>
    card(over, { cardTypes: [CardType.Creature], ...details });
  const land = (over: Partial<CollectionCardDto>, details: Record<string, unknown> = {}) =>
    card(over, { cardTypes: [CardType.Land], ...details });

  it('buckets by mana value, keeps 6+ open-ended, and puts lands last', () => {
    const cards = [
      land({ id: 'l' }, { name: 'Forest' }),
      creature({ id: 'a' }, { name: 'Big', manaValue: 9 }),
      creature({ id: 'b' }, { name: 'Small', manaValue: 1 }),
      creature({ id: 'c' }, { name: 'Also six', manaValue: 6 }),
    ];
    expect(labels(svc, cards, 'cmc')).toEqual(['CMC 1', 'CMC 6+', 'Lands']);
    // A land's mana value never puts it in a CMC bucket, even though it has one.
    expect(svc.sections(cards, 'cmc')[2].cards.map((c) => c.id)).toEqual(['l']);
  });

  it('sorts within a CMC bucket by cost then name', () => {
    const cards = [
      creature({ id: 'z' }, { name: 'Zed', manaValue: 1 }),
      creature({ id: 'a' }, { name: 'Ann', manaValue: 1 }),
    ];
    expect(svc.sections(cards, 'cmc')[0].cards.map((c) => c.id)).toEqual(['a', 'z']);
  });

  it('totals a section by copies owned, not by rows', () => {
    const cards = [creature({ id: 'a', quantity: 2, quantityFoil: 1 }, { manaValue: 1 })];
    expect(svc.sections(cards, 'cmc')[0].totalCount).toBe(3);
  });

  it('puts every card under one heading in name mode, sorted', () => {
    const cards = [card({ id: 'b' }, { name: 'Beta' }), card({ id: 'a' }, { name: 'Alpha' })];
    const [only] = svc.sections(cards, 'name');
    expect(only.label).toBe('All Cards');
    expect(only.cards.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('orders type sections by the deck-list convention and sweeps the rest into Other', () => {
    const cards = [
      land({ id: 'l' }),
      creature({ id: 'c' }),
      card({ id: 'x' }, { cardTypes: [] }),
      card({ id: 'i' }, { cardTypes: [CardType.Instant] }),
    ];
    expect(labels(svc, cards, 'type')).toEqual(['Creatures', 'Instants', 'Lands', 'Other']);
  });

  it('pluralises a type ending in -y correctly', () => {
    // Every other type pluralises with a bare 's', which is why "Sorcerys" survived.
    const cards = [card({ id: 's' }, { cardTypes: [CardType.Sorcery] })];
    expect(labels(svc, cards, 'type')).toEqual(['Sorceries']);
  });

  it('splits creatures, non-creatures and lands, and a land creature counts as a land', () => {
    const cards = [
      card({ id: 'dryad' }, { cardTypes: [CardType.Land, CardType.Creature] }),
      creature({ id: 'c' }),
      card({ id: 'i' }, { cardTypes: [CardType.Instant] }),
    ];
    const sections = svc.sections(cards, 'creature-split');
    expect(sections.map((s) => s.label)).toEqual(['Creatures', 'Non-Creatures', 'Lands']);
    expect(sections[0].cards.map((c) => c.id)).toEqual(['c']);
    expect(sections[2].cards.map((c) => c.id)).toEqual(['dryad']);
  });

  it('groups by the first subtype and sorts Other last', () => {
    const cards = [
      card({ id: 'a' }, { subtypes: ['Zombie'] }),
      card({ id: 'b' }, { subtypes: [] }),
      card({ id: 'c' }, { subtypes: ['Elf', 'Druid'] }),
    ];
    expect(labels(svc, cards, 'subtype')).toEqual(['Elf', 'Zombie', 'Other']);
  });

  it('groups by cast colour from the mana cost, in WUBRG order', () => {
    const cards = [
      card({ id: 'g' }, { manaCost: '{G}' }),
      card({ id: 'w' }, { manaCost: '{W}{W}' }),
      card({ id: 'gold' }, { manaCost: '{W}{U}' }),
      card({ id: 'c' }, { manaCost: '{2}' }),
    ];
    expect(labels(svc, cards, 'color')).toEqual(['White', 'Green', 'Multicolor', 'Colorless']);
  });

  it('groups by colour identity, which differs from cast colour', () => {
    // No coloured pips, but a green identity — the two modes disagree on purpose.
    const cards = [card({ id: 'a' }, { manaCost: '{2}', colorIdentity: [ManaColor.Green] })];
    expect(labels(svc, cards, 'color')).toEqual(['Colorless']);
    expect(labels(svc, cards, 'color-identity')).toEqual(['Green']);
  });

  it('orders rarity by scarcity and appends anything unrecognised', () => {
    const cards = [
      card({ id: 'a' }, { rarity: 'common' }),
      card({ id: 'b' }, { rarity: 'mythic' }),
      card({ id: 'c' }, { rarity: 'promo' }),
    ];
    expect(labels(svc, cards, 'rarity')).toEqual(['Mythic Rare', 'Common', 'promo']);
  });

  it('groups by artist and by set, alphabetically', () => {
    const cards = [
      card({ id: 'a' }, { artist: 'Rebecca Guay', setCode: 'zen' }),
      card({ id: 'b' }, { artist: 'John Avon', setCode: 'ala' }),
    ];
    expect(labels(svc, cards, 'artist')).toEqual(['John Avon', 'Rebecca Guay']);
    expect(labels(svc, cards, 'set')).toEqual(['ALA', 'ZEN']);
  });

  it('memoizes sections on cards identity and mode', () => {
    const cards = [creature({ id: 'a' }, { manaValue: 1 })];
    const first = svc.sections(cards, 'cmc');
    expect(svc.sections(cards, 'cmc')).toBe(first);
    expect(svc.sections(cards, 'type')).not.toBe(first);
    expect(svc.sections([...cards], 'cmc')).not.toBe(first);
  });

  it("does not mutate the caller's array while sectioning", () => {
    const cards = [card({ id: 'b' }, { name: 'Beta' }), card({ id: 'a' }, { name: 'Alpha' })];
    svc.sections(cards, 'name');
    expect(cards.map((c) => c.id)).toEqual(['b', 'a']);
  });
});
