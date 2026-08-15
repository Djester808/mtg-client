import { FilterChip } from './filter-chips.component';

/**
 * The filter vocabulary, in one place. The collection grid and the card search panel had
 * separate copies of these lists under different names; two copies drift, and the chips
 * are meant to mean the same thing on both screens.
 */
export const COLOR_CHIPS: FilterChip[] = [
  { code: 'W', symbol: 'w', title: 'White' },
  { code: 'U', symbol: 'u', title: 'Blue' },
  { code: 'B', symbol: 'b', title: 'Black' },
  { code: 'R', symbol: 'r', title: 'Red' },
  { code: 'G', symbol: 'g', title: 'Green' },
  { code: 'C', symbol: 'c', title: 'Colorless' },
  { code: 'M', symbol: 'multicolor', title: 'Multicolor' },
];

/** The collection grid only owns rows it can classify, so it stops at Planeswalker. */
export const CARD_TYPES = [
  'Creature',
  'Instant',
  'Sorcery',
  'Enchantment',
  'Artifact',
  'Land',
  'Planeswalker',
] as const;

/** Search additionally offers the catch-alls, which no collection row carries. */
export const SEARCH_CARD_TYPES = [...CARD_TYPES, 'Token', 'Other'];

export const TYPE_CHIPS: FilterChip[] = CARD_TYPES.map((t) => ({ code: t, label: t }));

export const SEARCH_TYPE_CHIPS: FilterChip[] = SEARCH_CARD_TYPES.map((t) => ({
  code: t,
  label: t,
}));

export const SORT_CHIPS: FilterChip[] = [
  { code: 'name', label: 'Name' },
  { code: 'cmc', label: 'CMC' },
];

export const CLEAR_CHIPS: FilterChip[] = [{ code: 'clear', label: 'Clear' }];

export const CMC_VALUES = ['0', '1', '2', '3', '4', '5', '6+'] as const;

export type RarityCode = 'common' | 'uncommon' | 'rare' | 'mythic';

export const RARITY_CHIPS: (FilterChip & { code: RarityCode })[] = [
  { code: 'common', label: 'C', rarity: 'common', title: 'Common' },
  { code: 'uncommon', label: 'U', rarity: 'uncommon', title: 'Uncommon' },
  { code: 'rare', label: 'R', rarity: 'rare', title: 'Rare' },
  { code: 'mythic', label: 'M', rarity: 'mythic', title: 'Mythic' },
];

export const CMC_CHIPS: FilterChip[] = CMC_VALUES.map((v) => ({ code: v, label: v }));
