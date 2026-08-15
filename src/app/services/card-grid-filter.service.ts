import { Injectable } from '@angular/core';
import { CollectionCardDto, CardType, ManaColor } from '../models/game.models';
import { CardFilterState } from '../models/card-filters';
import { SelectMenuOption } from '../components/select-menu/select-menu.component';

/**
 * How a grid cuts its cards into labelled sections. The collection grid does not offer
 * sections at all today; the deck grid offers all of these.
 */
export type CardGroupMode =
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

/** A labelled run of cards in a grid — one heading and the cards under it. */
export interface CardSection {
  label: string;
  key: string;
  cards: CollectionCardDto[];
  totalCount: number;
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

function matchesColors(ci: readonly ManaColor[], colors: ReadonlySet<string>): boolean {
  if (colors.size === 0) return true;
  // Multicolor and colorless are cardinality questions, not membership ones.
  if (colors.has('M')) return ci.length >= 2;
  if (colors.has('C')) return ci.length === 0;
  return ci.some((x) => colors.has(x.toUpperCase()));
}

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
      matchesColors(d?.colorIdentity ?? [], s.colors) &&
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
      if (inType.length) sections.push(section(CardType[type] + 's', `type-${type}`, inType));
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
