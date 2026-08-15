export type SortBy = 'name' | 'cmc';
export type SortDir = 'asc' | 'desc';

/**
 * The filter vocabulary as plain data — what `CardGridFilterService` takes. `CardFilters`
 * below is the same vocabulary as mutable UI state; this is the snapshot of it, so the
 * rules can be a pure function of their inputs.
 */
export interface CardFilterState {
  query: string;
  colors: ReadonlySet<string>;
  types: ReadonlySet<string>;
  rarities: ReadonlySet<string>;
  cmc: string | null;
  set: string | null;
  sort: SortBy;
  sortDir: SortDir;
}

export const EMPTY_FILTER: CardFilterState = {
  query: '',
  colors: new Set<string>(),
  types: new Set<string>(),
  rarities: new Set<string>(),
  cmc: null,
  set: null,
  sort: 'name',
  sortDir: 'asc',
};

/**
 * The one filter vocabulary: which colours, types, rarities, cost and set are selected,
 * and how the results are ordered.
 *
 * The collection grid and the card search panel each had their own copy of this — same
 * concepts under different names (`fColors` vs `selectedColors`), which meant a fix or a
 * new facet had to be made twice and the two screens quietly disagreed about what a chip
 * meant. Held by composition rather than inheritance so a component can own one without
 * also inheriting a search pipeline it has no use for.
 *
 * Every facet is offered wherever the underlying field exists, rarity included — a
 * collection row carries its printing's rarity, so the grid filters on it like any other.
 */
export class CardFilters {
  query = '';
  readonly colors = new Set<string>();
  readonly types = new Set<string>();
  readonly rarities = new Set<string>();
  cmc: string | null = null;
  set: string | null = null;
  sort: SortBy = 'name';
  sortDir: SortDir = 'asc';

  private static toggleIn(bag: Set<string>, value: string): void {
    if (bag.has(value)) bag.delete(value);
    else bag.add(value);
  }

  toggleColor(code: string): void {
    CardFilters.toggleIn(this.colors, code);
  }

  toggleType(type: string): void {
    CardFilters.toggleIn(this.types, type);
  }

  toggleRarity(rarity: string): void {
    CardFilters.toggleIn(this.rarities, rarity);
  }

  /** Single-select: picking the active value clears it. */
  toggleCmc(value: string): void {
    this.cmc = this.cmc === value ? null : value;
  }

  selectSet(code: string | null): void {
    this.set = code;
  }

  setSort(field: SortBy): void {
    this.sort = field;
  }

  toggleSortDir(): void {
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
  }

  clear(): void {
    this.query = '';
    this.colors.clear();
    this.types.clear();
    this.rarities.clear();
    this.cmc = null;
    this.set = null;
    this.sort = 'name';
    this.sortDir = 'asc';
  }

  get hasAny(): boolean {
    return (
      this.colors.size > 0 ||
      this.types.size > 0 ||
      this.rarities.size > 0 ||
      this.cmc !== null ||
      this.set !== null ||
      !!this.query.trim()
    );
  }

  /** A snapshot for the pure filter service, which takes data and not this object. */
  toState(): CardFilterState {
    return {
      query: this.query,
      colors: this.colors,
      types: this.types,
      rarities: this.rarities,
      cmc: this.cmc,
      set: this.set,
      sort: this.sort,
      sortDir: this.sortDir,
    };
  }

  /** Single-select facets read as one-entry sets, which is what a chip row expects. */
  activeAsSet(value: string | null): ReadonlySet<string> {
    return value === null ? EMPTY_SET : new Set([value]);
  }
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();
