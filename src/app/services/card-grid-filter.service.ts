import { Injectable } from '@angular/core';
import { CollectionCardDto, CardType, ManaColor } from '../models/game.models';
import { CardFilterState } from '../models/card-filters';
import { SelectMenuOption } from '../components/select-menu/select-menu.component';
import { matchesColorSelection } from '../utils/color-filter';

/**
 * How a grid cuts its cards into labelled sections. Both the deck grid and the collection
 * grid offer all of these.
 */
export type CardGroupMode =
  | 'none'
  | 'cmc'
  | 'name'
  | 'type'
  | 'subtype'
  | 'color'
  | 'color-identity'
  | 'rarity'
  | 'artist'
  | 'set'
  | 'creature-split';

/**
 * The facet values a set of cards actually contains, by chip code. A bar given this offers
 * only chips that would find something — a collection of red cards has no reason to show
 * six colour pips, four rarities and every mana value.
 */
export interface AvailableFacets {
  colors: ReadonlySet<string>;
  types: ReadonlySet<string>;
  rarities: ReadonlySet<string>;
  cmc: ReadonlySet<string>;
}

/** A labelled run of cards in a grid — one heading and the cards under it. */
export interface CardSection {
  label: string;
  key: string;
  cards: CollectionCardDto[];
  totalCount: number;
}

/**
 * The Group By picker's options, in the order they are offered. Lives here beside
 * `sections()` because two grids now show this list, and a mode present in one menu but
 * not the other is a mode the service can produce and a user cannot reach.
 */
export const CARD_GROUP_OPTIONS: SelectMenuOption[] = [
  // Every other mode imposes its own order inside each section, which overrides whatever
  // the Sort chips say. This one keeps the caller's order and draws no headings, so a grid
  // can still be a plain sorted list — the collection's behaviour before it had sections.
  { value: 'none', label: 'No grouping' },
  { value: 'cmc', label: 'CMC' },
  { value: 'type', label: 'Type' },
  { value: 'creature-split', label: 'Creature / Non-Creature' },
  { value: 'name', label: 'Name' },
  { value: 'subtype', label: 'Subtype' },
  { value: 'color', label: 'Color' },
  { value: 'color-identity', label: 'Color Identity' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'artist', label: 'Artist' },
  { value: 'set', label: 'Set' },
];

/**
 * Section heading for a card type. A bare `+ 's'` rendered "Sorcerys" — wrong on the deck
 * for as long as grouping has existed, and now shown on the collection too.
 */
function pluralType(type: CardType): string {
  const name = CardType[type];
  return name.endsWith('y') ? `${name.slice(0, -1)}ies` : `${name}s`;
}

const COLOR_ORDER = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless'];

const RARITY_ORDER = ['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus'];

const RARITY_LABEL: Record<string, string> = {
  mythic: 'Mythic Rare',
  rare: 'Rare',
  uncommon: 'Uncommon',
  common: 'Common',
  special: 'Special',
  bonus: 'Bonus',
};

const TYPE_ORDER: CardType[] = [
  CardType.Creature,
  CardType.Planeswalker,
  CardType.Instant,
  CardType.Sorcery,
  CardType.Enchantment,
  CardType.Artifact,
  CardType.Land,
];

const MANA_COLOR_LABEL: Partial<Record<ManaColor, string>> = {
  [ManaColor.White]: 'White',
  [ManaColor.Blue]: 'Blue',
  [ManaColor.Black]: 'Black',
  [ManaColor.Red]: 'Red',
  [ManaColor.Green]: 'Green',
};

const name = (c: CollectionCardDto): string => c.cardDetails?.name ?? '';
const mv = (c: CollectionCardDto): number => c.cardDetails?.manaValue ?? 0;
const byName = (a: CollectionCardDto, b: CollectionCardDto): number =>
  name(a).localeCompare(name(b));
const byCmcThenName = (a: CollectionCardDto, b: CollectionCardDto): number =>
  mv(a) - mv(b) || byName(a, b);

function isLand(card: CollectionCardDto): boolean {
  return card.cardDetails?.cardTypes?.includes(CardType.Land) ?? false;
}

/** The name box matches on card name or on the oracle id, so an id can be pasted in. */
function matchesQuery(card: CollectionCardDto, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (card.cardDetails?.name.toLowerCase().includes(q) ?? false) ||
    card.oracleId.toLowerCase().includes(q)
  );
}

// Colour matching lives in utils/color-filter.ts — the grid, the commander list, the forum
// list and the server all answer this question, and they used to answer it differently.

function matchesCmc(value: number, cmc: string | null): boolean {
  if (cmc === null) return true;
  return cmc === '6+' ? value >= 6 : value === Number(cmc);
}

function count(card: CollectionCardDto): number {
  return card.quantity + card.quantityFoil;
}

function section(label: string, key: string, cards: CollectionCardDto[]): CardSection {
  return { label, key, cards, totalCount: cards.reduce((s, c) => s + count(c), 0) };
}

/** Groups by a per-card key, preserving first-seen order of the keys. */
function bucket(
  cards: CollectionCardDto[],
  keyOf: (c: CollectionCardDto) => string,
): Map<string, CollectionCardDto[]> {
  const out = new Map<string, CollectionCardDto[]>();
  for (const c of cards) {
    const k = keyOf(c);
    const list = out.get(k);
    if (list) list.push(c);
    else out.set(k, [c]);
  }
  return out;
}

/**
 * Filtering, sorting, same-card folding and section grouping for any grid of
 * `CollectionCardDto` — the collection grid and the deck grid both render one.
 *
 * Pure and memoized by input identity, the same shape as `deck-stats.service.ts`: both
 * grids bind these in a template, so they run on every change-detection pass and must not
 * re-scan the cards each time.
 *
 * It lives here rather than in a component because none of it needs a component — it is a
 * function of (cards, filter state), which is also what makes it testable without a
 * TestBed. It started as the collection's `CollectionFilterService`; the deck's grouping
 * was a private `computeGroups` in a 3000-line component and is now `sections()` below.
 */
@Injectable({ providedIn: 'root' })
export class CardGridFilterService {
  /** Serialises the state for memo comparison; Sets have no useful identity across edits. */
  stateKey(s: CardFilterState): string {
    return [
      s.query.trim().toLowerCase(),
      [...s.colors].sort().join(''),
      [...s.types].sort().join('|'),
      [...s.rarities].sort().join('|'),
      s.cmc ?? '',
      s.set ?? '',
      s.sort,
      s.sortDir,
    ].join('~');
  }

  matches(card: CollectionCardDto, s: CardFilterState): boolean {
    const d = card.cardDetails;
    return (
      matchesQuery(card, s.query) &&
      (!s.set || d?.setCode?.toLowerCase() === s.set) &&
      matchesColorSelection(d?.colorIdentity ?? [], s.colors) &&
      (s.types.size === 0 || (d?.cardTypes ?? []).some((t) => s.types.has(t))) &&
      // A printing with no rarity recorded never matches a rarity filter — it is
      // unknown, not common.
      (s.rarities.size === 0 || s.rarities.has(d?.rarity ?? '')) &&
      matchesCmc(d?.manaValue ?? 0, s.cmc)
    );
  }

  private applyMemo: {
    cards: CollectionCardDto[];
    key: string;
    value: CollectionCardDto[];
  } | null = null;

  /** Matching cards in display order. Memoized on (cards identity, serialised state). */
  apply(cards: CollectionCardDto[], s: CardFilterState): CollectionCardDto[] {
    const key = this.stateKey(s);
    const m = this.applyMemo;
    if (m && m.cards === cards && m.key === key) return m.value;

    const dir = s.sortDir === 'asc' ? 1 : -1;
    const value = cards
      .filter((c) => this.matches(c, s))
      .sort((a, b) => {
        if (s.sort === 'cmc') {
          const d = mv(a) - mv(b);
          if (d !== 0) return d * dir;
        }
        return byName(a, b) * dir;
      });

    this.applyMemo = { cards, key, value };
    return value;
  }

  private groupMemo: {
    cards: CollectionCardDto[];
    choiceKey: string;
    value: { rows: CollectionCardDto[]; members: Map<string, CollectionCardDto[]> };
  } | null = null;

  /**
   * Collapses every copy of one card into a single row whose quantities are the totals.
   *
   * `choice` picks which member is displayed, by row id. A card owned in one set keeps
   * its *original* row object so tile identity (and therefore trackBy, and the DOM) does
   * not churn when grouping is toggled.
   */
  group(
    cards: CollectionCardDto[],
    choice: ReadonlyMap<string, string>,
  ): { rows: CollectionCardDto[]; members: Map<string, CollectionCardDto[]> } {
    const choiceKey = [...choice.entries()].sort().join('|');
    const m = this.groupMemo;
    if (m && m.cards === cards && m.choiceKey === choiceKey) return m.value;

    const members = bucket(cards, (c) => c.oracleId);

    const rows: CollectionCardDto[] = [];
    for (const [oracleId, group] of members) {
      if (group.length === 1) {
        rows.push(group[0]);
        continue;
      }
      const chosen = choice.get(oracleId);
      const display = group.find((r) => r.id === chosen) ?? group[0];
      rows.push({
        ...display,
        quantity: group.reduce((n, r) => n + r.quantity, 0),
        quantityFoil: group.reduce((n, r) => n + r.quantityFoil, 0),
      });
    }

    const value = { rows, members };
    this.groupMemo = { cards, choiceKey, value };
    return value;
  }

  /** Combined copies for a grouped card, or null when it is not grouped. */
  totals(
    members: ReadonlyMap<string, CollectionCardDto[]>,
    oracleId: string,
  ): { quantity: number; quantityFoil: number } | null {
    const rows = members.get(oracleId);
    if (!rows || rows.length < 2) return null;
    return {
      quantity: rows.reduce((n, r) => n + r.quantity, 0),
      quantityFoil: rows.reduce((n, r) => n + r.quantityFoil, 0),
    };
  }

  private setOptionsMemo: { cards: CollectionCardDto[]; value: SelectMenuOption[] } | null = null;

  /**
   * The sets represented in these cards, for the bar's Set picker. Offering a set you own
   * nothing from is noise, so the list is derived from the cards rather than from the
   * whole of Scryfall. Memoized — the bar binds it.
   */
  setOptions(cards: CollectionCardDto[]): SelectMenuOption[] {
    const m = this.setOptionsMemo;
    if (m && m.cards === cards) return m.value;

    const seen = new Map<string, string>();
    for (const c of cards) {
      const code = c.cardDetails?.setCode;
      if (code) seen.set(code.toLowerCase(), code.toUpperCase());
    }
    const value: SelectMenuOption[] = [
      { value: '__all', label: 'All Sets' },
      ...[...seen.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([lower, upper]) => ({ value: lower, label: upper, iconCode: lower })),
    ];

    this.setOptionsMemo = { cards, value };
    return value;
  }

  private facetsMemo: { cards: CollectionCardDto[]; value: AvailableFacets } | null = null;

  /**
   * Which facet values these cards actually contain, so the bar can offer only the chips
   * that would find something. Same idea as `setOptions` above, and memoized the same way.
   *
   * Two things this deliberately is not:
   *
   * A colour counts as present when *any* card's identity includes it, not when the pip
   * alone would match. Colour filtering means "within these colours", so in a pool of only
   * Boros cards neither R nor W matches on its own — testing that way would hide both pips
   * and leave the R+W combination that does match unreachable.
   *
   * And the caller must pass the *unfiltered* pool. Deriving this from the filtered result
   * would delete the chip you just used as soon as you used it, leaving no way to undo it.
   */
  facetsPresent(cards: CollectionCardDto[]): AvailableFacets {
    const m = this.facetsMemo;
    if (m && m.cards === cards) return m.value;

    const colors = new Set<string>();
    const types = new Set<string>();
    const rarities = new Set<string>();
    const cmc = new Set<string>();

    for (const c of cards) {
      const d = c.cardDetails;
      if (!d) continue;

      const identity = d.colorIdentity ?? [];
      for (const colour of identity) colors.add(String(colour).toUpperCase());
      // The two pseudo-pips are cardinality questions, so they are counted, not collected.
      if (identity.length === 0) colors.add('C');
      if (identity.length >= 2) colors.add('M');

      for (const t of d.cardTypes ?? []) types.add(String(t));
      if (d.rarity) rarities.add(d.rarity);
      // Matches `matchesCmc`, which buckets everything from six upwards into "6+".
      const mv = d.manaValue ?? 0;
      cmc.add(mv >= 6 ? '6+' : String(mv));
    }

    const value: AvailableFacets = { colors, types, rarities, cmc };
    this.facetsMemo = { cards, value };
    return value;
  }

  private sectionsMemo: {
    cards: CollectionCardDto[];
    mode: CardGroupMode;
    value: CardSection[];
  } | null = null;

  /**
   * Cuts already-filtered cards into the labelled sections a grid renders.
   *
   * Memoized on (cards identity, mode). The caller's `cards` array must itself be stable
   * — the deck's `filteredCards` is memoized on (deck, board, query), so a change to any
   * of those produces a new array and re-cuts these sections, and nothing else does.
   */
  sections(cards: CollectionCardDto[], mode: CardGroupMode): CardSection[] {
    const m = this.sectionsMemo;
    if (m && m.cards === cards && m.mode === mode) return m.value;

    const value = this.computeSections(cards, mode);
    this.sectionsMemo = { cards, mode, value };
    return value;
  }

  private computeSections(cards: CollectionCardDto[], mode: CardGroupMode): CardSection[] {
    switch (mode) {
      case 'none':
        // Untouched order — the caller has already sorted, and re-sorting here is what
        // makes the Sort control look broken.
        return [section('', 'none', cards)];
      case 'name':
        return [section('All Cards', 'all', [...cards].sort(byName))];
      case 'type':
        return this.byType(cards);
      case 'subtype':
        return this.bySubtype(cards);
      case 'color':
        return this.byColor(
          cards,
          (c) => {
            const pips = new Set(
              [...(c.cardDetails?.manaCost ?? '')].filter((ch) => 'WUBRG'.includes(ch)),
            );
            if (pips.size === 0) return 'Colorless';
            if (pips.size > 1) return 'Multicolor';
            if (pips.has('W')) return 'White';
            if (pips.has('U')) return 'Blue';
            if (pips.has('B')) return 'Black';
            if (pips.has('R')) return 'Red';
            return 'Green';
          },
          'color',
        );
      case 'color-identity':
        return this.byColor(
          cards,
          (c) => {
            const ci = c.cardDetails?.colorIdentity ?? [];
            if (ci.length === 0) return 'Colorless';
            if (ci.length > 1) return 'Multicolor';
            return MANA_COLOR_LABEL[ci[0]] ?? 'Colorless';
          },
          'ci',
        );
      case 'rarity':
        return this.byRarity(cards);
      case 'artist':
        return this.bySortedKey(cards, (c) => c.cardDetails?.artist ?? 'Unknown', 'artist');
      case 'set':
        return this.bySortedKey(
          cards,
          (c) => (c.cardDetails?.setCode ?? 'unknown').toUpperCase(),
          'set',
        );
      case 'creature-split':
        return this.byCreatureSplit(cards);
      default:
        return this.byCmc(cards);
    }
  }

  private byType(cards: CollectionCardDto[]): CardSection[] {
    const sections: CardSection[] = [];
    for (const type of TYPE_ORDER) {
      const inType = cards
        .filter((c) => c.cardDetails?.cardTypes?.includes(type))
        .sort(byCmcThenName);
      if (inType.length) sections.push(section(pluralType(type), `type-${type}`, inType));
    }
    // A card with no type we order by (or none at all) still has to land somewhere.
    const typed = new Set(sections.flatMap((g) => g.cards.map((c) => c.id)));
    const rest = cards.filter((c) => !typed.has(c.id));
    if (rest.length) sections.push(section('Other', 'type-other', rest));
    return sections;
  }

  private bySubtype(cards: CollectionCardDto[]): CardSection[] {
    const buckets = bucket(cards, (c) => c.cardDetails?.subtypes?.[0] ?? 'Other');
    return [...buckets.keys()]
      .sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))
      .map((key) => section(key, `subtype-${key}`, buckets.get(key)!));
  }

  private byColor(
    cards: CollectionCardDto[],
    labelOf: (c: CollectionCardDto) => string,
    keyPrefix: string,
  ): CardSection[] {
    const buckets = bucket(cards, labelOf);
    return COLOR_ORDER.filter((label) => (buckets.get(label)?.length ?? 0) > 0).map((label) =>
      section(label, `${keyPrefix}-${label}`, buckets.get(label)!),
    );
  }

  private byRarity(cards: CollectionCardDto[]): CardSection[] {
    const buckets = bucket(cards, (c) => c.cardDetails?.rarity ?? 'unknown');
    const known = RARITY_ORDER.filter((r) => buckets.has(r));
    const other = [...buckets.keys()].filter((r) => !RARITY_ORDER.includes(r)).sort();
    return [...known, ...other].map((r) =>
      section(RARITY_LABEL[r] ?? r, `rarity-${r}`, buckets.get(r)!),
    );
  }

  private bySortedKey(
    cards: CollectionCardDto[],
    keyOf: (c: CollectionCardDto) => string,
    keyPrefix: string,
  ): CardSection[] {
    const buckets = bucket(cards, keyOf);
    return [...buckets.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((key) => section(key, `${keyPrefix}-${key}`, buckets.get(key)!));
  }

  private byCreatureSplit(cards: CollectionCardDto[]): CardSection[] {
    const creatures = cards
      .filter((c) => c.cardDetails?.cardTypes?.includes(CardType.Creature) && !isLand(c))
      .sort(byCmcThenName);
    const nonCreatures = cards
      .filter((c) => !c.cardDetails?.cardTypes?.includes(CardType.Creature) && !isLand(c))
      .sort(byCmcThenName);
    const lands = cards.filter(isLand).sort(byName);

    const sections: CardSection[] = [];
    if (creatures.length) sections.push(section('Creatures', 'split-creatures', creatures));
    if (nonCreatures.length)
      sections.push(section('Non-Creatures', 'split-noncreatures', nonCreatures));
    if (lands.length) sections.push(section('Lands', 'split-lands', lands));
    return sections;
  }

  private byCmc(cards: CollectionCardDto[]): CardSection[] {
    const nonLands = cards.filter((c) => !isLand(c)).sort(byCmcThenName);
    const lands = cards.filter(isLand).sort(byName);

    const buckets = bucket(nonLands, (c) => (mv(c) >= 6 ? '6+' : String(mv(c))));
    const sections: CardSection[] = [];
    for (const key of ['0', '1', '2', '3', '4', '5', '6+']) {
      const inBucket = buckets.get(key);
      if (inBucket?.length)
        sections.push(section(key === '6+' ? 'CMC 6+' : `CMC ${key}`, `cmc-${key}`, inBucket));
    }
    if (lands.length) sections.push(section('Lands', 'lands', lands));
    return sections;
  }
}
